import {workBuddyDebugOrigin} from './adapters/workbuddy-cdp.ts';

/** Bind only to the task environment provided by the host, never a recent-task lookup. */
export function hostContext(env:NodeJS.ProcessEnv=process.env){
  const host=env.GALGAME_HOST || (env.CODEBUDDY_SESSION_ID?'workbuddy':'codex');
  if(host==='workbuddy'){
    const threadId=env.CODEBUDDY_SESSION_ID;
    if(!threadId || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(threadId))throw Error('请从当前 WorkBuddy 原任务启动，缺少有效的 CODEBUDDY_SESSION_ID。');
    const origin=env.GALGAME_WORKBUDDY_CDP || (env.WORKBUDDY_REMOTE_DEBUGGING_PORT?`http://127.0.0.1:${env.WORKBUDDY_REMOTE_DEBUGGING_PORT}`:'');
    if(!origin)throw Error('WorkBuddy 实验适配需要先按 docs/workbuddy.md 开启本机调试，并设置 GALGAME_WORKBUDDY_CDP。不会自动重启应用。');
    return {host,threadId,adapter:'workbuddy-desktop-cdp',origin:workBuddyDebugOrigin(origin)};
  }
  if(host!=='codex')throw Error('未知宿主；仅有 Codex 和 WorkBuddy 实验适配。');
  if(!env.CODEX_THREAD_ID || !env.CODEX_APP_TOOLS_PIPE_PATH || !env.CODEX_HOME)throw Error('请由现有 Codex 桌面任务执行此命令；普通终端缺少当前会话绑定。');
  return {host,threadId:env.CODEX_THREAD_ID,adapter:'codex-desktop-app-tools',origin:undefined};
}
