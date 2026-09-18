import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createContext,runInContext} from 'node:vm';

// Execute the actual frontend handlers with a minimal DOM, not a second implementation.
const source=(await readFile(new URL('../web/game.js',import.meta.url),'utf8'))
  .replace(/^import .*;\r?\n/gm,'').replace('await poll();setInterval(poll,1500);','');
const html=await readFile(new URL('../web/game.html',import.meta.url),'utf8');
const line=(id:string,speaker='jobs',advance='reply')=>({id,speaker,advance,text:`text ${id}`,emotion:'neutral',stage:'design',hostId:id,turnId:id,document_id:'doc'});
function fixture(timeline:any[]){
  const nodes=new Map([...html.matchAll(/id="([^"]+)"/g)].map(m=>[m[1],{
    hidden:false,value:'',textContent:'',disabled:false,readOnly:false,dataset:{},
    classList:{remove(){},add(){},toggle(){}},setAttribute(){},addEventListener(){},
    replaceChildren(){},append(){},close(){},focus(){},
  }]));
  const writes:any[]=[],reads:string[]=[];
  let snapshot:any={timeline,connected:true,recoverySupported:true,latestMessageId:'latest',submissions:[],draft:'',prefs:{speed:0,imageMode:'builtin'},save:{id:'save',title:'test',updatedAt:new Date().toISOString()}};
  let documentResponse:Promise<any>|undefined;
  const storage={getItem:()=>null,setItem(){},removeItem(){}};
  const ctx=createContext({console,URL,URLSearchParams,crypto,location:{hash:'',pathname:'/'},history:{replaceState(){}},sessionStorage:storage,localStorage:storage,
    document:{getElementById:(id:string)=>{assert.ok(nodes.has(id),id);return nodes.get(id);},querySelector:()=>({checked:false}),addEventListener(){},createElement:()=>({classList:{add(){}},append(){},setAttribute(){}})},
    bindCompanion:()=>({reset(){},setEnabled(){}}),setSceneTheme(){},changePortrait:async()=>{},prefersLive2d:()=>false,setLive2dPreference(){},renderMarkdown(){},
    matchMedia:()=>({matches:false}),setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){},
    fetch:async(path:string,options:any)=>{const body=options.body?JSON.parse(options.body):null;if(options.method!=='GET')writes.push({path,body});else reads.push(path);
      const result=path==='/api/game'?snapshot:path==='/api/game/lease'?{owned:true}:path.startsWith('/api/game/document')?await (documentResponse??Promise.resolve({title:'doc',markdown:'test'})):{};
      return {ok:true,json:async()=>result};},snapshot,
  });
  runInContext(source,ctx);runInContext('state=snapshot;owned=true;inGame=true;initialized=true;base=state.latestMessageId;',ctx);
  return {nodes,writes,reads,run:(code:string)=>runInContext(code,ctx),setSnapshot:(next:any)=>{snapshot=next;},snapshot,deferDocument:(p:Promise<any>)=>{documentResponse=p;}};
}
test('replay hides historical input, preserves draft and persisted frontier, rejects sends',async()=>{
  const f=fixture([line('old'),line('current')]);f.nodes.get('reply')!.value='unfinished draft';f.run('show(1)');
  assert.equal(f.nodes.get('reply-panel')!.hidden,false);assert.equal(f.writes.length,1);
  f.run("$('replay-previous').onclick()");
  assert.equal(f.nodes.get('reply-panel')!.hidden,true);assert.equal(f.nodes.get('send')!.disabled,true);
  assert.equal(f.nodes.get('replay-forward')!.hidden,false);assert.equal(f.nodes.get('next')!.hidden,true);
  assert.equal(f.nodes.get('reply')!.value,'unfinished draft');assert.equal(f.writes.length,1);
  await assert.rejects(f.run("sendText('must not submit')"),/回看仅供阅读/);
  f.run("$('next').onclick()");assert.equal(f.run('index'),0);
  f.run("$('replay-forward').onclick()");assert.equal(f.nodes.get('replay-forward')!.hidden,true);
  assert.equal(f.nodes.get('reply-panel')!.hidden,false);assert.equal(f.nodes.get('send')!.disabled,false);assert.equal(f.writes.length,1);
});
test('new replies do not pull the reader out of history; returning to the frontier resumes live playback',async()=>{
  const f=fixture([line('first'),line('past-user','user','click'),line('question'),line('live-user','user','click')]);
  f.run('show(3);show(1,true)');assert.equal(f.nodes.get('dialogue-text')!.textContent,'text past-user');
  f.setSnapshot({...f.snapshot,timeline:[...f.snapshot.timeline,line('new')]});await f.run('poll()');
  assert.equal(f.run('index'),1);assert.equal(f.nodes.get('replay-forward')!.hidden,false);
  f.run('show(3,true)');await f.run('poll()');assert.equal(f.run('index'),4);
  assert.equal(f.nodes.get('reply-panel')!.hidden,false);
});
test('replayed delivery and format errors never expose document or recovery actions',()=>{
  const f=fixture([line('complete','system','complete'),line('error','system','error'),line('current')]);f.run('show(2);show(0,true)');
  assert.equal(f.nodes.get('delivery')!.hidden,true);assert.equal(f.reads.length,0);
  f.run('show(1,true)');assert.equal(f.nodes.get('recover-role')!.hidden,true);assert.equal(f.nodes.get('reply-panel')!.hidden,true);
  assert.equal(f.writes.length,1);
});
test('a late document response cannot reopen the delivery panel during replay',async()=>{
  const f=fixture([line('first'),line('doc','system','complete')]);let resolve:any;
  f.deferDocument(new Promise(r=>{resolve=r;}));f.run('show(1);show(0,true)');resolve({title:'late',markdown:'late'});
  await new Promise(r=>setImmediate(r));assert.equal(f.nodes.get('delivery')!.hidden,true);assert.equal(f.run('doc'),null);
});
test('chapter follows speaking character across handoffs and home resets replay',()=>{
  const f=fixture([{...line('jobs'),stage:'experience'},line('black','xiaohei')]);f.run('show(1);show(0,true)');
  assert.equal(f.nodes.get('chapter')!.textContent,'第二章：jobs');f.run('goHome()');assert.equal(f.run('frontier'),-1);assert.equal(f.run('current'),null);
});
