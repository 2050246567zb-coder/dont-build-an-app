import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {startServer} from '../src/server.ts';

test('real MCP stdio initialize/list/call uses bound local bridge, stages a scene, and does not send a model message',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'galgame-mcp-')),thread='11111111-1111-1111-1111-111111111111';const log=join(dir,'log');await writeFile(log,'');let sends=0;
  const app=await startServer({dataDir:dir,port:0,rolloutPath:log,quiet:true,adapter:{threadId:thread,capabilities:async()=>[{name:'send_message_to_thread',namespace:'codex_app',inputSchema:{}}],readThread:async()=>({thread:{id:thread,title:'MCP fixture',status:{type:'idle'}}}),send:async()=>{sends++;throw Error('Not expected');},close(){}}});
  const child=spawn(process.execPath,['--import','tsx',resolve('src/mcp.ts'),join(dir,'runtime.json')],{env:{...process.env,CODEX_THREAD_ID:thread},windowsHide:true,stdio:['pipe','pipe','pipe']});child.stderr.resume();
  const pending=new Map<number,{resolve:(v:any)=>void;reject:(e:any)=>void;timer:ReturnType<typeof setTimeout>}>();let id=0;
  const lines=createInterface({input:child.stdout});lines.on('line',line=>{const message=JSON.parse(line),request=pending.get(message.id);if(request){clearTimeout(request.timer);pending.delete(message.id);if(message.error)request.reject(Error(message.error.message));else request.resolve(message.result);}});
  const rpc=(method:string,params:any)=>new Promise<any>((resolveReply,reject)=>{const call=++id;pending.set(call,{resolve:resolveReply,reject,timer:setTimeout(()=>reject(Error('MCP timeout')),10000)});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:call,method,params})+'\n');});
  t.after(async()=>{for(const p of pending.values())clearTimeout(p.timer);lines.close();child.kill();await app.close();await rm(dir,{recursive:true,force:true});});
  const init=await rpc('initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'galgame-contract-test',version:'1'}});assert.equal(init.serverInfo.name,'dont-build-an-app-galgame');
  child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');
  const list=await rpc('tools/list',{});assert.deepEqual(list.tools.map((x:any)=>x.name).sort(),['galgame_context','galgame_stage_scene']);
  const context=await rpc('tools/call',{name:'galgame_context',arguments:{}});assert.ok(!context.isError);assert.ok(context.content[0].text.includes('GalGame'));
  const path=join(dir,'scene.json');await writeFile(path,JSON.stringify({schema_version:'1.0',turn_id:'mcp_turn',stage:'screening',segments:[{segment_id:'s1',speaker:'system',text:'这是协议测试内容。',emotion:'neutral',advance:'reply'}]}));
  const result=await rpc('tools/call',{name:'galgame_stage_scene',arguments:{scene_file:path}});assert.ok(!result.isError);const staged=JSON.parse(result.content[0].text);assert.ok(staged.finalText.includes('AI：这是协议测试内容。'));assert.equal(staged.status,'staged');assert.equal(sends,0);
});
