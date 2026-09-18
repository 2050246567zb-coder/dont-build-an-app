import {workBuddyDebugOrigin} from './adapters/workbuddy-cdp.ts';

/** Bind only to the task environment provided by the host, never a recent-task lookup. */
export function hostContext(env:NodeJS.ProcessEnv=process.env){
  const host=env.GALGAME_HOST || (env.QODERWORK_SOURCE_CHAT_ID?'qwenwork':env.CODEBUDDY_SESSION_ID?'workbuddy':'codex');
  if(host==='qwenwork'){
    const threadId=env.QODERWORK_SOURCE_CHAT_ID;
    if(!threadId||!/^[a-zA-Z0-9_-]{8,80}$/.test(threadId))throw Error('请从千问办公原任务启动，缺少 QODERWORK_SOURCE_CHAT_ID；不能借用 Codex 会话。');
    return {host,threadId,adapter:'qwenwork-local-connector',origin:undefined};
  }
  if(host==='claude-desktop')throw Error('当前 Claude Desktop 拒绝调试启动，原会话双向同步尚未适配；不会创建替代会话。');
  if(host==='workbuddy'){
    const threadId=env.CODEBUDDY_SESSION_ID;
    if(!threadId || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(threadId))throw Error('请从当前 WorkBuddy 原任务启动，缺少有效的 CODEBUDDY_SESSION_ID。');
    const origin=env.GALGAME_WORKBUDDY_CDP || (env.WORKBUDDY_REMOTE_DEBUGGING_PORT?`http://127.0.0.1:${env.WORKBUDDY_REMOTE_DEBUGGING_PORT}`:'');
    if(!origin)throw Error('WorkBuddy 实验适配需要先按 docs/workbuddy.md 开启本机调试，并设置 GALGAME_WORKBUDDY_CDP。不会自动重启应用。');
    return {host,threadId,adapter:'workbuddy-desktop-cdp',origin:workBuddyDebugOrigin(origin)};
  }
  if(host!=='codex')throw Error('未知宿主；仅有 Codex、WorkBuddy 和千问办公实验适配。');
  if(!env.CODEX_THREAD_ID || !env.CODEX_APP_TOOLS_PIPE_PATH || !env.CODEX_HOME)throw Error('请由现有 Codex 桌面任务执行此命令；普通终端缺少当前会话绑定。');
  return {host,threadId:env.CODEX_THREAD_ID,adapter:'codex-desktop-app-tools',origin:undefined};
}
