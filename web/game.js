import {renderMarkdown} from './markdown.js';
import {bindCompanion,prefersLive2d,setLive2dPreference,changePortrait} from './companion.js';
const $=id=>document.getElementById(id);
const menuCompanion=bindCompanion({floating:$('menu-companion-float'),body:$('menu-companion-body'),image:$('menu-companion-image'),button:$('menu-companion')});
const stageCompanion=bindCompanion({floating:$('portrait-float'),body:$('portrait-body'),image:$('portrait'),button:$('stage-companion'),enabled:false});
const query=new URLSearchParams(location.hash.slice(1));
const token=query.get('token')||sessionStorage.getItem('galgame-token');
if(token){sessionStorage.setItem('galgame-token',token);history.replaceState(null,'',location.pathname);}
const viewer=crypto.randomUUID(),names={system:'AI',jobs:'乔布斯',xiaohei:'小黑',user:'你说'},chapters={screening:'第一章 · 这个想法值得做吗',design:'第二章 · 把核心想清楚',experience:'第三章 · 真的好用吗',delivery:'终章 · 让想法开始发生'};
const emotionNames={neutral:'',thinking:'思考中',skeptical:'有点怀疑',angry:'不太满意',approval:'这次，说通了',surprised:'出乎意料'};
let selectedSave=sessionStorage.getItem('galgame-selected-save')||'',switching=false;
const sessionPath=path=>selectedSave?`/api/sessions/${selectedSave}${path}`:path;
const rootApi=async(path,method='GET',body)=>{const r=await fetch(path,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const value=await r.json();if(!r.ok)throw Object.assign(Error(value.error||'连接暂时不可用'),{status:r.status});return value;};
const api=(path,method,body)=>rootApi(sessionPath(path),method,body);
let state=null,inGame=false,index=-1,current=null,typing=false,chars=[],shown=0,typeTimer,speedUp=false,owned=false,sending=false,base=null,initialized=false,polling=false,saveTimer,draftRevision=0,closedReply=false,waitTimer,lastProgressAt=Date.now(),signature='',doc=null,portraitBlob=null,assetRequest=0,toastTimer,saveToDelete=null,pendingSubmit=null;
const toast=text=>{$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{$('toast').hidden=true;},6500);};
const safe=fn=>(...args)=>Promise.resolve(fn(...args)).catch(e=>toast(e.message));
function banner(){
  let text='';if(!state?.connected)text='原 Agent 暂未连接。草稿仍可编辑，请回原任务重新启动连接。';
  else if(!owned&&inGame)text='另一标签页正在操作。点这里接管此会话。';
  else if(state.pending.some(p=>p.status==='mismatch'))text='收到的正式回复与剧情不一致。请回原 Agent 修正格式，已有内容会保留。';
  else if(inGame&&Date.now()-lastProgressAt>60000&&(!current||current.speaker==='user'))text='等待较久。你可以回原 Agent 查看是否需要处理权限、登录或生成错误。';
  $('status-banner').hidden=!text;$('status-banner').textContent=text;
}
function updateSend(){const latest=state?.timeline.at(-1);const contextValid=!latest||latest.id===current?.id&&latest.advance==='reply';const pending=state?.submissions.some(s=>['submitting','accepted','unknown'].includes(s.status));$('reply').readOnly=!owned;$('send').disabled=!state?.connected||!owned||sending||pending||base!==state?.latestMessageId||!contextValid||!$('reply').value.trim();$('review').hidden=base===state?.latestMessageId;}
async function poll(){
  if(polling||switching)return;polling=true;
  try{
    const next=await api('/api/game');const sig=next.timeline.map(s=>s.id).join('|');
    if(sig!==signature){signature=sig;lastProgressAt=Date.now();}
    state=next;$('connection').textContent=state.connected?`已连接 · ${state.hostLabel}`:'原 Agent 未连接';
    if(!initialized){$('reply').value=state.draft;let cache;try{cache=JSON.parse(localStorage.getItem(`draft:${state.save?.id}`)||'null');pendingSubmit=JSON.parse(localStorage.getItem(`pending:${state.save?.id}`)||'null');}catch{}if(cache&&cache.text!==state.draft&&cache.at>Date.parse(state.save?.updatedAt||0)){$('reply').value=cache.text;toast('已恢复网页缓存中的未发送草稿，请核对内容。');}base=state.draftBaseMessageId??state.latestMessageId;initialized=true;applyPreferences();}
    if(!$('reply').value.trim()&&!sending)base=state.latestMessageId;
    if(inGame){owned=(await api('/api/game/lease','POST',{clientId:viewer})).owned;if(state.deleted){goHome();toast('此网页存档已删除。请从原任务重新启动。');}else if(current?.speaker==='user'&&index<state.timeline.length-1&&!typing){show(index+1);}else if(!current&&state.timeline.length){show(0);}}
    if(pendingSubmit){const confirmed=state.submissions.find(s=>s.id===pendingSubmit.id&&s.status==='confirmed');if(confirmed){if($('reply').value===pendingSubmit.text&&owned){$('reply').value='';base=state.latestMessageId;await saveDraft(++draftRevision);}localStorage.removeItem(`pending:${state.save?.id}`);pendingSubmit=null;const next=state.timeline.findIndex(s=>s.hostId===confirmed.host_id);if(inGame&&next>=0)show(next);}}
    banner();updateSend();
  }catch(e){$('connection').textContent='连接暂时中断';if(state){state.connected=false;banner();updateSend();}else toast(selectedSave?'此存档暂未连接，可以在「读取存档」里选择其他对话。':'请从原 Agent 提供的启动链接进入。');}
  finally{polling=false;}
}
function applyPreferences(){$('spirit-motion').checked=prefersLive2d();if(!state)return;$('speed').value=state.prefs.speed;$('speed-value').textContent=state.prefs.speed?`${state.prefs.speed} 字 / 秒`:'直接显示';document.querySelector(`input[name=images][value=${state.prefs.imageMode}]`).checked=true;}
function setPortrait(speaker,emotion='neutral',segment){
  const request=++assetRequest;
  if(speaker==='user')return;
  stageCompanion.reset(false);$('stage-companion').hidden=true;
  const apply=async(src,generated=false)=>{
    if(request!==assetRequest){if(generated)URL.revokeObjectURL(src);return;}
    let committed=false;
    try{await changePortrait($('portrait-body'),$('portrait'),src,`${names[speaker]} · ${emotionNames[emotion]||'平静'}`,()=>{
      committed=true;
      if(portraitBlob)URL.revokeObjectURL(portraitBlob);portraitBlob=generated?src:null;
      stageCompanion.setEnabled(speaker==='system'&&!generated);
      $('stage').dataset.speaker=speaker;$('stage').dataset.artwork=generated?'generated':'builtin';
      $('emotion').textContent=emotionNames[emotion]||'';
    },()=>request===assetRequest);}finally{if(generated&&!committed)URL.revokeObjectURL(src);}
  };
  const fallback=()=>apply(`/builtin/${speaker}/${emotion}`).catch(()=>{if(request===assetRequest)toast('立绘暂时加载不了，文字对话可以继续。');});
  if(segment?.asset_id&&state.prefs.imageMode==='generated'){
    fetch(sessionPath(`/api/game/resource/image/${segment.turnId}/${segment.asset_id}`),{headers:{Authorization:`Bearer ${token}`}}).then(r=>{if(!r.ok)throw Error();return r.blob();}).then(blob=>{if(request!==assetRequest)return;return apply(URL.createObjectURL(blob),true);}).catch(()=>{if(request===assetRequest){toast('这张配图暂不可用，已使用内置立绘。');void fallback();}});
  }else void fallback();
}
function stopType(){clearTimeout(typeTimer);typing=false;}
function fullText(){stopType();shown=chars.length;$('dialogue-text').textContent=chars.join('');finish();}
function tick(){
  if(!typing)return;const speed=state?.prefs.speed??30;if(speed===0||matchMedia('(prefers-reduced-motion: reduce)').matches){fullText();return;}
  shown=Math.min(chars.length,shown+(speedUp?4:1));$('dialogue-text').textContent=chars.slice(0,shown).join('');
  if(shown===chars.length){typing=false;finish();}else typeTimer=setTimeout(tick,1000/speed);
}
function show(i){
  clearInterval(waitTimer);$('dialogue-text').classList.remove('is-thinking');stopType();closedReply=false;index=i;current=state.timeline[i]??null;doc=null;speedUp=false;$('accelerate').textContent='加速';
  for(const id of ['reply-panel','reply-reopen','delivery','next','raw-open'])$(id).hidden=true;
  if(!current){onboarding();return;}
  $('chapter').textContent=chapters[current.stage]||'你的想法 · 在这里继续';$('speaker').textContent=names[current.speaker];$('play-state').textContent='';
  setPortrait(current.speaker,current.emotion,current);chars=Array.from(current.text);shown=0;typing=true;$('dialogue-text').textContent='';tick();
  if(owned)void api('/api/game/position','PUT',{clientId:viewer,position:current.id}).catch(()=>{});
}
function finish(){
  if(!current)return;
  if(current.advance==='reply'){
    $('play-state').textContent='不用急，想清楚再回答。';
    if(index===state.timeline.length-1){$('reply-panel').hidden=closedReply;$('reply-reopen').hidden=!closedReply;updateSend();}else{$('play-state').textContent='这个问题已有后续对话。';$('next').hidden=false;}
  }else if(current.advance==='complete'){
    if(index<state.timeline.length-1){$('next').hidden=false;}
    $('play-state').textContent='文档可以完整阅读和下载。';void prepareDocument();
  }else if(current.advance==='error'){$('raw-open').hidden=false;$('play-state').textContent='请回原 Agent 处理；不会把格式错误当作角色台词。';if(index<state.timeline.length-1)$('next').hidden=false;}
  else if(index<state.timeline.length-1){$('next').hidden=false;$('play-state').textContent='点击继续这段对话。';}
  else if(current.speaker==='user'){waiting();}
}
function waiting(){
  const actor=[...state.timeline.slice(0,index)].reverse().find(s=>s.speaker!=='user'&&s.advance!=='error')?.speaker||'system';
  setPortrait(actor,'thinking');$('speaker').textContent=names[actor];$('play-state').textContent='等待原 Agent 回复 · 不会重复发送';
  const phrases={system:['嗯，让我想想','你刚说的这点，我捋一下'],jobs:['等一下，让我想想','先别急，这里有个地方'],xiaohei:['等会儿，我琢磨一下','照你这么说，我想想自己会怎么用']}[actor];let n=0;
  const phrase=document.createElement('span'),dots=document.createElement('span');dots.className='thinking-dots';dots.setAttribute('aria-hidden','true');
  for(let i=0;i<3;i++){const dot=document.createElement('span');dot.textContent='.';dots.append(dot);}
  phrase.textContent=phrases[0];$('dialogue-text').classList.add('is-thinking');$('dialogue-text').replaceChildren(phrase,dots);
  waitTimer=setInterval(()=>{phrase.textContent=phrases[++n%phrases.length];banner();},4000);
}
function onboarding(){
  $('chapter').textContent='序章 · 一个想法就够了';$('speaker').textContent='AI';$('dialogue-text').textContent='先说说你想做什么。哪怕现在只有一个模糊的念头，也可以从这里开始。';$('play-state').textContent='同一段对话，换一种打开方式。';setPortrait('system');$('reply-panel').hidden=false;updateSend();
}
async function enter(){
  if(!state.save)await api('/api/game/start','POST');await poll();
  if(!state.save)throw Error('请回原任务重新启动网页模式');owned=(await api('/api/game/lease','POST',{clientId:viewer})).owned;
  menuCompanion.reset();inGame=true;$('menu').hidden=true;$('stage').hidden=false;$('save-title').textContent=state.save.title;
  const saved=state.timeline.findIndex(s=>s.id===state.save.position);show(saved>=0?saved:0);banner();
}
function goHome(){stopType();clearInterval(waitTimer);$('dialogue-text').classList.remove('is-thinking');stageCompanion.reset();inGame=false;$('stage').hidden=true;$('menu').hidden=false;}
async function saveDraft(revision){if(!owned)return;const text=$('reply').value,saveId=state.save?.id;try{await api('/api/draft','PUT',{text,baseMessageId:base,viewerId:viewer,gameSessionId:saveId});if(revision===draftRevision){$('draft-status').textContent='已保存';localStorage.removeItem(`draft:${saveId}`);}}catch{if(revision===draftRevision)$('draft-status').textContent='连接中断，已暂存在此浏览器';}}
$('reply').addEventListener('input',()=>{draftRevision++;$('draft-status').textContent='保存中…';try{localStorage.setItem(`draft:${state?.save?.id}`,JSON.stringify({text:$('reply').value,at:Date.now()}));}catch{$('draft-status').textContent='本地缓存失败，请复制文字';}clearTimeout(saveTimer);saveTimer=setTimeout(()=>saveDraft(draftRevision),250);updateSend();});
$('reply').addEventListener('blur',()=>{clearTimeout(saveTimer);void saveDraft(draftRevision);});
async function sendText(text){
  if(sending)return;sending=true;updateSend();const id=crypto.randomUUID();
  pendingSubmit={id,text};localStorage.setItem(`pending:${state.save.id}`,JSON.stringify(pendingSubmit));
  try{await api('/api/messages','POST',{id,text,baseMessageId:base,viewerId:viewer,gameSessionId:state.save.id,replyTo:current?.id??null});
    await poll();if(pendingSubmit)toast('已提交，正在核对原会话；草稿仍保留。');
  }catch(e){if(e.status>=400&&e.status<500){pendingSubmit=null;localStorage.removeItem(`pending:${state.save.id}`);}throw e;}finally{sending=false;updateSend();}
}
$('reply-form').addEventListener('submit',e=>{e.preventDefault();if(!$('send').disabled)void safe(()=>sendText($('reply').value))();});
$('next').onclick=()=>{if(typing){fullText();return;}if(index<state.timeline.length-1)show(index+1);};
$('skip').onclick=()=>{if(typing)fullText();};$('accelerate').onclick=()=>{speedUp=!speedUp;$('accelerate').textContent=speedUp?'正常速度':'加速';};
$('dialogue').addEventListener('click',e=>{if(e.target.closest('button'))return;if(typing)fullText();else if(!$('next').hidden)$('next').click();});
document.addEventListener('keydown',e=>{if(e.code==='Space'&&inGame&&!document.querySelector('dialog[open]')&&!['TEXTAREA','INPUT','BUTTON'].includes(document.activeElement.tagName)){e.preventDefault();if(typing)fullText();else if(!$('next').hidden)$('next').click();}});
$('reply-close').onclick=()=>{closedReply=true;$('reply-panel').hidden=true;$('reply-reopen').hidden=false;};$('reply-reopen').onclick=()=>{closedReply=false;$('reply-panel').hidden=false;$('reply-reopen').hidden=true;$('reply').focus();};
$('review').onclick=()=>{const last=state.timeline.at(-1);if(last&&last.id!==current?.id){show(state.timeline.findIndex(s=>s.hostId===last.hostId));toast('请先读完最新对话，草稿仍保留。');return;}base=state.latestMessageId;void saveDraft(++draftRevision);updateSend();};
$('status-banner').onclick=safe(async()=>{if(!owned&&state.connected){owned=(await api('/api/game/lease','POST',{clientId:viewer,force:true})).owned;banner();updateSend();}});
$('home').onclick=goHome;$('start').onclick=safe(async()=>{if(state?.deleted)throw Error('此存档已删除，请从原任务重新启动网页模式');if(state?.save)return showSaves();await enter();});
$('settings-open').onclick=()=>{applyPreferences();$('settings').showModal();};$('speed').oninput=()=>{$('speed-value').textContent=+$('speed').value?`${$('speed').value} 字 / 秒`:'直接显示';};
$('menu-settings').onclick=$('stage-settings').onclick=()=>$('settings-open').click();
$('stage-saves').onclick=safe(showSaves);
$('settings-save').onclick=safe(async()=>{state.prefs=await api('/api/game/settings','PUT',{speed:+$('speed').value,imageMode:document.querySelector('input[name=images]:checked').value});setLive2dPreference($('spirit-motion').checked);$('settings').close();toast('已保存。下一轮会使用新的配图设置。');});
async function selectSave(s){
  if(switching)return;
  if(sending)throw Error('这条消息正在提交，等确认后再切换存档。');
  switching=true;
  try{
    while(polling)await new Promise(resolve=>setTimeout(resolve,25));
    clearTimeout(saveTimer);await saveDraft(draftRevision);
    const nextId=s.current?'':s.id;
    // Verify the target before discarding any UI state. Each bridge still owns exactly one task.
    await rootApi(nextId?`/api/sessions/${nextId}/api/game`:'/api/game');
    goHome();selectedSave=nextId;sessionStorage.setItem('galgame-selected-save',selectedSave);
    assetRequest++;draftRevision++;state=null;initialized=false;owned=false;current=null;index=-1;signature='';doc=null;pendingSubmit=null;$('reply').value='';
    switching=false;await poll();if(!state)throw Error('连接中断，请刷新存档列表重试。');
    $('saves').close();await enter();
  }finally{switching=false;}
}
async function showSaves(){
  const catalog=await rootApi('/api/saves'),saves=catalog.saves;$('save-list').replaceChildren();
  const legacy=catalog.scope!=='local-user';
  if(legacy)for(const s of saves){s.available=s.connected;s.hostLabel=s.hostLabel||(s.current?state?.hostLabel:'原 Agent（旧版）');s.adapter=s.adapter||s.hostLabel;}
  const filter=$('save-host'),previous=filter.value;filter.replaceChildren(new Option('全部 Agent',''));
  for(const [id,label] of new Map(saves.map(s=>[s.adapter,s.hostLabel])))filter.add(new Option(label,id));
  if([...filter.options].some(o=>o.value===previous))filter.value=previous;
  function render(){
    $('save-list').replaceChildren();const visible=saves.filter(s=>!filter.value||s.adapter===filter.value);
    if(!visible.length){const p=document.createElement('p');p.textContent='这里还没有存档。在对应 Agent 的原对话里启动一次网页模式并开始游戏，就会自动出现在这里。';$('save-list').append(p);}
    for(const s of visible){
      const active=selectedSave?s.id===selectedSave||s.saveId===state?.save?.id:s.current;
      const card=document.createElement('article');card.className='save-card';card.dataset.active=String(active);
      const title=document.createElement('h3'),meta=document.createElement('p'),actions=document.createElement('div'),load=document.createElement('button');
      title.textContent=s.title;meta.textContent=`${s.hostLabel} · ${s.connected?'已连接':s.available?'可回看 · Agent 未连接':'需从原任务重新连接'}${s.updatedAt?' · '+new Date(s.updatedAt).toLocaleString():''}${active?' · 当前存档':''}`;
      load.textContent=s.connected?'继续对话':s.available?'回看对话':'如何重新连接';load.className='primary';
      load.onclick=safe(async()=>{if(legacy&&s.available&&!s.current){toast('此入口服务仍是旧版，将打开原存档；重启入口服务后可在同一页面切换。');location.assign(s.url);}else if(s.available)await selectSave(s);else reader('重新连接这个存档',`回到 ${s.hostLabel}，打开「${s.title}」原对话，然后发送：\n\n请读取更新后的「不要再做 App 了」Skill，从这条原对话重新启动 GalGame 网页模式，保留已有存档。\n\n启动后回到本页点「刷新存档」。仅安装 Skill 不会导入其他聊天。`);});
      actions.append(load);
      if(active&&state?.save){const del=document.createElement('button');del.textContent='删除网页存档';del.className='quiet';del.onclick=()=>{saveToDelete=state.save.id;$('delete-confirm').showModal();};actions.append(del);}
      card.append(title,meta,actions);$('save-list').append(card);
    }
  }
  filter.onchange=render;render();if(!$('saves').open)$('saves').showModal();
}
$('saves-refresh').onclick=safe(showSaves);
$('original-entry').onclick=safe(()=>selectSave({current:true}));
$('saves-open').onclick=safe(showSaves);$('delete-cancel').onclick=()=>$('delete-confirm').close();$('delete-save').onclick=safe(async()=>{if(saveToDelete!==state.save?.id)throw Error('存档已改变');if(sending||switching)throw Error('请等当前操作完成再删除。');switching=true;try{while(polling)await new Promise(resolve=>setTimeout(resolve,25));clearTimeout(saveTimer);await api('/api/game/save','DELETE');localStorage.removeItem(`draft:${saveToDelete}`);localStorage.removeItem(`pending:${saveToDelete}`);pendingSubmit=null;$('reply').value='';$('delete-confirm').close();$('saves').close();goHome();assetRequest++;draftRevision++;selectedSave='';sessionStorage.removeItem('galgame-selected-save');state=null;initialized=false;owned=false;current=null;signature='';}finally{switching=false;}await poll();toast('网页存档已删除，原 Agent 对话保留。');});
function reader(title,text,markdown=false){$('reader-title').textContent=title;$('reader-body').classList.toggle('markdown',markdown);if(markdown)renderMarkdown($('reader-body'),text);else $('reader-body').textContent=text;if(!$('reader').open)$('reader').showModal();}
$('reader-close').onclick=()=>$('reader').close();$('raw-open').onclick=()=>reader('原任务中的正式回复',current?.raw||'');$('history-open').onclick=()=>{reader('这段对话',state.timeline.map(s=>`${names[s.speaker]}：${s.raw||s.text}`).join('\n\n'));};
$('host-open').onclick=safe(async()=>{await api('/api/open-host','POST');});
async function prepareDocument(){const key=current.id,selection=selectedSave;try{const result=await api(`/api/game/document?turn=${current.turnId}&id=${current.document_id}`);if(current?.id!==key||selection!==selectedSave)return;doc=result;$('document-title').textContent=doc.title;$('delivery-caption').textContent=current.deliveryKind==='draft'?'这是按要求提前整理的草案，尚未完成全部审查。':'已整理成完整文档。阅读、下载，或交回原 Agent 开始开发。';$('delivery').hidden=false;}catch(e){toast(e.message);}}
$('document-open').onclick=()=>{if(doc)reader(doc.title,doc.markdown,true);};$('document-download').onclick=()=>{if(!doc)return;const url=URL.createObjectURL(new Blob([doc.markdown],{type:'text/markdown;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=doc.title.replace(/[<>:"/\\|?*]/g,'_')+'.md';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('develop').onclick=()=>{if(doc)$('develop-confirm').showModal();};$('develop-cancel').onclick=()=>$('develop-confirm').close();$('develop-confirmed').onclick=safe(async()=>{if(!doc)throw Error('文档尚未就绪');const text=`请按这份产品设计方案开始开发：${doc.path}\n文档 SHA-256：${doc.hash}\n沿用已确认的范围，常规实现自行决定；遇到改变核心体验、数据流向或费用的新冲突再与我确认。`;base=state.latestMessageId;$('develop-confirm').close();await sendText(text);await api('/api/open-host','POST');});
await poll();setInterval(poll,1500);
