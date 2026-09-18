type Pending = {resolve:(value:any)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>};

export function workBuddyDebugOrigin(value:string):string {
  const url=new URL(value);
  if(url.protocol!=='http:' || url.hostname!=='127.0.0.1' || !url.port || url.username || url.password || url.pathname!=='/' || url.search || url.hash)throw Error('WorkBuddy 调试地址必须是 http://127.0.0.1:端口');
  return url.origin;
}

/** Explicit, loopback-only attachment to a running WorkBuddy desktop window.
 * Does not start/restart WorkBuddy, change its authentication, or create a session.
 * Internal desktop APIs are version-specific; this is an experimental transport.
 */
export class WorkBuddyCdp {
  private socket?:WebSocket;
  private nextId=1;
  private pending=new Map<number,Pending>();
  private connecting?:Promise<void>;
  readonly origin:string;
  constructor(origin:string,readonly targetId?:string){this.origin=workBuddyDebugOrigin(origin);}

  async connect():Promise<void>{
    if(this.connecting)return this.connecting;
    if(this.socket?.readyState===WebSocket.OPEN)return;
    this.connecting=this.open().finally(()=>{this.connecting=undefined;});
    return this.connecting;
  }
  private async open():Promise<void>{
    const response=await fetch(`${this.origin}/json/list`,{signal:AbortSignal.timeout(2500),redirect:'error'});
    if(!response.ok)throw Error(`WorkBuddy 调试端口不可用：HTTP ${response.status}`);
    const all:any=await response.json();
    if(!Array.isArray(all))throw Error('调试目标列表无效');
    const targets=all.filter(t=>t.type==='page' && typeof t.url==='string' && /^file:\/\//.test(t.url) && /app\.asar\/renderer\/index\.html(?:[?#]|$)/.test(t.url) && (!this.targetId || t.id===this.targetId));
    if(targets.length!==1)throw Error(`需要唯一的 WorkBuddy 主窗口，当前找到 ${targets.length} 个；请关闭多余 WorkBuddy 主窗口后重试。`);
    const target=targets[0],address=new URL(target.webSocketDebuggerUrl);
    if(address.protocol!=='ws:' || address.hostname!=='127.0.0.1' || address.port!==new URL(this.origin).port || address.username || address.password || address.pathname!==`/devtools/page/${target.id}` || address.search || address.hash)throw Error('调试目标返回了非预期地址');
    const socket=new WebSocket(address);this.socket=socket;
    await new Promise<void>((resolve,reject)=>{
      const timer=setTimeout(()=>{socket.close();reject(Error('WorkBuddy 调试连接超时'));},3000);
      socket.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});
      socket.addEventListener('error',()=>{clearTimeout(timer);reject(Error('WorkBuddy 调试连接失败'));},{once:true});
    });
    socket.addEventListener('message',event=>{
      if(typeof event.data!=='string' || event.data.length>20_000_000){this.close();return;}
      let message:any;try{message=JSON.parse(event.data);}catch{this.close();return;}
      const pending=this.pending.get(message.id);if(!pending)return;
      clearTimeout(pending.timer);this.pending.delete(message.id);
      if(message.error)pending.reject(Error(String(message.error.message)));else pending.resolve(message.result);
    });
    socket.addEventListener('close',()=>{if(this.socket===socket)this.close();});
    socket.addEventListener('error',()=>{if(this.socket===socket)this.close();});
    const identity=await this.evaluate('({bridge:typeof window.__wbInvoke,desktop:typeof window.workbuddyDesktop})');
    if(identity?.bridge!=='function' || identity?.desktop!=='object'){this.close();throw Error('当前调试目标不是支持该接口的 WorkBuddy 主窗口');}
  }

  private request(method:string,params:unknown):Promise<any>{
    if(this.socket?.readyState!==WebSocket.OPEN)throw Error('WorkBuddy 调试连接已关闭');
    const id=this.nextId++;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending.delete(id);reject(Error('WorkBuddy 请求超时；发送结果可能未知，禁止自动重发'));},15000);
      this.pending.set(id,{resolve,reject,timer});
      try{this.socket!.send(JSON.stringify({id,method,params}));}catch(error){clearTimeout(timer);this.pending.delete(id);reject(error);}
    });
  }
  private async evaluate(expression:string):Promise<any>{
    const result=await this.request('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
    if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'WorkBuddy 调用失败');
    return result.result?.value;
  }
  async invoke(method:'get'|'requests'|'sendPrompt',threadId:string,...args:unknown[]):Promise<any>{
    if(!['get','requests','sendPrompt'].includes(method) || !/^[a-f0-9-]{36}$/i.test(threadId))throw Error('不允许的 WorkBuddy 会话调用');
    await this.connect();
    // JSON is embedded as JavaScript data, never as shell code. Fixed API surface.
    const call=JSON.stringify([`wb:conversations:${method}`,{},threadId,...args]);
    return this.evaluate(`window.__wbInvoke(...${call})`);
  }
  close():void{
    const socket=this.socket;this.socket=undefined;
    if(socket && socket.readyState!==WebSocket.CLOSED)socket.close();
    for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error('WorkBuddy 调试连接已断开；不会自动重发'));}
    this.pending.clear();
  }
}
