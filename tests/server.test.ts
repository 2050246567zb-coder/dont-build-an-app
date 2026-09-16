import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,appendFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startServer} from '../src/server.ts';
import type {HostAdapter} from '../src/adapters/types.ts';

const thread='11111111-1111-1111-1111-111111111111';
test('startup identity mismatch closes adapter and never opens a web binding',async()=>{
  let closed=false;
  const adapter:HostAdapter={threadId:thread,capabilities:async()=>[{name:'send_message_to_thread',namespace:'codex_app',inputSchema:{}}],readThread:async()=>({thread:{id:'wrong'}}),send:async()=>{throw Error('Must not send');},close(){closed=true;}};
  await assert.rejects(startServer({dataDir:'unused',port:0,adapter}),/身份校验/);assert.equal(closed,true);
});
async function fixture(t:any,behavior:'normal'|'timeout'|'wrong-thread'='normal'){
  const dir=await mkdtemp(join(tmpdir(),'galgame-http-')),log=join(dir,'log.jsonl');await writeFile(log,'');let count=0;
  const adapter:HostAdapter={threadId:thread,capabilities:async()=>[{name:'send_message_to_thread',namespace:'codex_app',inputSchema:{}}],readThread:async()=>({thread:{id:thread,title:'Test',status:{type:'idle'}}}),
    async send(text){count++;if(behavior==='timeout')throw Error('timeout');
      await appendFile(log,JSON.stringify({type:'response_item',ordinal:count,timestamp:new Date().toISOString(),payload:{type:'function_call_output',id:`fco_${count}`,namespace:'codex_app',name:'send_message_to_thread',output:`<codex_delegation><source_thread_id>${thread}</source_thread_id><input>${text}</input></codex_delegation>`}})+'\n');
      return {threadId:behavior==='wrong-thread'?'wrong':thread};},close(){}
  };
  const app=await startServer({adapter,rolloutPath:log,dataDir:dir,port:0,quiet:true,pollMs:60000,heartbeatMs:60000});
  t.after(async()=>{await app.close();await rm(dir,{recursive:true,force:true});});
  const url=new URL(app.url),token=new URLSearchParams(url.hash.slice(1)).get('token');
  const request=async(path:string,method='GET',body?:any,headers?:any)=>fetch(url.origin+path,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});
  return {app,request,count:()=>count,url,log};
}
test('auth, origin restrictions, unknown endpoint, private export',async t=>{
  const f=await fixture(t);
  assert.equal((await fetch(f.url.origin+'/api/state')).status,401);
  assert.equal((await f.request('/api/state','GET',undefined,{Origin:'https://evil.example'})).status,403);
  assert.equal((await f.request('/api/unknown')).status,404);
  assert.equal((await f.request('/api/evidence')).status,200);
});
test('duplicate client IDs acknowledge once; altered contents and stale context reject',async t=>{
  const f=await fixture(t),payload={id:'client-0001',text:'hello',baseMessageId:null};
  assert.equal((await f.request('/api/messages','POST',payload)).status,202);
  assert.equal((await f.request('/api/messages','POST',payload)).status,200);
  assert.equal(f.count(),1);
  assert.equal((await f.request('/api/messages','POST',{...payload,text:'changed'})).status,409);
  assert.equal((await f.request('/api/messages','POST',{...payload,id:'client-0002'})).status,409);
  const state=await (await f.request('/api/state')).json() as any;
  assert.equal(state.submissions[0].status,'confirmed');assert.equal(state.messages.length,1);
});
test('concurrent tabs cannot cause duplicate submissions',async t=>{
  const f=await fixture(t);
  const results=await Promise.all([1,2].map(i=>f.request('/api/messages','POST',{id:`client-000${i}`,text:'hello',baseMessageId:null})));
  assert.deepEqual(results.map(r=>r.status).sort(),[202,409]);assert.equal(f.count(),1);
});
test('uncertain send is never automatically retried after reconnect',async t=>{
  const f=await fixture(t,'timeout'),payload={id:'client-0001',text:'hello',baseMessageId:null};
  assert.equal((await f.request('/api/messages','POST',payload)).status,502);
  await f.request('/api/reconnect','POST');await f.request('/api/messages','POST',payload);
  assert.equal(f.count(),1);
  assert.equal((await f.request('/api/messages','POST',{...payload,id:'client-0002'})).status,409);
});
test('wrong-thread acknowledgment does not produce a successful HTTP receipt',async t=>{
  const f=await fixture(t,'wrong-thread');
  assert.equal((await f.request('/api/messages','POST',{id:'client-0001',text:'hello',baseMessageId:null})).status,502);
});
test('draft survives adapter reconnect; confirmed message does not duplicate',async t=>{
  const f=await fixture(t);
  await f.request('/api/draft','PUT',{text:'未发送草稿',baseMessageId:null});
  await f.request('/api/messages','POST',{id:'client-0001',text:'hello',baseMessageId:null});
  await f.request('/api/reconnect','POST');await f.app.poll();
  const state=await (await f.request('/api/state')).json() as any;
  assert.equal(state.messages.length,1);assert.equal(state.draft,'未发送草稿');assert.equal(f.count(),1);
  assert.deepEqual((await (await f.request('/api/state?after=1')).json() as any).messages,[]);
});
test('a missing reply context is rejected before any host mutation',async t=>{
  const f=await fixture(t);
  assert.equal((await f.request('/api/messages','POST',{id:'client-0001',text:'hello'})).status,409);
  assert.equal(f.count(),0);
});

