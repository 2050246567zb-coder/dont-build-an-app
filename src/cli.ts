import { startServer } from './server.ts';
import { resolve } from 'node:path';
import {probe} from './probe.ts';

async function main() {
  if (process.argv[2] !== 'probe') {
    const app = await startServer({dataDir:resolve(process.env.GALGAME_DATA_DIR || '.galgame'),port:Number(process.env.GALGAME_PORT || 4317)});
    process.once('SIGINT',()=>{void app.close().then(()=>process.exit(0));});
    process.once('SIGTERM',()=>{void app.close().then(()=>process.exit(0));});
    return;
  }
  console.log(JSON.stringify(await probe(),null,2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
