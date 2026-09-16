import {spawnSync} from 'node:child_process';
import {CodexPipe} from './adapters/codex-pipe.ts';

function commandVersion(command:string) {
  const r=spawnSync(command,['--version'],{encoding:'utf8',timeout:10000,windowsHide:true,shell:false});
  return r.error ? {available:false,reason:(r.error as NodeJS.ErrnoException).code} : {available:r.status===0,version:r.stdout.trim().slice(0,150)};
}
export async function probe(){
  const result:any={schemaVersion:1,checkedAt:new Date().toISOString(),os:process.platform,node:process.version,
    codex:{cli:commandVersion('codex'),currentConversationBound:false,compatibility:'not-certified'},
    claudeCode:{cli:commandVersion('claude'),currentConversationBound:false,compatibility:'not-certified',reason:'Requires a real existing Claude Code conversation and a separately validated adapter; no substitute model session will be started.'}};
  const threadId=process.env.CODEX_THREAD_ID,pipe=process.env.CODEX_APP_TOOLS_PIPE_PATH;
  if(!threadId||!pipe){result.codex.reason='Current desktop conversation binding is absent';return result;}
  const adapter=new CodexPipe(pipe,threadId);
  try{
    result.codex.tools=(await adapter.capabilities()).map(x=>x.name);
    const host=await adapter.readThread();
    result.codex.currentConversationBound=host.thread?.id===threadId;
    result.codex.status=host.thread?.status?.type;
    result.codex.history='Read-only rollout adapter; app-tools read_thread returned no message body in the tested active turn.';
  }catch(e:any){result.codex.reason=e.message;}finally{adapter.close();}
  return result;
}
