import {spawn} from 'node:child_process';
import {readFile,mkdir,open} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join,resolve} from 'node:path';
import {homedir} from 'node:os';
const root=fileURLToPath(new URL('../',import.meta.url));
const appDataRoot=process.env.GALGAME_HOME || (process.platform==='win32'?join(process.env.LOCALAPPDATA||homedir(),'DontBuildAnApp'):process.platform==='darwin'?join(homedir(),'Library','Application Support','DontBuildAnApp'):join(process.env.XDG_DATA_HOME||join(homedir(),'.local','share'),'dont-build-an-app'));
let legacy;try{legacy=JSON.parse(await readFile(join(root,'.galgame','runtime.json'),'utf8'));}catch{}
const dataDir=resolve(process.env.GALGAME_DATA_DIR || (legacy?.threadId===process.env.CODEX_THREAD_ID?join(root,'.galgame'):join(appDataRoot,'threads',process.env.CODEX_THREAD_ID||'unbound')));
const runtimePath=join(dataDir,'runtime.json');

async function running(){
  let runtime;try{runtime=JSON.parse(await readFile(runtimePath,'utf8'));}catch{return null;}
  const url=new URL(runtime.url);
  if(url.hostname!=='127.0.0.1'||url.protocol!=='http:')throw Error('Invalid local runtime address');
  const token=new URLSearchParams(url.hash.slice(1)).get('token');
  try{
    const response=await fetch(url.origin+'/api/state?after=2147483647',{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(1500)});
    if(!response.ok)return null;
    const state=await response.json();
    if(state.thread.id!==runtime.threadId)throw Error('Runtime identity mismatch');
    return {runtime,state,origin:url.origin,token};
  }catch{return null;}
}
async function main(){
  const existing=await running();
  if(process.argv[2]==='stop'){
    if(!existing){console.log('没有检测到此目录的运行实例。');return;}
    const result=await fetch(existing.origin+'/api/shutdown',{method:'POST',headers:{Authorization:`Bearer ${existing.token}`}});
    if(!result.ok)throw Error('停止失败；未结束任何其他进程。');
    console.log('已停止本目录的验证器，保留原 Agent 和本地记录。');return;
  }
  if(!process.env.CODEX_THREAD_ID||!process.env.CODEX_APP_TOOLS_PIPE_PATH)throw Error('请由现有 Codex 桌面任务执行此命令；普通终端缺少当前会话绑定。');
  if(existing){
    if(existing.runtime.threadId!==process.env.CODEX_THREAD_ID)throw Error('此目录的验证器绑定了另一个任务。请用独立目录和端口，不能混用原会话。');
    if(!existing.state.connected)throw Error('原宿主连接已失效。请先 npm run stop，再从原任务重新启动。');
    if(process.argv[2]!=='info')await fetch(existing.origin+'/api/game/reactivate',{method:'POST',headers:{Authorization:`Bearer ${existing.token}`}});
    console.log(process.argv[2]==='info'?JSON.stringify({...existing.runtime,runtimePath,mcpCommand:process.execPath,mcpArgs:[join(root,'dist/mcp.js'),runtimePath]},null,2):existing.runtime.url);return;
  }
  await mkdir(dataDir,{recursive:true});
  const out=await open(join(dataDir,'server.stdout.log'),'a'),err=await open(join(dataDir,'server.stderr.log'),'a');
  const child=spawn(process.execPath,[join(root,'dist/cli.js')],{cwd:root,env:{...process.env,GALGAME_DATA_DIR:dataDir,GALGAME_REGISTRY_DIR:join(appDataRoot,'catalog'),GALGAME_PORT:process.env.GALGAME_PORT||(legacy?.threadId===process.env.CODEX_THREAD_ID?'4317':'0')},detached:true,windowsHide:true,stdio:['ignore',out.fd,err.fd]});
  child.unref();await out.close();await err.close();
  let failure;child.on('error',e=>{failure=e;});
  for(let attempt=0;attempt<40;attempt++){
    if(failure)throw failure;
    await new Promise(r=>setTimeout(r,250));const result=await running();
    if(result?.runtime.pid===child.pid){console.log(process.argv[2]==='info'?JSON.stringify({...result.runtime,runtimePath,mcpCommand:process.execPath,mcpArgs:[join(root,'dist/mcp.js'),runtimePath]},null,2):result.runtime.url);return;}
  }
  throw Error(`启动尚未成功。查看 ${join(dataDir,'server.stderr.log')}；不会另外创建模型会话。`);
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
