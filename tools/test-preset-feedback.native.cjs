// Extract the real patch paths into a private Max fixture. No hardware MIDI
// endpoints, sheet downloads, shell commands, or user dictionaries are loaded.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
if(process.argv[2]==='--verify'){
 const dir=path.resolve(process.argv[3]),r=JSON.parse(fs.readFileSync(path.join(dir,'report.json')));
 assert.equal(r.complete,true);
 const event=(phase,inlet)=>r.events.filter(e=>e.phase===phase&&e.inlet===inlet).map(e=>e.atoms);
 const notes=phase=>event(phase,2);
 const expect=(phase,expected)=>assert.deepEqual(notes(phase),expected,phase);
 expect('before-layout',[]);
 expect('layout-ready',[['NOTE',32,5],['NOTE',33,0]]);
 expect('first',[['NOTE',32,5]]);expect('first-again',[['NOTE',32,5]]);
 expect('row-end',[['NOTE',39,5]]);expect('next-row',[['NOTE',24,5]]);expect('last',[['NOTE',7,5]]);
 expect('remove-first',[['NOTE',32,0]]);expect('remove-again',[['NOTE',32,0]]);
 expect('outside',[]);expect('other-cc',[]);
 assert.deepEqual(event('first',1),[['setcell',1,5,1]]);
 assert.deepEqual(event('row-end',1),[['setcell',8,5,1]]);
 assert.deepEqual(event('next-row',1),[['setcell',1,4,1]]);
 assert.deepEqual(event('last',1),[['setcell',8,1,1]]);
 assert.deepEqual(event('outside',1),[]);
 const full=notes('snapshot');assert.equal(full.length,40);
 for(let i=0;i<40;i++) assert.deepEqual(full[i],['NOTE',(4-Math.floor(i/8))*8+i%8,i<7?5:0]);
 assert.deepEqual(notes('snapshot-again'),full,'full resync must resend unchanged states');
 assert.deepEqual(event('live-press',4),[[32,1]],'live press remains independent of occupied highlight');
 expect('feedback-while-pressed',[['NOTE',33,5]]);
 assert.deepEqual(event('live-release',4),[[32,0]],'live release remains independent of feedback');
 expect('trigger-first',[['NOTE',32,1]]);
 expect('trigger-next',[['NOTE',32,5],['NOTE',33,1]]);
 const clear=notes('clear');assert.equal(clear.length,40);assert.ok(clear.every(x=>x[2]===0));
 expect('trigger-after-clear',[['NOTE',33,0],['NOTE',34,1]]);
 for(const phase of ['first','first-again','row-end','next-row','last','remove-first','remove-again','snapshot','snapshot-again','clear']){
  assert.deepEqual(event(phase,3),notes(phase).map(x=>x.slice(1)),'UDP / Pipe MIDI formatting: '+phase);
 }
 // Check a different parameterized grid without APC-specific arithmetic.
 assert.deepEqual(event('generic',1).filter(x=>x[0]==='setcell'),[['setcell',1,2,1],['setcell',3,2,1],['setcell',1,1,1],['setcell',3,1,0]]);
 expect('generic',[['NOTE',34,0],['NOTE',32,5],['NOTE',34,5],['NOTE',24,5],['NOTE',26,0]]);
 const cells=phase=>event(phase,1).filter(x=>x[0]==='setcell');
 for(const [phase,c,rows] of [['generic',3,2],['grow',16,8],['one-column',1,64],['one-row',64,1]])assert.deepEqual(r.sizes[phase],[c,rows,c,rows],'actual grid dimensions: '+phase);
 expect('latent',[]);expect('hidden-empty',[]);
 assert.deepEqual(cells('grow'),[['setcell',1,8,1],['setcell',3,8,1],['setcell',4,8,1],['setcell',6,8,0],['setcell',16,5,1],['setcell',16,1,1]]);
 assert.ok(notes('grow').some(x=>x[1]===127&&x[2]===5));
 assert.ok(notes('grow-again').some(x=>x[1]===127&&x[2]===0));
 assert.ok(notes('grow-again').some(x=>x[1]===63&&x[2]===5));
 assert.deepEqual(cells('one-column'),[['setcell',1,64,1],['setcell',1,62,1],['setcell',1,61,1],['setcell',1,59,0],['setcell',1,1,1]]);
 assert.deepEqual(cells('one-row'),[['setcell',1,1,1],['setcell',3,1,1],['setcell',4,1,1],['setcell',6,1,0],['setcell',64,1,1]]);
 for(const phase of ['grow','shrink','grow-again','one-column','one-row','resize-held']){assert.deepEqual(event(phase,4),[],'resize must not emit button actions: '+phase);assert.deepEqual(event(phase,5),[],'resize must not emit preset selections: '+phase);}
 assert.deepEqual(event('last-physical',5),[[64]]);
 assert.deepEqual(event('outside-physical',4),[]);assert.deepEqual(event('outside-physical',5),[]);
 assert.deepEqual(event('press-after-resize',5),[[1]]);
 console.log('PASS native Max: raw CC44/45, 128-slot snapshots, all 40 APC pads, bounds, row inversion, repeats/resync, early feedback replay, independent live presses, trigger restoration, clear, generic grid sizes, arbitrary size changes, retained hidden slots, 1×64/64×1 grids, guarded physical inputs, press-state resets, and UDP → Pipe → MIDI decoding.');
 process.exit(0);
}
const source=path.resolve(process.argv[2]),pipeSource=path.resolve(process.argv[3]),out=path.resolve(process.argv[4]);fs.mkdirSync(out,{recursive:true});
const p=JSON.parse(fs.readFileSync(source)).patcher;
const ids=new Set(['obj-25','obj-148','obj-74','obj-286','obj-203','obj-180','obj-234','obj-142','obj-98','obj-19','obj-134','obj-255','obj-256','obj-3','obj-177','obj-36','obj-158','obj-156','obj-154','preset-replay','obj-166','obj-34','obj-167','obj-172','obj-173','obj-174','obj-168','grid-action-gate','grid-led-observer','grid-reset','grid-reset-receive','grid-reset-display','obj-138','obj-227','obj-5','obj-94','obj-107','obj-37','obj-145']);
const boxes=p.boxes.filter(x=>ids.has(x.box.id)),lines=p.lines.filter(x=>ids.has(x.patchline.source[0])&&ids.has(x.patchline.destination[0]));
const ns='preset_test_'+Date.now()+'_';
function isolate(p){for(const {box:b} of p.boxes){
 if(b.text){b.text=b.text.replace(/---/g,ns);if(/^coll /.test(b.text)&&!b.text.startsWith('coll '+ns))b.text=b.text.replace(/^coll /,'coll '+ns);}
 if(b.patcher)isolate(b.patcher);
}}
isolate({boxes});
for(const {box:b} of boxes){b.varname=b.id;delete b.presentation;delete b.presentation_rect;if(b.maxclass.startsWith('live.')){b.parameter_enable=0;delete b.saved_attribute_attributes;}}
function obj(id,text,x,y,extra={}){return{box:{id,maxclass:'newobj',text,varname:id,patching_rect:[x,y,250,22],...extra}};}
function wire(s,so,d,di=0){return{patchline:{source:[s,so],destination:[d,di]}};}
boxes.push(obj('driver','js feedback-driver.js',20,20),obj('cols','send '+ns+'size-cols',20,70),obj('rows','send '+ns+'size-rows',280,70),obj('layout','coll '+ns+'symbolic-layout',20,110));
boxes.push(obj('color','int 5',540,70),obj('trigger-input','t l',800,70),obj('physical-input','t l',800,110));lines.push(wire('color',0,'obj-19',1),wire('trigger-input',0,'obj-158'),wire('physical-input',0,'obj-37'),wire('obj-177',0,'obj-94'));
// Copy the Pipe's actual NOTE decoder and MIDI formatter, replacing its
// hardware midiout with a parser and report sink. UDP uses a private test port.
const pipe=JSON.parse(fs.readFileSync(pipeSource)).patcher;
const port=40000+Math.floor(Math.random()*10000);
boxes.push(obj('udp-send','udpsend 127.0.0.1 '+port,20,150),obj('udp-receive','udpreceive '+port+' @defer 1',280,150),obj('midi-decoded','midiparse',540,150));
for(const id of ['obj-33','obj-66','obj-24']){const b=structuredClone(pipe.boxes.find(x=>x.box.id===id).box);b.id='pipe-'+id;b.varname=b.id;boxes.push({box:b});}
lines.push(wire('obj-3',0,'udp-send'),wire('udp-receive',0,'pipe-obj-33'),wire('pipe-obj-33',0,'pipe-obj-66'),wire('pipe-obj-66',0,'pipe-obj-24'),wire('pipe-obj-24',0,'midi-decoded'));
for(const [id,output,inlet] of [['obj-25',2,0],['obj-234',0,1],['obj-3',0,2],['midi-decoded',0,3],['obj-177',1,4],['obj-107',0,5],['obj-37',0,6],['obj-36',1,7]])lines.push(wire(id,output,'driver',inlet));
fs.writeFileSync(path.join(out,'feedback-test.maxpat'),JSON.stringify({patcher:{fileversion:1,rect:[100,100,1100,700],boxes,lines}}));
fs.copyFileSync(path.join(path.dirname(source),'preset-grid-state.js'),path.join(out,'preset-grid-state.js'));
const layout=p.boxes.find(x=>x.box.id==='obj-101').box.data;
fs.writeFileSync(path.join(out,'feedback-driver.js'),`
inlets=8;outlets=0;var phase='startup',task,report={complete:false,events:[],sizes:{}},steps=[],cursor=0;
function o(id){return this.patcher.getnamed(id);}function send(id,a){if(typeof a[0]==='number'&&a.length>1)a=['list'].concat(a);o(id).message.apply(o(id),a);}
function cc(n,v){send('obj-25',[176]);send('obj-25',[n]);send('obj-25',[v]);}
function size(c,r){send('cols',[c]);send('rows',[r]);}
function matrixLayout(c,r){send('obj-166',['clear']);send('layout',['clear']);for(var i=0;i<128;i++)if(i<c*r)send('obj-166',['store',String(i),i%c+1,Math.floor(i/c)+1]);send('obj-166',['dump']);}
function snapshot(){for(var i=0;i<128;i++)cc((i<7||i>125)?44:45,i);}
function loadbang(){task=new Task(start,this);task.schedule(600);}
function start(){size(8,5);send('color',[5]);send('obj-142',['clear']);send('obj-36',['clear']);
 steps=[['before-layout',function(){cc(44,0);cc(45,1);}],['layout-ready',function(){var layout=${JSON.stringify(layout)};for(var key in layout){var a=layout[key];send('obj-166',['store',String(key)].concat(a instanceof Array?a:[a]));}send('obj-166',['dump']);}],
 ['first',function(){cc(44,0);}],['first-again',function(){cc(44,0);}],['row-end',function(){cc(44,7);}],['next-row',function(){cc(44,8);}],['last',function(){cc(44,39);}],['remove-first',function(){cc(45,0);}],['remove-again',function(){cc(45,0);}],
 ['outside',function(){cc(44,40);cc(45,127);send('obj-148',[44,-1]);send('obj-148',[45,128]);}],['other-cc',function(){cc(43,0);cc(46,1);}],['snapshot',snapshot],['snapshot-again',snapshot],
 ['live-press',function(){send('obj-36',['setcell',1,5,1]);}],['feedback-while-pressed',function(){cc(44,1);}],['live-release',function(){send('obj-36',['setcell',1,5,0]);}],
 ['trigger-first',function(){send('trigger-input',[32,1]);}],['trigger-next',function(){send('trigger-input',[33,1]);}],['clear',function(){send('obj-154',['bang']);}],['trigger-after-clear',function(){send('trigger-input',[34,1]);}],
 ['generic',function(){size(3,2);cc(44,0);cc(44,2);cc(44,3);cc(45,5);}],
 ['latent',function(){cc(44,63);cc(44,127);}],
 ['layout-large',function(){matrixLayout(16,8);}],
 ['grow',function(){size(16,8);}],
 ['shrink',function(){size(3,2);}],
 ['hidden-empty',function(){cc(45,127);}],
 ['grow-again',function(){size(16,8);}],
 ['layout-column',function(){matrixLayout(1,64);}],
 ['one-column',function(){size(1,64);}],
 ['layout-row',function(){matrixLayout(64,1);}],
 ['one-row',function(){size(64,1);}],
 ['last-physical',function(){send('physical-input',[64,1,1]);}],
 ['outside-physical',function(){send('physical-input',[65,1,1]);send('physical-input',[1,2,1]);}],
 ['resize-held',function(){size(3,2);}],
 ['press-after-resize',function(){send('physical-input',[1,1,1]);}]];
 task=new Task(next,this);next();}
function next(){if(cursor>0)report.sizes[phase]=[o('obj-36').getattr('columns'),o('obj-36').getattr('rows'),o('obj-142').getattr('columns'),o('obj-142').getattr('rows')];if(cursor===steps.length){report.complete=true;var f=new File(${JSON.stringify(path.join(out,'report.json'))},'write');f.eof=0;var text=JSON.stringify(report);for(var pos=0;pos<text.length;pos+=4096)f.writestring(text.slice(pos,pos+4096));f.close();return;}phase=steps[cursor][0];steps[cursor++][1]();task.schedule(100);}
function list(){report.events.push({phase:phase,inlet:inlet,atoms:arrayfromargs(arguments)});}function anything(){report.events.push({phase:phase,inlet:inlet,atoms:[messagename].concat(arrayfromargs(arguments))});}function msg_int(n){report.events.push({phase:phase,inlet:inlet,atoms:[n]});}
`);
console.log(path.join(out,'feedback-test.maxpat'));
