import {cp,mkdir,writeFile,stat} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {homedir} from 'node:os';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const destination=resolve(process.argv[2]||join(process.env.CODEX_HOME||join(homedir(),'.codex'),'skills','dont-build-an-app'));
const source=join(root,'skills','dont-build-an-app');
if(destination===resolve(source))throw Error('安装位置不能覆盖仓库源文件');
let exists=false;try{exists=(await stat(destination)).isDirectory();}catch{}
if(exists){const backup=join(root,'.galgame','skill-backups',new Date().toISOString().replace(/[:.]/g,'-'));await cp(destination,backup,{recursive:true});console.log(`旧版本已备份：${backup}`);}
await mkdir(destination,{recursive:true});await cp(source,destination,{recursive:true});
await writeFile(join(destination,'runtime-location.json'),JSON.stringify({repository:root,node:process.execPath,launcher:join(root,'scripts','launcher.mjs'),publisher:join(root,'dist','publish.js')},null,2));
console.log(`已安装 Skill：${destination}\n启动网页前读取 references/galgame-mode.md；MCP 配置可选，未改动宿主全局配置。`);
