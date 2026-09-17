import {spawn} from 'node:child_process';
import {readFile,mkdir,open} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join,resolve} from 'node:path';
import {hostContext} from '../dist/host-context.js';
import {sharedHome} from '../dist/paths.js';
import {registerSave} from '../dist/catalog.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const appDataRoot=sharedHome(),registryDir=process.env.GALGAME_REGISTRY_DIR||join(appDataRoot,'catalog');
let legacy;try{legacy=JSON.parse(await readFile(join(root,'.galgame','runtime.json'),'utf8'));}catch{}
let context,dataDir,runtimePath;

async function running(){
  let runtime;try{runtime=JSON.parse(await readFile(runtimePath,'utf8'));}catch{return null;}
  const url=new URL(runtime.url);
  if(url.hostname!=='127.0.0.1'||url.protocol!=='http:')throw Error('Invalid local runtime address');
  const token=new URLSearchParams(url.hash.slice(1)).get('token');
  try{
    const response=await fetch(url.origin+'/api/state?after=2147483647',{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(1500)});
    if(!response.ok)return null;
    const state=await response.json();
    if(state.thread.id!==runtime.threadId || state.adapter!==context.adapter || runtime.threadId!==context.threadId)throw Object.assign(Error('此运行目录属于另一个原任务，不能启动、复用或停止。'),{identityMismatch:true});
    return {runtime,state,origin:url.origin,token};
  }catch(error){if(error.identityMismatch)throw error;return null;}
}
async function main(){
  context=hostContext();
  const useLegacy=context.host==='codex' && legacy?.threadId===context.threadId;
  dataDir=resolve(process.env.GALGAME_DATA_DIR || (useLegacy?join(root,'.galgame'):join(appDataRoot,'threads',context.host==='codex'?context.threadId:`workbuddy-${context.threadId}`)));
  runtimePath=join(dataDir,'runtime.json');
  const existing=await running();
  if(process.argv[2]==='stop'){
    if(!existing){console.log('没有检测到此目录的运行实例。');return;}
    const result=await fetch(existing.origin+'/api/shutdown',{method:'POST',headers:{Authorization:`Bearer ${existing.token}`}});
    if(!result.ok)throw Error('停止失败；未结束任何其他进程。');
    console.log('已停止本目录的验证器，保留原 Agent 和本地记录。');return;
  }
  if(existing){
    if(existing.runtime.threadId!==context.threadId)throw Error('此目录的验证器绑定了另一个任务。请用独立目录和端口，不能混用原会话。');
    if(!existing.state.connected)throw Error('原宿主连接已失效。请先 npm run stop，再从原任务重新启动。');
    if(process.argv[2]!=='info')await fetch(existing.origin+'/api/game/reactivate',{method:'POST',headers:{Authorization:`Bearer ${existing.token}`}});
    const game=await (await fetch(existing.origin+'/api/game',{headers:{Authorization:`Bearer ${existing.token}`}})).json();
    await registerSave(registryDir,{adapter:context.adapter,threadId:context.threadId,hostLabel:game.hostLabel},existing.runtime.url,game.save?{...game.save,deleted:game.deleted}:null);
    if(!existing.state.catalogVersion)console.error('当前仍运行旧版服务：统一存档已登记；请从此原任务停止并重启服务后使用同页切换。');
    if(!game.recoverySupported)console.error('当前服务尚不支持中断后续聊：请在此原任务执行 npm run stop，再按宿主方式重新启动。数据目录和存档保持不变。');
    console.log(process.argv[2]==='info'?JSON.stringify({...existing.runtime,runtimePath,mcpCommand:process.execPath,mcpArgs:[join(root,'dist/mcp.js'),runtimePath]},null,2):existing.runtime.url);return;
  }
  if(context.host==='workbuddy'){
    if(process.argv[2]!=='serve')throw Error('WorkBuddy 首次启动：用它的 PowerShell/Bash 工具 run_in_background=true 运行 npm run launch -- serve，随后 npm run runtime。普通命令结束可能回收后台子进程，因此不使用瞬间成功的启动回执。');
    Object.assign(process.env,{GALGAME_HOST:context.host,GALGAME_DATA_DIR:dataDir,GALGAME_REGISTRY_DIR:registryDir,GALGAME_PORT:process.env.GALGAME_PORT||'0'});
    await import('../dist/cli.js');
    return;
  }
  await mkdir(dataDir,{recursive:true});
  const out=await open(join(dataDir,'server.stdout.log'),'a'),err=await open(join(dataDir,'server.stderr.log'),'a');
  const child=spawn(process.execPath,[join(root,'dist/cli.js')],{cwd:root,env:{...process.env,GALGAME_HOST:context.host,GALGAME_DATA_DIR:dataDir,GALGAME_REGISTRY_DIR:registryDir,GALGAME_PORT:process.env.GALGAME_PORT||(useLegacy?'4317':'0')},detached:true,windowsHide:true,stdio:['ignore',out.fd,err.fd]});
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
