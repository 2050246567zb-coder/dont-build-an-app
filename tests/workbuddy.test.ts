import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {workBuddyMessages,WorkBuddyHistory} from '../src/adapters/workbuddy.ts';
import {hostContext} from '../src/host-context.ts';
import {assertRuntimeTask} from '../src/bridge-client.ts';
import {Store} from '../src/store.ts';
import {startServer} from '../src/server.ts';
import type {HostAdapter} from '../src/adapters/types.ts';
const thread='11111111-1111-1111-1111-111111111111';
const request=(id='client-001',timestamp=Date.now())=>({id,identity:{forkRequestId:'persisted-001'},timestamp,state:'completed',userMessage:{content:[{type:'text',text:'hello'}]},assistantMessage:{content:[{type:'text',text:'process only'},{type:'tool_use',name:'read'},{type:'reasoning',text:'private'},{type:'text',text:'final reply'}]}});

test('WorkBuddy final mapping excludes reasoning, tools and earlier commentary; identity survives reload',()=>{
  const r=request(),messages=workBuddyMessages(r);
  assert.deepEqual(messages.map(m=>m.text),['hello','final reply']);
  assert.equal(messages[0].submissionId,'client-001');
  assert.deepEqual(workBuddyMessages({...r,id:'history-row-001'}).map(m=>m.id),messages.map(m=>m.id));
  assert.equal(workBuddyMessages({...r,id:'history-row-001',clientRequestId:'client-001'})[0].submissionId,'client-001');
  assert.equal(workBuddyMessages({...r,state:'running'}).length,1);
  assert.deepEqual(workBuddyMessages({...r,identity:undefined}),[]);
});
test('WorkBuddy history pages are emitted in host order only after a complete read',async()=>{
  const older={...request('older',1000),identity:{forkRequestId:'old'}},newer=request('newer',2000),seen:any[]=[];
  const history=new WorkBuddyHistory(async(method,id,options:any)=>{
    assert.equal(method,'requests');assert.equal(id,thread);
    return options.beforeRequestId?{items:[older],hasOlder:false}:{items:[newer],hasOlder:true};
  },thread);
  await history.poll(m=>seen.push(m));
  assert.deepEqual(seen.map(m=>m.id),['wb-old-u','wb-old-a','wb-persisted-001-u','wb-persisted-001-a']);
  const partial:any[]=[];
  await assert.rejects(new WorkBuddyHistory(async()=>({items:[],hasOlder:true}),thread).poll(m=>partial.push(m)),/加载|分页/);
  assert.equal(partial.length,0);
});
test('native confirmations require exact client identity, thread and text; reload cannot duplicate',()=>{
  const store=new Store(':memory:');
  try{
    store.beginSubmission('client-001',thread,'hello');
    const r=request(),message=workBuddyMessages(r)[0];
    store.addMessage(thread,{...message,submissionId:'unrelated'});
    assert.equal(store.submission('client-001').status,'submitting');
    store.addMessage('other-thread',message);
    assert.equal(store.submission('client-001').status,'submitting');
    store.addMessage(thread,{...message,text:'different'});
    assert.equal(store.submission('client-001').status,'submitting');
    store.addMessage(thread,message);
    assert.equal(store.submission('client-001').status,'confirmed');
    store.addMessage(thread,workBuddyMessages({...r,id:'reloaded'})[0]);
    assert.equal(store.messages(thread).length,1);
  }finally{store.close();}
});
test('host binding favors WorkBuddy own task over inherited Codex env and requires explicit local debugging',()=>{
  const env={CODEBUDDY_SESSION_ID:thread,CODEX_THREAD_ID:'other',CODEX_HOME:'codex',CODEX_APP_TOOLS_PIPE_PATH:'pipe'};
  assert.throws(()=>hostContext(env),/本机调试/);
  const actual=hostContext({...env,WORKBUDDY_REMOTE_DEBUGGING_PORT:'9229'});
  assert.equal(actual.host,'workbuddy');assert.equal(actual.threadId,thread);
  assert.throws(()=>hostContext({...env,GALGAME_WORKBUDDY_CDP:'http://example.com:9229'}),/127.0.0.1/);
  assert.throws(()=>hostContext({GALGAME_HOST:'workbuddy',CODEX_THREAD_ID:thread}),/CODEBUDDY_SESSION_ID/);
});
test('scene publisher uses the active WorkBuddy binding even if Codex variables are inherited',()=>{
  const runtime={threadId:thread,adapter:'workbuddy-desktop-cdp'};
  assert.doesNotThrow(()=>assertRuntimeTask(runtime,{CODEBUDDY_SESSION_ID:thread,CODEX_THREAD_ID:'another-codex-task'}));
  assert.throws(()=>assertRuntimeTask(runtime,{CODEBUDDY_SESSION_ID:'another-workbuddy-task',CODEX_THREAD_ID:thread}),/另一个原任务/);
  assert.throws(()=>assertRuntimeTask(runtime,{GALGAME_HOST:'codex',CODEX_THREAD_ID:thread}),/另一个原任务/);
});
test('HTTP WorkBuddy contract preserves native text, confirms once and survives reconnect without replay',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'galgame-workbuddy-')),requests:any[]=[];let sends=0;
  const reader=new WorkBuddyHistory(async()=>({items:requests,hasOlder:false}),thread);
  const adapter:HostAdapter={name:'workbuddy-desktop-cdp',label:'WorkBuddy 原任务（实验）',threadId:thread,reader,
    capabilities:async()=>[{name:'send_message_to_thread',namespace:'workbuddy',inputSchema:{}}],
    readThread:async()=>({thread:{id:thread,title:'Test',status:{type:'idle'}}}),
    send:async(text,id)=>{sends++;requests.push({...request(id),userMessage:{content:[{type:'text',text}]}});return {threadId:thread};},close(){}
  };
  const app=await startServer({dataDir:dir,port:0,adapter,quiet:true,pollMs:60000,heartbeatMs:60000});
  t.after(async()=>{await app.close();await rm(dir,{recursive:true,force:true});});
  const url=new URL(app.url),token=new URLSearchParams(url.hash.slice(1)).get('token');
  const api=(path:string,body?:any)=>fetch(url.origin+path,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
  const payload={id:'client-001',text:'<user>literal user text</user>',baseMessageId:null};
  assert.equal((await api('/api/messages',payload)).status,202);
  assert.equal((await api('/api/messages',payload)).status,200);
  assert.equal((await api('/api/reconnect',{})).status,200);
  const state:any=await (await api('/api/state')).json();
  assert.equal(state.adapter,'workbuddy-desktop-cdp');assert.equal(sends,1);
  assert.equal(state.messages.length,2);assert.equal(state.messages[0].displayText,payload.text);
  assert.equal(state.submissions[0].status,'confirmed');
  const game:any=await (await api('/api/game')).json();assert.equal(game.hostLabel,adapter.label);
});
