import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startServer} from '../src/server.ts';
import type {HostMessage} from '../src/adapters/rollout.ts';

async function fixture(t:any,timeout=false){
  const dir=await mkdtemp(join(tmpdir(),'galgame-recovery-')),threadId='11111111-1111-1111-1111-111111111111',messages:HostMessage[]=[],sent:string[]=[];
  const app=await startServer({dataDir:dir,port:0,quiet:true,pollMs:60000,heartbeatMs:60000,adapter:{threadId,name:'recovery-fixture',capabilities:async()=>[{name:'send_message_to_thread',namespace:'fixture',inputSchema:{}}],readThread:async()=>({thread:{id:threadId,title:'恢复测试',status:{type:'idle'}}}),reader:{async poll(fn){messages.forEach(fn);}},close(){},async send(text,submissionId){sent.push(text);if(timeout)throw Error('timeout');messages.push({id:'native-'+sent.length,role:'user',text,submissionId,ordinal:messages.length+1,phase:'',kind:'native',timestamp:new Date().toISOString()});return {threadId};}}});
  t.after(async()=>{await app.close();await rm(dir,{recursive:true,force:true});});
  const url=new URL(app.url),request=(path:string,method='GET',body?:unknown)=>fetch(url.origin+path,{method,headers:{Authorization:'Bearer '+url.hash.slice(7),'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  await request('/api/game/start','POST');
  messages.push({id:'plain',role:'assistant',text:'普通回复，保留这句话。',ordinal:1,phase:'final_answer',kind:'native',timestamp:new Date().toISOString()});await app.poll();
  const state=await (await request('/api/game')).json() as any;await request('/api/game/lease','POST',{clientId:'viewer_recovery'});
  return {app,dir,messages,sent,request,threadId,input:{id:'recover_0001',text:'我想先服务自己。',recover:true,gameSessionId:state.save.id,viewerId:'viewer_recovery',replyTo:'plain',baseMessageId:'plain'}};
}
test('one recovery submission carries format guidance, confirms once, and displays only the actual user answer',async t=>{
  const f=await fixture(t);
  assert.equal((await f.request('/api/messages','POST',{...f.input,viewerId:'another_viewer'})).status,409);
  assert.equal((await f.request('/api/messages','POST',{...f.input,baseMessageId:'stale'})).status,409);
  assert.equal((await f.request('/api/messages','POST',{...f.input,gameSessionId:undefined})).status,400);
  assert.equal(f.sent.length,0);
  assert.equal((await f.request('/api/messages','POST',f.input)).status,202);
  assert.match(f.sent[0],/我想先服务自己。/);assert.match(f.sent[0],/finalText/);assert.ok(f.sent[0].includes(join(f.dir,'runtime.json')));
  assert.equal((await f.request('/api/messages','POST',f.input)).status,200);
  assert.equal((await f.request('/api/messages','POST',{...f.input,text:'改成别人。'})).status,409);
  assert.equal((await f.request('/api/messages','POST',{...f.input,recover:false})).status,409);assert.equal(f.sent.length,1);
  const state=await (await f.request('/api/game')).json() as any;
  assert.equal(state.timeline.at(-1).text,f.input.text);assert.equal(state.timeline[0].raw,'普通回复，保留这句话。');
  assert.equal(state.submissions[0].status,'confirmed');
  assert.equal(f.app.store.messages(f.threadId).at(-1).text,f.sent[0]);
  const scene={schema_version:'1.0',turn_id:'resumed_turn',stage:'design',segments:[{segment_id:'jobs',speaker:'jobs',text:'那就说说，你自己最烦哪一步？',advance:'reply'}]};
  const staged=await (await f.request('/api/game/stage','POST',scene)).json() as any;
  f.messages.push({id:'recovered',role:'assistant',text:staged.finalText,ordinal:3,phase:'final_answer',kind:'native',timestamp:new Date().toISOString()});await f.app.poll();
  const after=await (await f.request('/api/game')).json() as any;assert.equal(after.timeline.at(-1).speaker,'jobs');assert.deepEqual(after.pending,[]);
});
test('uncertain recovery is not resent after reconnect and does not discard the draft',async t=>{
  const f=await fixture(t,true);await f.request('/api/draft','PUT',{text:f.input.text,baseMessageId:'plain'});
  assert.equal((await f.request('/api/messages','POST',f.input)).status,502);
  await f.request('/api/reconnect','POST');await f.request('/api/messages','POST',f.input);
  assert.equal((await f.request('/api/messages','POST',{...f.input,id:'recover_0002'})).status,409);
  const state=await (await f.request('/api/game')).json() as any;assert.equal(f.sent.length,1);assert.equal(state.draft,f.input.text);assert.equal(state.submissions[0].status,'unknown');
});
