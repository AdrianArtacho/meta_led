const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const codePaths = {
  'tesserpipe-launch.js': path.join(__dirname, '../meta_led/patchers/tesserpipe-launch.js'),
  'tesserpipe-config.js': path.join(__dirname, '../tesser_pipe/tesser_pipe/code/tesserpipe-config.js')
};

function harness(options = {}) {
  const clock = { now: 100000, tasks: [] };
  const state = { opened: 0, port: 7400, device: 'old device', status: '', sent: [], loaded: false };
  const fields = { 'textedit[7]': ['7402'], 'pipe-midi-output-name': ['APC Key 25'] };
  const devices = options.devices || ['APC Key 25', 'Launchpad Mini MK3 LPMiniMK3 MIDI In'];
  function later(fn, delay) { clock.tasks.push({ due: clock.now + delay, fn }); }
  function runtime(filename, output) {
    let ctx;
    const sandbox = {
      jsarguments: [filename, 1234], inlet: 0, messagename: '', Date: { now: () => clock.now },
      arrayfromargs: a => Array.from(a), outlet: (n, v) => output(n, Array.isArray(v) ? Array.from(v) : v),
      patcher: { getnamed: name => fields[name] === undefined ? null : { getvalueof: () => vm.runInContext(JSON.stringify(fields[name]), ctx) } },
      Task: function(fn, owner) {
        const task = { due: null, fn: () => fn.call(owner) }; clock.tasks.push(task);
        this.schedule = delay => { task.due = clock.now + delay; };
        this.cancel = () => { task.due = null; };
        this.freepeer = () => { task.due = null; task.freed = true; };
      }
    };
    ctx = vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(codePaths[filename], 'utf8'), ctx);
    return ctx;
  }
  let client, server;
  function dispatch(ctx, msg, inlet = 0) {
    ctx.inlet = inlet; ctx.messagename = msg[0];
    (typeof ctx[msg[0]] === 'function' ? ctx[msg[0]] : ctx.anything).apply(ctx, msg.slice(1));
  }
  const dropped = {};
  function packet(direction, msg) {
    state.sent.push([direction, msg]);
    const key = direction + ':' + msg[0];
    if ((options.drop || []).includes(key) && !dropped[key]) { dropped[key] = true; return; }
    later(() => {
      if (direction === 'request') { if (state.loaded) dispatch(server, msg); }
      else dispatch(client, msg);
    }, 1);
  }
  function load() { if (!state.loaded) { state.loaded = true; server.loadbang(); } }
  server = runtime('tesserpipe-config.js', (n, v) => {
    if (n === 0) packet('reply', v);
    if (n === 1) state.port = v;
    if (n === 2) { assert.equal(v[0], 'port'); state.device = v[1]; }
    if (n === 3) {
      dispatch(server, ['clear'], 1);
      for (const d of devices) dispatch(server, ['append', d], 1);
      server.inlet = 0;
    }
  });
  client = runtime('tesserpipe-launch.js', (n, v) => {
    if (n === 0) packet('request', v);
    if (n === 1) state.status = v[1];
    if (n === 2) { state.opened++; if (!options.neverLoad) later(load, options.loadDelay || 0); }
    if (n === 3) state.refreshed = true;
  });
  function advance(ms) {
    const end = clock.now + ms;
    let iterations = 0;
    while (true) {
      const next = clock.tasks.filter(t => t.due !== null && t.due <= end).sort((a, b) => a.due - b.due)[0];
      if (!next) break;
      assert.ok(++iterations < 10000, 'timer loop');
      clock.now = next.due; next.due = null; next.fn();
    }
    clock.now = end;
  }
  return { state, fields, client, server, advance, load, dispatch };
}

let count = 0;
function test(name, fn) { fn(); count++; console.log('PASS', name); }
function configured(h, port = 7402, device = 'APC Key 25') {
  assert.equal(h.state.port, port); assert.equal(h.state.device, device);
  assert.equal(h.state.status, `PIPE configured: UDP ${port} → ${device}`);
  assert.equal(h.client.pending, null);
}

