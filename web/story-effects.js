// Presentation cues only: no model calls, invented decisions, or automatic answers.
const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
let revision=0,animations=[];
export function cancelStoryCue(){cancelSummon();revision++;for(const a of animations)a.cancel();animations=[];const curtain=document.getElementById('story-curtain');curtain.className='';}
export function playStoryCue(cue,reveal,{replay=false}={}){
  cancelStoryCue();const request=revision,curtain=document.getElementById('story-curtain');
  if(replay||reduced()||!['blink','portal','meadow'].includes(cue)){reveal();return;}
  curtain.className=`active ${cue}`;
  let revealed=false;
  const commit=()=>{if(!revealed&&request===revision){revealed=true;reveal();}};
  async function run(){
    try{
      if(cue==='blink'){
        const lids=[...curtain.children];
        // One partial blink, then a slower complete close before changing the scene.
        animations=lids.map((lid,i)=>lid.animate([
          {transform:`translateY(${i?100:-100}%)`},
          {transform:`translateY(${i?28:-28}%)`,offset:.22},
          {transform:`translateY(${i?100:-100}%)`,offset:.4},
          {transform:'translateY(0)',offset:.9},{transform:'translateY(0)'}
        ],{duration:1900,easing:'ease-in-out',fill:'forwards'}));
        await Promise.all(animations.map(a=>a.finished));if(request!==revision)return;commit();
        animations=lids.map((lid,i)=>lid.animate([{transform:'translateY(0)'},{transform:`translateY(${i?100:-100}%)`}],{duration:950,delay:180,easing:'cubic-bezier(.22,1,.36,1)',fill:'forwards'}));
      }else{
        animations=[curtain.animate([{opacity:0},{opacity:1}],{duration:750,easing:'ease-in',fill:'forwards'})];
        await animations[0].finished;if(request!==revision)return;commit();
        animations=[curtain.animate([{opacity:1},{opacity:0}],{duration:1000,easing:'ease-out',fill:'forwards'})];
      }
      await Promise.all(animations.map(a=>a.finished));
    }catch{ /* Navigation/replay cancels the old cue. */ }
    finally{if(request===revision){commit();curtain.className='';for(const a of animations)a.cancel();animations=[];}}
  }
  void run();
}
let entrance;
const circle=new Image();circle.src='/art/spirit-summoning-circle.png';
const circleReady=circle.decode().then(()=>true).catch(()=>false);
function cancelSummon(){entrance?.cancel();entrance=null;}
function rendererReady(body,signal){
  if(!body||body.dataset.renderer!=='loading')return Promise.resolve();
  return new Promise(resolve=>{
    const finish=()=>{clearTimeout(timer);observer.disconnect();signal.removeEventListener('abort',finish);resolve();};
    const observer=new MutationObserver(()=>{if(body.dataset.renderer!=='loading')finish();});
    const timer=setTimeout(finish,2500);
    observer.observe(body,{attributes:true,attributeFilter:['data-renderer']});
    signal.addEventListener('abort',finish,{once:true});
  });
}
export function summonSpirit(target=document.getElementById('menu-companion-float')){
  cancelSummon();if(!target||reduced())return;
  const controller=new AbortController(),running=[],layer=document.createElement('div');
  layer.className='summon-layer';layer.setAttribute('aria-hidden','true');
  const floor=document.createElement('div'),rising=document.createElement('div');
  floor.className='summon-floor';rising.className='summon-rising';
  for(const ring of [floor,rising]){const art=circle.cloneNode();art.alt='';art.draggable=false;ring.append(art);layer.append(ring);}
  target.parentElement.append(layer);target.classList.add('is-summoning');
  const play=(element,frames,options)=>{const a=element.animate(frames,{fill:'both',...options});running.push(a);return a;};
  const hold=play(target,[{opacity:0},{opacity:0}],{duration:1});
  const request={cancel(){controller.abort();for(const a of running)a.cancel();layer.remove();target.classList.remove('is-summoning');}};
  entrance=request;
  const ease=getComputedStyle(document.documentElement).getPropertyValue('--ease-out').trim()||'cubic-bezier(0.23,1,0.32,1)';
  async function run(){
    try{
      const [artReady]=await Promise.all([circleReady,rendererReady(target.querySelector('.companion-body'),controller.signal)]);
      if(controller.signal.aborted)return;
      // Only opacity / translation on the live canvas. No blur, brightness, or scale.
      play(target,[{opacity:0,transform:'translateY(32px)'},{opacity:1,transform:'translateY(0)'}],{duration:1200,delay:artReady?420:0,easing:ease});
      hold.cancel();
      if(artReady){
        play(floor,[{opacity:0},{opacity:.95,offset:.18},{opacity:.85,offset:.6},{opacity:0}],{duration:2800,easing:'linear'});
        play(floor.firstElementChild,[{transform:'rotate(-18deg)'},{transform:'rotate(24deg)'}],{duration:2800,easing:'linear'});
        play(rising,[{opacity:0,transform:'translateY(18px)'},{opacity:.45,transform:'translateY(-30px)',offset:.4},{opacity:0,transform:'translateY(-110px)'}],{duration:1900,delay:300,easing:'linear'});
        play(rising.firstElementChild,[{transform:'rotate(14deg)'},{transform:'rotate(-18deg)'}],{duration:1900,delay:300,easing:'linear'});
      }
      await Promise.all(running.filter(a=>a!==hold).map(a=>a.finished));
    }catch{ /* A scene change cancels the entrance without leaving a hidden character. */ }
    finally{if(entrance===request){request.cancel();entrance=null;}}
  }
  void run();
}
document.addEventListener('visibilitychange',()=>{if(document.hidden)cancelSummon();});
matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',event=>{if(event.matches)cancelSummon();});
