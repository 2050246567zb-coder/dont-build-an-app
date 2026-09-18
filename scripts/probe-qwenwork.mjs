import {hostContext} from '../dist/host-context.js';
import {QwenWorkAdapter} from '../dist/adapters/qwenwork.js';
let adapter;
try{
  const host=hostContext();
  if(host.host!=='qwenwork')throw Error('请从千问办公原任务运行探测，不接受其他宿主的会话标识');
  adapter=new QwenWorkAdapter(host.threadId);
  await adapter.capabilities();const task=await adapter.readThread();
  const messages=[];await adapter.poll(m=>messages.push(m));
  console.log(JSON.stringify({application:'千问办公',status:'experimental-not-certified',currentTask:task.thread.id,hostState:task.thread.status,historyMessages:messages.length,finalMessages:messages.filter(m=>m.role==='assistant').length,readOnly:true,tests:{nativeVisibility:'requires-user-check',bidirectional:'not-tested-by-this-probe'}},null,2));
}catch(e){console.error(e.message);process.exitCode=1;}finally{adapter?.close();}