test('cold launch waits for readiness and applies both saved settings', () => {
  const h = harness({ loadDelay: 2750 }); h.client.start(); h.advance(5000); configured(h);
  assert.equal(h.state.opened, 1); assert.equal(h.state.refreshed, true);
  assert.ok(h.state.sent.filter(x => x[1][0] === '/tesserpipe/hello').length > 1);
});
test('already-running Pipe accepts a new port, including above old UI limit', () => {
  const h = harness(); h.load(); h.advance(0); h.fields['textedit[7]'] = '60000';
  h.client.start(); h.advance(100); configured(h, 60000);
});
test('lost hello, ready, configure and acknowledgement are retried', () => {
  const h = harness({drop:['request:/tesserpipe/hello','reply:/tesserpipe/ready','request:/tesserpipe/configure','reply:/tesserpipe/configured']});
  h.client.start(); h.advance(6000); configured(h);
  const sent = h.state.sent.length; h.advance(10000); assert.equal(h.state.sent.length, sent);
});
test('missing MIDI device reports failure without changing either setting', () => {
  const h = harness({devices:['different controller']}); h.client.start(); h.advance(1000);
  assert.match(h.state.status, /MIDI output not found/); assert.equal(h.state.port, 7400); assert.equal(h.state.device, 'old device');
  assert.equal(h.client.pending, null);
});
test('invalid, empty and reserved UDP ports never launch', () => {
  for (const value of ['', '0', '7402x', '1.5', '65536', '-2', '7410', '7411']) {
    const h = harness(); h.fields['textedit[7]'] = value; h.client.start(); h.advance(1000);
    assert.equal(h.state.opened, 0); assert.match(h.state.status, /enter a UDP port/);
  }
});
test('missing and multiline MIDI names never launch', () => {
  for (const value of ['', 'APC\nKey 25']) {
    const h = harness(); h.fields['pipe-midi-output-name'] = value; h.client.start(); assert.equal(h.state.opened, 0);
  }
});
test('device names preserve spaces and Unicode; quoted saved names are accepted', () => {
  const device = 'Controller Ω Key 25'; const h = harness({devices:[device]});
  h.fields['pipe-midi-output-name'] = ['"' + device + '"']; h.client.start(); h.advance(1000); configured(h,7402,device);
});
test('late replies from an earlier click cannot complete a newer request', () => {
  const h = harness({loadDelay:2500}); h.client.start(); const token=h.client.pending.token;
  h.fields['textedit[7]']='7500'; h.client.start();
  h.dispatch(h.client,['/tesserpipe/configured',token,7402,'APC Key 25']);
  assert.notEqual(h.client.pending, null); h.advance(4000); configured(h,7500);
});
test('no receiver times out and stops retrying', () => {
  const h=harness({neverLoad:true});h.client.start();h.advance(31000);
  assert.match(h.state.status,/no reply/);assert.equal(h.client.pending,null);
  const sent=h.state.sent.length;h.advance(5000);assert.equal(h.state.sent.length,sent);
});
test('receiver ignores unrelated traffic and rejects malformed setup', () => {
  const h=harness();h.load();h.advance(0);
  for (const msg of [['NOTE',36,127],['/tesserpipe/configure','token',7410,'APC Key 25'],['/tesserpipe/configure','token',7402,123]]) h.dispatch(h.server,msg);
  assert.equal(h.state.port,7400);assert.equal(h.state.device,'old device');
});
test('closing the launcher cancels retries', () => {
  const h=harness({neverLoad:true});h.client.start();h.client.notifydeleted();
  const sent=h.state.sent.length;h.advance(5000);assert.equal(h.state.sent.length,sent);
});
console.log(`${count} protocol tests passed`);
