import test from 'node:test';
import assert from 'node:assert/strict';
import {qwenMessage,qwenOrigin,QwenWorkAdapter} from '../src/adapters/qwenwork.ts';
import {hostContext} from '../src/host-context.ts';
import {assertRuntimeTask} from '../src/bridge-client.ts';
import {Store} from '../src/store.ts';
const thread='mu6iycd14kqw7t0n',receipt='11111111-1111-4111-8111-111111111111';
const row=(parts:any[],metadata:any={},role='assistant')=>({message_id:'native-id',sequence:8,created_at:Date.now()/1000,role,parts:JSON.stringify(parts),metadata:JSON.stringify(metadata)});
test('Qwen reads explicit final part without 2000-character truncation or commentary',()=>{
  const parts=[{type:'text',id:'early',text:'working'},{type:'tool-result',text:'not final'},{type:'reasoning',text:'private'},{type:'text',id:'done',text:'完成'.repeat(3000)}];
  assert.equal(qwenMessage(row(parts,{status:'completed',finalTextId:'done'}))?.text,'完成'.repeat(3000));
  assert.equal(qwenMessage(row(parts,{status:'running',finalTextId:'done'})),undefined);
  assert.equal(qwenMessage(row(parts,{status:'completed'})),undefined);
  assert.throws(()=>qwenMessage(row(parts,{status:'completed',finalTextId:'missing'})),/完整/);
});
test('Qwen receipt confirms only its own native submission and survives reread',()=>{
  const store=new Store(':memory:');
  try{
    store.beginSubmission(receipt,thread,'hello');
    const ordinary=qwenMessage(row([{type:'text',text:'hello'}],{},'user'))!;
    store.addMessage(thread,ordinary);
    assert.equal(store.submission(receipt).status,'submitting');
    const marked=qwenMessage({...row([{type:'text',text:`hello\n\n<!-- galgame-receipt:${receipt} -->`}],{},'user'),message_id:'with-receipt',sequence:9})!;
    store.addMessage(thread,marked);store.addMessage(thread,marked);
    assert.equal(store.submission(receipt).status,'confirmed');
    assert.equal(store.messages(thread).length,2);
  }finally{store.close();}
});
test('Qwen host identity beats inherited Codex variables, never guesses a recent task',()=>{
  const env={QODERWORK_SOURCE_CHAT_ID:thread,CODEX_THREAD_ID:'unrelated'};
  assert.equal(hostContext(env).host,'qwenwork');
  assert.doesNotThrow(()=>assertRuntimeTask({threadId:thread,adapter:'qwenwork-local-connector'},env));
  assert.throws(()=>assertRuntimeTask({threadId:'other',adapter:'qwenwork-local-connector'},env),/另一个/);
  assert.throws(()=>hostContext({GALGAME_HOST:'qwenwork',CODEX_THREAD_ID:thread}),/QODERWORK/);
  assert.throws(()=>hostContext({GALGAME_HOST:'claude-desktop'}),/拒绝调试/);
});
test('Qwen connector cannot redirect a local credential to a remote endpoint',()=>{
  assert.equal(qwenOrigin('http://127.0.0.1:1234'),'http://127.0.0.1:1234');
  for(const u of ['https://example.com:1234','http://localhost:1234','http://127.0.0.1:1234/path','http://user@127.0.0.1:1234'])assert.throws(()=>qwenOrigin(u));
});
test('Qwen action uses keyed acknowledgment, never assumes the query data envelope',async()=>{
  const adapter=Object.create(QwenWorkAdapter.prototype) as QwenWorkAdapter;
  Object.defineProperty(adapter,'threadId',{value:thread});
  adapter.readThread=async()=>({thread:{id:thread,title:'fixture',status:{type:'idle'}}});
  let calls=0;
  adapter.rpc=async(_method,params)=>{calls++;assert.equal(params.name,'qw_action');assert.match(params.arguments.params.message,/galgame-receipt:/);return {structuredContent:{ok:true,type:'action',key:`qwenwork.tasks.${thread}`}};};
  assert.equal((await adapter.send('hello',receipt)).threadId,thread);
  assert.equal(calls,1);
  adapter.rpc=async()=>({structuredContent:{ok:true,type:'action',key:'qwenwork.tasks.other'}});
  await assert.rejects(adapter.send('hello',receipt),/原任务不一致/);
});
