import { startServer } from './server.ts';
import { resolve } from 'node:path';
import {probe} from './probe.ts';
import {hostContext} from './host-context.ts';
import {WorkBuddyAdapter} from './adapters/workbuddy.ts';

async function main() {
  if (process.argv[2] !== 'probe') {
    const context=hostContext();
    const adapter=context.host==='workbuddy'?new WorkBuddyAdapter(context.threadId,context.origin!):undefined;
    // The desktop lazily loads history after restart. Retry reads only, never sends.
    if(adapter){
      let loaded=false;
      try{for(let i=0;i<8;i++){try{await adapter.reader.poll(()=>{});loaded=true;break;}catch(error){if(i===7)throw error;await new Promise(r=>setTimeout(r,500));}}}
      catch(error){adapter.close();throw error;}
      if(!loaded){adapter.close();throw Error('WorkBuddy 原任务历史未加载完成');}
    }
    const app = await startServer({dataDir:resolve(process.env.GALGAME_DATA_DIR || '.galgame'),port:Number(process.env.GALGAME_PORT || 4317),registryDir:process.env.GALGAME_REGISTRY_DIR,adapter});
    process.once('SIGINT',()=>{void app.close().then(()=>process.exit(0));});
    process.once('SIGTERM',()=>{void app.close().then(()=>process.exit(0));});
    return;
  }
  console.log(JSON.stringify(await probe(),null,2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