test('web story only commits against formal host text; files, reply lease and delete boundary work over HTTP',async t=>{
  const f=await fixture(t);
  const started=await (await f.request('/api/game/start','POST')).json() as any;
  const markdown='# 可执行方案\n'+ '这里是已明确的目标、范围、操作、异常和验收。'.repeat(12);
  const scene={schema_version:'1.0',turn_id:'http_scene',stage:'delivery',design_closed:true,segments:[{segment_id:'end',speaker:'system',text:'方案已生成。',advance:'complete',document_id:'plan'}],documents:[{id:'plan',title:'方案',markdown}]};
  const staged=await (await f.request('/api/game/stage','POST',scene)).json() as any;
  assert.equal((await (await f.request('/api/game')).json() as any).timeline.length,0);
  assert.notEqual((await f.request('/api/game/document?turn=http_scene&id=plan')).status,200);
  await appendFile(f.log,JSON.stringify({timestamp:new Date().toISOString(),type:'response_item',ordinal:100,payload:{type:'message',id:'msg_formal',role:'assistant',phase:'final_answer',content:[{type:'output_text',text:staged.finalText}]}})+'\n');
  const state=await (await f.request('/api/game')).json() as any;
  assert.equal(state.timeline[0].speaker,'system');
  const doc=await (await f.request('/api/game/document?turn=http_scene&id=plan')).json() as any;
  assert.equal(doc.markdown,markdown);assert.ok(staged.finalText.includes(doc.path.replaceAll('\\','/')));
  assert.equal(await (await f.request('/api/game/resource/document/http_scene/plan')).text(),markdown);
  await f.request('/api/game/lease','POST',{clientId:'owner_111'});
  const denied=await f.request('/api/messages','POST',{id:'guard_001',text:'开始开发',gameSessionId:started.save.id,viewerId:'owner_222',replyTo:state.timeline[0].id,baseMessageId:state.latestMessageId});
  assert.equal(denied.status,409);assert.equal(f.count(),0);
  await f.request('/api/game/save','DELETE');
  assert.equal((await (await f.request('/api/game')).json() as any).deleted,true);
  assert.equal((await (await f.request('/api/state')).json() as any).messages.length,1);
  assert.notEqual((await f.request('/api/game/resource/document/http_scene/plan')).status,200);
});
