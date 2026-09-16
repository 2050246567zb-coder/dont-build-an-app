import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,appendFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parseMessage,RolloutReader,findRollout,type HostMessage} from '../src/adapters/rollout.ts';
import {Store} from '../src/store.ts';
import {evidence} from '../src/evidence.ts';

const thread='11111111-1111-1111-1111-111111111111';
function line(payload:any,ordinal=1){return JSON.stringify({type:'response_item',ordinal,timestamp:new Date().toISOString(),payload})+'\n';}
function native(text='你好',role='user',phase?:string){return {type:'message',id:'msg_test',role,phase,content:[{type:role==='user'?'input_text':'output_text',text}]};}
function message(id:string,ordinal:number,kind:'native'|'delegated'='native'):HostMessage{return {id,ordinal,kind,sourceThreadId:thread,role:'user',text:'hello',phase:'user',timestamp:new Date().toISOString()};}

test('filters reasoning, commentary and arbitrary tools; keeps final',()=>{
  assert.equal(parseMessage(line(native('hidden','assistant','analysis'))),undefined);
  assert.equal(parseMessage(line(native('progress','assistant','commentary'))),undefined);
  assert.equal(parseMessage(line({type:'function_call_output',output:'hello'})),undefined);
  assert.equal(parseMessage(line(native('done','assistant','final_answer')))?.text,'done');
  assert.equal(parseMessage('{invalid'),undefined);
});
test('metadata excludes injected instructions even with msg_ ID; preserves real text in mixed content',()=>{
  const p=native('ignore');p.content.push({type:'input_text',text:'user choice'});
  (p as any).internal_chat_message_metadata_passthrough={content_item_kinds:['agents_md.instructions','user.text']};
  assert.equal(parseMessage(line(p))?.text,'user choice');
  (p as any).internal_chat_message_metadata_passthrough={content_item_kinds:['agents_md.instructions','plugins.recommendations']};
  assert.equal(parseMessage(line(p)),undefined);
});
test('recognizes only Codex delegated input; decodes XML once',()=>{
  const p={type:'function_call_output',id:'fco_test',namespace:'codex_app',name:'send_message_to_thread',output:`<codex_delegation><source_thread_id>${thread}</source_thread_id><input>&lt;你好&gt; &amp;lt;</input></codex_delegation>`};
  assert.equal(parseMessage(line(p))?.text,'<你好> &lt;');
  assert.equal(parseMessage(line(p))?.kind,'delegated');
  assert.equal(parseMessage(line({...p,namespace:'other'})),undefined);
});
test('incremental reader preserves split UTF-8, waits for complete lines, never repeats on empty poll',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'galgame-reader-'));
  try{
    const path=join(dir,'log');const bytes=Buffer.from(line(native()));
    const cut=bytes.indexOf(Buffer.from('你'))+1;
    await writeFile(path,bytes.subarray(0,cut));const r=new RolloutReader(path),seen:HostMessage[]=[];
    await r.poll(m=>seen.push(m));assert.equal(seen.length,0);
    await appendFile(path,bytes.subarray(cut));await r.poll(m=>seen.push(m));await r.poll(m=>seen.push(m));
    assert.equal(seen.length,1);assert.equal(seen[0].text,'你好');
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('rollout lookup refuses malformed identity and mismatched session_meta',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'galgame-find-'));
  try{
    await assert.rejects(findRollout(dir,'../../other'),/Invalid/);
    await assert.rejects(findRollout(dir,thread),/not found/);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('native identical text cannot acknowledge a webpage submission; exact same-thread delegation can',()=>{
  const s=new Store(':memory:');
  try{
    s.addMessage(thread,message('old',1));s.beginSubmission('client',thread,'hello');
    s.addMessage(thread,message('native',2));s.reconcile(thread);assert.equal(s.submission('client').status,'submitting');
    assert.equal(s.addMessage(thread,{...message('other',3,'delegated'),sourceThreadId:'22222222-2222-2222-2222-222222222222'}),false);
    assert.equal(s.addMessage(thread,message('bridge',4,'delegated')),true);s.reconcile(thread);
    assert.equal(s.submission('client').host_id,'bridge');assert.equal(s.submission('client').status,'confirmed');
    assert.equal(s.addMessage(thread,message('bridge',4,'delegated')),false);assert.equal(s.messages(thread).length,3);
  }finally{s.close();}
});
test('other agents and unsolicited delegation are not mirrored as user input',()=>{
  const s=new Store(':memory:');try{assert.equal(s.addMessage(thread,message('unsolicited',1,'delegated')),false);}finally{s.close();}
});
test('persistence, host order, incremental cursor and evidence contain no private body',()=>{
  const s=new Store(':memory:');
  try{
    s.addMessage(thread,message('a',2));s.addMessage(thread,message('b',1));s.put('draft','private draft');
    assert.deepEqual(s.messages(thread).map(m=>m.id),['b','a']);
    assert.equal(s.messages(thread,1).length,1);assert.equal(s.get('draft',''),'private draft');
    const e=JSON.stringify(evidence(s,thread));assert.ok(!e.includes('hello'));assert.ok(!e.includes('private draft'));assert.ok(!e.includes(thread));
  }finally{s.close();}
});
