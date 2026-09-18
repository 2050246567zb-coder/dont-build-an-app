import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {CodexPipe} from '../src/adapters/codex-pipe.ts';

const thread='11111111-1111-1111-1111-111111111111';
async function pipeServer(t:any,oversize=false){
  const address=process.platform==='win32'?`\\\\.\\pipe\\galgame-test-${randomUUID()}`:join(tmpdir(),`gg-${randomUUID()}.sock`);
  const sockets=new Set<net.Socket>();let calls=0;
  const server=net.createServer(socket=>{
    sockets.add(socket);socket.once('close',()=>sockets.delete(socket));socket.on('error',()=>{});let buffer=Buffer.alloc(0),writeQueue=Promise.resolve();
    socket.on('data',chunk=>{
      buffer=Buffer.concat([buffer,chunk]);
      while(buffer.length>=4){
        const size=buffer.readUInt32LE(0);if(buffer.length<size+4)return;
        const req=JSON.parse(buffer.subarray(4,size+4).toString());buffer=buffer.subarray(size+4);
        let result;
        if(req.method==='tools/list')result={tools:[{name:'read_thread',namespace:'codex_app',inputSchema:{}},{name:'send_message_to_thread',namespace:'codex_app',inputSchema:{}},{name:'send_message_to_thread',namespace:'attacker',inputSchema:{}},{name:'delete_everything',namespace:'codex_app',inputSchema:{}}]};
        else{calls++;result={success:true,contentItems:[{type:'inputText',text:JSON.stringify({thread:{id:thread,status:{type:'idle'}}})}]};}
        const b=Buffer.from(JSON.stringify({jsonrpc:'2.0',id:req.id,result})),frame=Buffer.alloc(4+b.length);frame.writeUInt32LE(oversize?9000000:b.length);b.copy(frame,4);
        writeQueue=writeQueue.then(()=>new Promise<void>(done=>{
          socket.write(frame.subarray(0,2));setImmediate(()=>{socket.write(frame.subarray(2));done();});
        }));
      }
    });
  });
  await new Promise<void>(r=>server.listen(address,r));
  const adapter=new CodexPipe(address,thread);
  t.after(async()=>{adapter.close();for(const s of sockets)s.destroy();await new Promise<void>(r=>server.close(()=>r()));});
  return {adapter,calls:()=>calls};
}
test('real socket framing handles split header and filters namespace/tool allowlist',async t=>{
  const {adapter}=await pipeServer(t);
  assert.deepEqual((await adapter.capabilities()).map(t=>t.name),['read_thread','send_message_to_thread']);
  assert.equal((await adapter.readThread()).thread.id,thread);
});
test('concurrent requests and reconnect cannot be disconnected by stale socket events',async t=>{
  const {adapter}=await pipeServer(t);
  const r=await Promise.all([adapter.readThread(),adapter.readThread()]);assert.ok(r.every(r=>r.thread.id===thread));
  adapter.close();assert.equal((await adapter.readThread()).thread.id,thread);
});
test('adapter refuses a different conversation before sending mutation',async t=>{
  const {adapter,calls}=await pipeServer(t);
  await assert.rejects(adapter.call('send_message_to_thread',{threadId:'other',prompt:'test'}),/Cross-conversation/);assert.equal(calls(),0);
});
test('oversize frame fails closed',async t=>{
  const {adapter}=await pipeServer(t,true);
  await assert.rejects(adapter.capabilities(),/frame limit/);
});
