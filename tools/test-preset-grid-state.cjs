const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const script=fs.readFileSync(path.join(__dirname,'../meta_led/patchers/preset-grid-state.js'),'utf8');
function harness(){
 let task,ctx;const events=[];let layout=(x,y)=>(y-1)*8+x-1;
 function call(inlet,name,...args){const old=ctx.inlet;ctx.inlet=inlet;ctx[name](...args);ctx.inlet=old;}
 ctx=vm.createContext({inlet:0,messagename:'',arrayfromargs:a=>Array.from(a),
  Task:function(fn,owner){task={pending:false,run:()=>fn.call(owner)};this.schedule=()=>task.pending=true;this.cancel=()=>task.pending=false;this.freepeer=()=>{};},
  outlet:(n,value)=>{
   const v=Array.isArray(value)?Array.from(value):value;events.push([n,v]);
   if(n===3){const [x,y]=v[1].split('-').map(Number),note=layout(x,y);if(note!==undefined)call(1,'msg_int',note);}
   if(n===1)call(5,'list',v[0],v[1]*5);
  }});
 vm.runInContext(script,ctx);
 const flush=()=>{if(task.pending){task.pending=false;task.run();}};
 const size=(c,r)=>{call(2,'msg_int',c);call(3,'msg_int',r);flush();};
 const ready=()=>{call(4,'replay');flush();};
 return {ctx,events,call,flush,size,ready,layout:fn=>layout=fn,reset:()=>events.splice(0),of:n=>events.filter(e=>e[0]===n).map(e=>e[1])};
}
let count=0;function test(name,fn){fn();console.log('PASS',name);count++;}
test('cache identity survives shrinking, growth and out-of-view empty updates',()=>{
 const h=harness();h.size(8,5);h.ready();h.call(0,'list',0,1);h.call(0,'list',39,1);h.call(0,'list',63,1);h.call(0,'list',127,1);
 h.layout((x,y)=>(y-1)*16+x-1);h.reset();h.size(16,8);
 assert.deepEqual(h.of(0).filter(x=>Array.isArray(x)&&x[0]==='setcell'),[['setcell',1,8,1],['setcell',8,6,1],['setcell',16,5,1],['setcell',16,1,1]]);
 assert.ok(h.of(1).some(x=>x[0]===127&&x[1]===1));
 h.size(3,2);h.call(0,'list',127,0);h.reset();h.size(16,8);assert.ok(h.of(1).some(x=>x[0]===127&&x[1]===0));
});
test('dimension pair is coalesced and stale LED notes are cleared before repaint',()=>{
 const h=harness();h.size(8,5);h.ready();h.call(0,'list',8,1);h.call(5,'list',120,1);h.reset();
 h.call(2,'msg_int',3);h.call(3,'msg_int',4);assert.deepEqual(h.of(2),[]);h.flush();
 assert.deepEqual(h.of(2),['clear',['columns',3],['rows',4]]);
 const notes=h.of(1);assert.deepEqual(notes.slice(0,2),[[8,0],[120,0]]);assert.deepEqual(notes.at(-1),[18,1]);
 assert.equal(h.of(5).length,1);assert.equal(h.of(4).at(-1),1);
});
test('rapid feedback during resize is cached and rendered with the final shape',()=>{
 const h=harness();h.size(8,5);h.ready();h.reset();h.call(2,'msg_int',4);h.call(0,'list',5,1);h.call(3,'msg_int',3);h.flush();
 assert.deepEqual(h.of(0).filter(x=>Array.isArray(x)&&x[0]==='setcell'),[['setcell',2,2,1]]);
});
test('early feedback, sparse layouts and layout replacement do not reuse old notes',()=>{
 const h=harness();h.size(2,2);h.call(0,'list',0,1);h.call(0,'list',1,1);assert.deepEqual(h.of(1),[]);
 h.layout(x=>x===1?70:undefined);h.ready();assert.deepEqual(h.of(1),[[70,1]]);
 h.layout(x=>x===1?12:undefined);h.reset();h.ready();assert.deepEqual(h.of(1),[[70,0],[12,1]]);
});
test('same-size updates do not reset live state; explicit replay still resynchronizes',()=>{
 const h=harness();h.size(8,5);h.ready();h.call(0,'list',0,1);h.reset();h.size(8,5);assert.deepEqual(h.events,[]);
 h.ready();assert.deepEqual(h.of(1),[[0,0],[0,1]]);
});
test('clear prevents erased highlights from returning after a resize',()=>{
 const h=harness();h.size(8,5);h.ready();h.call(0,'list',0,1);h.call(0,'list',127,1);h.call(4,'clear');h.reset();h.size(16,8);
 assert.equal(h.of(0).filter(x=>Array.isArray(x)&&x[0]==='setcell').length,0);assert.ok(h.of(1).every(x=>x[1]===0));
});
test('one-row, one-column and larger-than-128-cell grids keep top-first numbering',()=>{
 for(const [c,r] of [[1,1],[1,64],[64,1],[7,9],[16,16],[3,2]]){
  const h=harness();h.layout(()=>undefined);h.size(c,r);h.ready();h.reset();
  for(let i=0;i<128;i++)h.call(0,'list',i,i%2);
  const cells=h.of(0);assert.equal(cells.length,Math.min(128,c*r));
  cells.forEach((a,i)=>assert.deepEqual(a,['setcell',i%c+1,r-Math.floor(i/c),i%2]));
 }
});
test('invalid dimensions and malformed feedback preserve state without division by zero',()=>{
 const h=harness();h.size(8,5);h.ready();h.reset();
 for(const n of [0,-1,65,128,1.5,NaN,Infinity]){h.call(2,'msg_float',n);h.call(3,'msg_float',n);}
 for(const a of [[-1,1],[128,1],[0.5,1],[0,2],[NaN,1]])h.call(0,'list',...a);
 h.flush();assert.deepEqual(h.events,[]);h.call(0,'list',127,1);assert.deepEqual(h.events,[]);
});
test('repeated occupied and empty packets always produce explicit hardware updates',()=>{
 const h=harness();h.size(8,5);h.ready();h.reset();for(const n of [1,1,0,0])h.call(0,'list',0,n);
 assert.deepEqual(h.of(1),[[0,1],[0,1],[0,0],[0,0]]);
});
console.log(count+' dimension/state tests passed.');
