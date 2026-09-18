import {cp,mkdir,writeFile,stat} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {homedir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {sharedHome} from '../dist/paths.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const args=process.argv.slice(2),hostIndex=args.indexOf('--host');
const host=hostIndex>=0?args.splice(hostIndex,2)[1]:(process.env.QODERWORK_SOURCE_CHAT_ID?'qwenwork':process.env.CODEBUDDY_SESSION_ID?'workbuddy':'codex');
if(!['codex','workbuddy','qwenwork'].includes(host) || args.length>1)throw Error('用法：npm run install:skill -- [安装路径] [--host codex|workbuddy|qwenwork]');
const skillHome=host==='qwenwork'?process.env.GALGAME_QWEN_HOME||join(homedir(),'.qwenworkcn'):host==='workbuddy'?join(homedir(),'.workbuddy'):process.env.CODEX_HOME||join(homedir(),'.codex');
const destination=resolve(args[0]||join(skillHome,'skills','dont-build-an-app'));
const source=join(root,'skills','dont-build-an-app');
if(destination===resolve(source))throw Error('安装位置不能覆盖仓库源文件');
let exists=false;try{exists=(await stat(destination)).isDirectory();}catch{}
if(exists){const backup=join(root,'.galgame','skill-backups',new Date().toISOString().replace(/[:.]/g,'-'));await cp(destination,backup,{recursive:true});console.log(`旧版本已备份：${backup}`);}
await mkdir(destination,{recursive:true});await cp(source,destination,{recursive:true});
await writeFile(join(destination,'runtime-location.json'),JSON.stringify({host,repository:root,node:process.execPath,launcher:join(root,'scripts','launcher.mjs'),publisher:join(root,'dist','publish.js'),sharedHome:sharedHome(),catalogVersion:2,preferredMode:'web'},null,2));
console.log(`已安装 Skill：${destination}\n共享存档目录：${sharedHome()}\n从各 Agent 的原任务启动网页并开始游戏后，存档会自动汇总。启动前读取 references/galgame-mode.md；MCP 配置可选，未改动宿主全局配置。`);
