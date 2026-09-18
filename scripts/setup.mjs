import {existsSync,readFileSync} from 'node:fs';
import {dirname,join,delimiter} from 'node:path';
import {homedir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const root=fileURLToPath(new URL('../',import.meta.url));
const args=process.argv.slice(2);
function option(name){const i=args.indexOf(name);if(i<0)return;const v=args[i+1];if(!v||v.startsWith('--'))throw Error(`${name} 缺少参数`);args.splice(i,2);return v;}
function run(file,argv){const r=spawnSync(file,argv,{cwd:root,stdio:'inherit',windowsHide:true,env:{...process.env,PATH:dirname(process.execPath)+delimiter+process.env.PATH}});if(r.error)throw r.error;if(r.status!==0)throw Error(`安装步骤失败，退出码 ${r.status}`);}
try{
  if(Number(process.versions.node.split('.')[0])<24)throw Error('需要 Node.js 24+；Windows x64 用户可直接下载含运行环境的完整 ZIP。');
  const requested=option('--host'),destination=option('--skill-dir');
  if(args.length)throw Error('用法：node scripts/setup.mjs [--host codex|workbuddy|qwenwork|all] [--skill-dir 安装位置]');
  const homes={codex:process.env.CODEX_HOME||join(homedir(),'.codex'),workbuddy:join(homedir(),'.workbuddy'),qwenwork:process.env.GALGAME_QWEN_HOME||join(homedir(),'.qwenworkcn')};
  const current=process.env.QODERWORK_SOURCE_CHAT_ID?'qwenwork':process.env.CODEBUDDY_SESSION_ID?'workbuddy':process.env.CODEX_THREAD_ID?'codex':undefined;
  const choice=requested||current||'all';
  if(!['all',...Object.keys(homes)].includes(choice))throw Error('此宿主尚无网页适配；Claude Desktop / Cowork 和 Claude Code 暂不支持。');
  const hosts=choice==='all'?Object.keys(homes).filter(h=>existsSync(homes[h])):[choice];
  if(!hosts.length)throw Error('没有找到已安装的支持宿主。请从 Codex、WorkBuddy 或千问办公原任务执行，或指定 --host。');
  if(destination&&hosts.length!==1)throw Error('--skill-dir 只能与单个 --host 一起使用。');
  // Full release ZIP has compiled output and production dependencies; no network needed.
  const compiled=existsSync(join(root,'dist/cli.js'));
  const packageVersion=JSON.parse(readFileSync(join(root,'package.json'),'utf8')).version;
  const manifestPath=join(root,'release-manifest.json');
  const prebuilt=compiled&&existsSync(manifestPath)&&JSON.parse(readFileSync(manifestPath,'utf8')).version===packageVersion;
  if(!prebuilt||!existsSync(join(root,'node_modules/@modelcontextprotocol/server/package.json'))){
    const npm=[process.env.npm_execpath,join(dirname(process.execPath),'node_modules/npm/bin/npm-cli.js'),join(dirname(process.execPath),'../lib/node_modules/npm/bin/npm-cli.js')].find(p=>p&&existsSync(p));
    if(!npm)throw Error('未找到 npm；请使用 Node.js 官方安装或 Windows 完整 ZIP。');
    run(process.execPath,[npm,'ci',...(prebuilt?['--omit=dev']:[])]);
    if(!prebuilt)run(process.execPath,[npm,'run','build']);
  }
  // Fail before touching existing Skills when the runtime payload is incomplete.
  for(const file of ['dist/host-context.js','dist/paths.js','dist/publish.js','web/game.html','skills/dont-build-an-app/SKILL.md'])if(!existsSync(join(root,file)))throw Error(`安装包缺少 ${file}，请重新下载完整包。`);
  for(const host of hosts)run(process.execPath,[join(root,'scripts/install-skill.mjs'),...(destination?[destination]:[]),'--host',host]);
  const version=JSON.parse(readFileSync(join(root,'package.json'),'utf8')).version;
  console.log(`\n天才设计师系统 ${version} 安装完成：${hosts.join('、')}。\n请保留当前文件夹；它是网页程序所在位置。\n回到对应 Agent 的原任务，说：使用天才设计师系统，打开网页审查我的创意。\nWorkBuddy 首次使用需按 docs/workbuddy.md 授权本机调试。安装器不会自动重启应用或创建模型会话。`);
}catch(error){console.error(error.message);process.exitCode=1;}
