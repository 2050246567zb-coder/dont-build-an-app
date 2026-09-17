import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

// Read-only discovery. Never starts a model, enables debugging, reads account
// credentials, or calls a conversation mutation on behalf of a probe.
export function localDebugOrigin(value) {
  const url = new URL(value);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port ||
      url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw Error('调试地址必须是 http://127.0.0.1:端口，不接受远程地址、凭证或额外路径。');
  }
  return url.origin;
}

async function readJson(fetchImpl, url) {
  const response = await fetchImpl(url, {signal:AbortSignal.timeout(1500), redirect:'error'});
  if (!response.ok) throw Error(`HTTP ${response.status}`);
  const text = await response.text();
  if (text.length > 1_000_000) throw Error('探测响应过大');
  return JSON.parse(text);
}

export async function probeWorkBuddy({env=process.env, fetchImpl=fetch}={}) {
  const candidates = await Promise.allSettled([18488,18489,18490].map(async port => {
    const data = await readJson(fetchImpl, `http://127.0.0.1:${port}/workbuddy/probe`);
    if (data.app !== 'workbuddy-desktop' || data.ok !== true || typeof data.version !== 'string') {
      throw Error('此端口不是 WorkBuddy 探活接口');
    }
    return {port,version:data.version,platform:data.platform};
  }));
  const applications = candidates.filter(r=>r.status==='fulfilled').map(r=>r.value);
  const rawSession = env.CODEBUDDY_SESSION_ID;
  const sessionId = typeof rawSession==='string' && /^[a-f0-9-]{36}$/i.test(rawSession) ? rawSession : null;
  const result = {
    schemaVersion:1, checkedAt:new Date().toISOString(), application:'WorkBuddy',
    compatibility:'not-verified', desktop:applications,
    currentTask:{sessionId, source:sessionId?'CODEBUDDY_SESSION_ID':null, verified:false},
    debug:{configured:false,reachable:false},
    tests:{sameConversation:false,bidirectional:false,visibleInHost:false,reconnectDeduplication:false},
    nextStep:sessionId?'已有宿主会话标识，仍需验证双向同步。':'请在要连接的 WorkBuddy 原对话内运行本探测，不能用 Codex 会话标识代替。'
  };
  if (env.GALGAME_WORKBUDDY_CDP) {
    result.debug.configured=true;
    try {
      const origin=localDebugOrigin(env.GALGAME_WORKBUDDY_CDP);
      const version=await readJson(fetchImpl, `${origin}/json/version`);
      if(typeof version.Browser!=='string' || typeof version['Protocol-Version']!=='string')throw Error('此端口不是可识别的调试接口');
      result.debug={configured:true,reachable:true,browser:version.Browser,protocol:version['Protocol-Version']};
    } catch(error) {result.debug.error=error.message;}
  }
  // Endpoint reachability and MCP support do not prove any synchronization test.
  return result;
}

if (process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  console.log(JSON.stringify(await probeWorkBuddy(),null,2));
}
