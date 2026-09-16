const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.hash.slice(1));
const token = params.get('token') || sessionStorage.getItem('galgame-token');
if (token) { sessionStorage.setItem('galgame-token', token); history.replaceState(null, '', location.pathname); }
const api = async (path, options = {}) => {
  const response = await fetch(path, { ...options, headers: { Authorization:`Bearer ${token}`, 'Content-Type':'application/json', ...options.headers } });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
  return result;
};
const messages = new Map();
let cursor=0,initialized=false,polling=false,draftTimer,pendingId=null,baseMessageId=null,latestMessageId=null,sending=false,connected=false,unconfirmed=false,draftRevision=0;
const labels={submitting:'提交中',accepted:'宿主已接收，等待原记录确认',confirmed:'已在原会话确认',unknown:'结果待核对，不自动重发'};
const updateSend=()=>{$('send').disabled=!connected||sending||unconfirmed||baseMessageId!==latestMessageId;};
async function poll(){
  if(polling)return;polling=true;
  try{
    const state=await api(`/api/state?after=${cursor}`);
    connected=state.connected;
    $('status').textContent=connected?'已连接 · 实验性验证':'连接已断开';
    $('thread').textContent=state.thread.id;
    for(const m of state.messages){
      cursor=Math.max(cursor,m.seq);
      if(messages.has(m.id))continue;
      messages.set(m.id,m);
      const item=document.createElement('article');item.className='message';item.dataset.messageId=m.id;
      const name=document.createElement('strong');name.textContent=m.role==='user'?'你说':'Agent';
      const text=document.createElement('pre');text.textContent=m.text;
      const time=document.createElement('small');time.textContent=`${m.timestamp} · ${m.id} · ${m.kind}`;
      item.append(name,text,time);$('messages').append(item);
    }
    latestMessageId=state.latestMessageId;
    if(!initialized){
      $('input').value=state.draft||'';baseMessageId=state.draftBaseMessageId ?? latestMessageId;
      $('messages').scrollTop=$('messages').scrollHeight;initialized=true;
    }
    if(!$('input').value.trim())baseMessageId=latestMessageId;
    $('review-latest').hidden=baseMessageId===latestMessageId;
    $('count').textContent=`${messages.size} 条`;
    unconfirmed=state.submissions.some(s=>['submitting','accepted','unknown'].includes(s.status));
    $('submissions').replaceChildren(...state.submissions.slice(-8).reverse().map(s=>{
      const p=document.createElement('p');p.textContent=`${labels[s.status]||s.status} · ${s.id}${s.host_id?' → '+s.host_id:''}`;return p;
    }));
    if(pendingId&&state.submissions.some(s=>s.id===pendingId&&s.status==='confirmed')){
      $('notice').textContent='已在同一原会话中找到对应记录。请同时核对原窗口显示。';pendingId=null;
    }
    if(state.lastError)$('notice').textContent=state.lastError;
  }catch(error){connected=false;$('status').textContent='连接或读取失败';$('notice').textContent=error.message;}
  finally{polling=false;updateSend();}
}
async function saveDraft(revision){
  try{await api('/api/draft',{method:'PUT',body:JSON.stringify({text:$('input').value,baseMessageId})});if(revision===draftRevision)$('draft-state').textContent='已保存';}
  catch{if(revision===draftRevision)$('draft-state').textContent='保存失败，请复制输入';}
}
$('input').addEventListener('input',()=>{
  $('draft-state').textContent='保存中…';clearTimeout(draftTimer);const revision=++draftRevision;
  draftTimer=setTimeout(()=>saveDraft(revision),250);
});
$('review-latest').addEventListener('click',()=>{
  $('messages').scrollTop=$('messages').scrollHeight;baseMessageId=latestMessageId;
  $('review-latest').hidden=true;$('notice').textContent='已定位最新消息；草稿仍保留。';updateSend();void saveDraft(++draftRevision);
});
$('send-form').addEventListener('submit',async event=>{
  event.preventDefault();const text=$('input').value;if(!text.trim()||sending)return;
  sending=true;updateSend();const id=crypto.randomUUID();pendingId=id;
  try{await api('/api/messages',{method:'POST',body:JSON.stringify({id,text,baseMessageId})});$('notice').textContent='已交给原 Agent，正在核对原会话记录。';}
  catch(error){$('notice').textContent=error.message;}
  finally{sending=false;await poll();updateSend();}
});
$('reconnect').addEventListener('click',async()=>{
  try{await api('/api/reconnect',{method:'POST'});$('notice').textContent='连接已重新建立，正在核对消息。';await poll();}
  catch(error){$('notice').textContent=error.message;}
});
$('export').addEventListener('click',async()=>{
  try{
    const data=await api('/api/evidence');const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='galgame-sync-evidence.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(error){$('notice').textContent=error.message;}
});
await poll();setInterval(poll,1500);
