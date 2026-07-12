type VideoInfo={pageUrl:string;title:string;posterUrl:string;duration:number;drmDetected:boolean;userAgent:string;candidates:Array<{url:string;kind?:string}>};
const drm=new WeakSet<HTMLMediaElement>();const prompted=new Set<string>();let cleanup:(()=>void)|null=null;

function usableSource(video:HTMLVideoElement){const raw=video.currentSrc||video.src;return raw&&!raw.startsWith('blob:')&&!raw.startsWith('data:')?raw:'';}
function key(video:HTMLVideoElement){return `${location.href}|${usableSource(video)||video.poster||video.duration}`;}

async function onPlaying(event:Event){
  const video=event.currentTarget as HTMLVideoElement;if(drm.has(video)||prompted.has(key(video)))return;
  const result=await chrome.runtime.sendMessage({type:'video.playing',pageUrl:location.href});if(!result?.show)return;
  prompted.add(key(video));showPrompt(video,result.candidates||[]);
}
function observe(video:HTMLVideoElement){
  if(video.dataset.grabbyObserved)return;
  video.dataset.grabbyObserved='1';
  video.addEventListener('encrypted',()=>{drm.add(video);cleanup?.();},{once:true});
  video.addEventListener('playing',onPlaying);
  // YouTube can begin autoplay before a document_idle content script attaches.
  // In that case the `playing` event has already passed, so inspect the current
  // state once instead of waiting for the user to pause and resume.
  if(!video.paused&&video.readyState>=2)queueMicrotask(()=>void onPlaying({currentTarget:video} as unknown as Event));
}
function scan(root:ParentNode=document){root.querySelectorAll('video').forEach(v=>observe(v as HTMLVideoElement));}

function showPrompt(video:HTMLVideoElement,candidates:Array<{url:string;kind?:string}>){
  cleanup?.();const host=document.createElement('div');host.style.all='initial';document.documentElement.append(host);const shadow=host.attachShadow({mode:'closed'});
  shadow.innerHTML=`<style>:host{all:initial}.bar{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483647;display:flex;align-items:center;gap:12px;min-width:390px;max-width:calc(100vw - 32px);padding:12px 14px;border:1px solid rgba(255,255,255,.18);border-radius:12px;background:#111;color:#fff;box-shadow:0 14px 40px rgba(0,0,0,.42);font:13px "Segoe UI",sans-serif}.text{flex:1;min-width:0}.title{font-weight:650}.sub{margin-top:2px;color:#aaa;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}button{border:0;border-radius:7px;padding:7px 11px;font:600 12px "Segoe UI",sans-serif;cursor:pointer}.download{background:#0f6cbd;color:#fff}.dismiss,.never{background:#292929;color:#eee}.never{padding:7px 8px}</style><div class="bar" role="dialog" aria-label="Grabify video download"><div class="text"><div class="title">Download this video with Grabify?</div><div class="sub"></div></div><button class="never" title="Never show on this site">Never here</button><button class="dismiss">Dismiss</button><button class="download">Download</button></div>`;
  const bar=shadow.querySelector('.bar')!;const sub=bar.querySelector('.sub')!;sub.textContent=document.title;
  cleanup=()=>{host.remove();cleanup=null};
  bar.querySelector('.dismiss')!.addEventListener('click',()=>cleanup?.());
  bar.querySelector('.never')!.addEventListener('click',async()=>{await chrome.runtime.sendMessage({type:'site.disable',host:location.hostname});cleanup?.();});
  bar.querySelector('.download')!.addEventListener('click',async()=>{
    const direct=usableSource(video);const all=direct?[{url:direct,kind:'direct'},...candidates]:candidates;
    const payload:VideoInfo={pageUrl:location.href,title:document.title,posterUrl:video.poster||'',duration:Number.isFinite(video.duration)?video.duration:0,drmDetected:drm.has(video),userAgent:navigator.userAgent,candidates:all};
    await chrome.runtime.sendMessage({type:'capture.video',payload});cleanup?.();
  });
}

scan();new MutationObserver(records=>records.forEach(r=>r.addedNodes.forEach(n=>{if(n instanceof HTMLVideoElement)observe(n);else if(n instanceof Element)scan(n);}))).observe(document.documentElement,{subtree:true,childList:true});

// -- magnet / torrent capture ------------------------------------------------
// Intercept clicks on magnet links and hand them to Grabify instead of the
// browser's default "open with a torrent app?" prompt. Capture phase so we win
// before site handlers. Guarded so double-injection can't bind two listeners.
type MagnetFlag={__grabbyMagnet?:boolean};
if(!(window as MagnetFlag).__grabbyMagnet){
  (window as MagnetFlag).__grabbyMagnet=true;
  let captureTorrents=true;
  chrome.storage?.local?.get?.(['captureTorrents'],v=>{captureTorrents=v.captureTorrents!==false;});
  chrome.storage?.onChanged?.addListener((changes,area)=>{if(area==='local'&&changes.captureTorrents)captureTorrents=changes.captureTorrents.newValue!==false;});
  document.addEventListener('click',(event)=>{
    if(!captureTorrents||event.defaultPrevented||event.button!==0)return;
    const anchor=(event.target as Element|null)?.closest?.('a[href^="magnet:"]') as HTMLAnchorElement|null;
    if(!anchor)return;
    const href=anchor.href||anchor.getAttribute('href')||'';
    if(!/^magnet:\?/i.test(href))return;
    event.preventDefault();event.stopPropagation();
    void chrome.runtime.sendMessage({type:'capture.torrent',url:href,pageUrl:location.href});
  },true);
}
