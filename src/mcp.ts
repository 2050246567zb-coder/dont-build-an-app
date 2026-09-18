import {McpServer} from '@modelcontextprotocol/server';
import {StdioServerTransport} from '@modelcontextprotocol/server/stdio';
import {z} from 'zod';
import {resolve} from 'node:path';
import {readFile} from 'node:fs/promises';
import {bridgeClient,readSceneFile} from './bridge-client.ts';

const runtime=process.argv[2];if(!runtime)throw Error('必须显式指定当前原任务的 runtime.json');
const server=new McpServer({name:'dont-build-an-app-galgame',version:'0.1.0-alpha.2'});
const run=async(action:()=>Promise<unknown>)=>{try{return {content:[{type:'text' as const,text:JSON.stringify(await action(),null,2)}]};}catch(e:any){return {isError:true,content:[{type:'text' as const,text:e.message}]};}};
server.registerTool('galgame_context',{description:'读取此 MCP 实例绑定的原任务、网页图片偏好和剧情格式要求。没有独立模型，不发送用户消息。',inputSchema:z.object({})},async()=>run(async()=>{
  const api=await bridgeClient(resolve(runtime));const state=await api('/api/game');
  return {save:state.save,prefs:state.prefs,connected:state.connected,pending:state.pending,instructions:await readFile(new URL('../skills/dont-build-an-app/references/galgame-mode.md',import.meta.url),'utf8'),storyDirection:await readFile(new URL('../skills/dont-build-an-app/references/story-direction.md',import.meta.url),'utf8')};
}));
server.registerTool('galgame_stage_scene',{description:'暂存当前原任务的剧情 JSON 文件，校验角色、顺序和资源，返回必须原样发送的 finalText。只有宿主正式回复完全一致后网页才播放。',inputSchema:z.object({scene_file:z.string().describe('Agent 已准备好的本地剧情 JSON 文件绝对路径')})},async({scene_file})=>run(async()=>{
  const api=await bridgeClient(resolve(runtime));return api('/api/game/stage','POST',await readSceneFile(resolve(scene_file)));
}));
await server.connect(new StdioServerTransport());
