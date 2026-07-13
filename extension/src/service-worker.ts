import { NATIVE_HOST, envelope, type NativeResponse } from './protocol';
import { currentCandidates, isMediaURL, isSiteDisabled, type MediaCandidate } from './media';
import { isTakeoverURL, serializeCookies } from './download-capture';

const MENU_ID='rivlet-download-link';
const candidates=new Map<number,Map<string,MediaCandidate>>();

chrome.runtime.onInstalled.addListener(()=>{
  chrome.contextMenus.removeAll(()=>chrome.contextMenus.create({id:MENU_ID,title:'Download with Rivlet',contexts:['link']}));
  // Auto-capture browser downloads is on by default.
  chrome.storage.local.get(['captureDownloads','captureTorrents','videoEnabled'],v=>{
    const defaults:Record<string,boolean>={};
    if(v.captureDownloads===undefined)defaults.captureDownloads=true;
    if(v.captureTorrents===undefined)defaults.captureTorrents=true;
    if(v.videoEnabled===undefined)defaults.videoEnabled=true;
    if(Object.keys(defaults).length)chrome.storage.local.set(defaults);
  });
});

async function native(action:string,payload:unknown):Promise<NativeResponse>{
  const message=envelope(action,payload);
  for(let attempt=0;attempt<2;attempt++){
    try{return await chrome.runtime.sendNativeMessage(NATIVE_HOST,message) as NativeResponse;}catch(error){if(attempt===1)throw error;}
  }
  throw new Error('Native host unavailable');
}

async function notifyFailure(message:string){
  await chrome.notifications.create({type:'basic',iconUrl:'icons/icon-128.png',title:'Rivlet could not receive the download',message});
}

chrome.contextMenus.onClicked.addListener(async(info,tab)=>{
  if(info.menuItemId!==MENU_ID||!info.linkUrl)return;
  try{
    const response=await native('capture.link',{url:info.linkUrl,pageUrl:info.pageUrl,referrer:info.pageUrl,suggestedFilename:'',userAgent:navigator.userAgent});
    if(!response.ok)throw new Error(response.error||'Rivlet rejected the link');
  }catch(error){await notifyFailure(error instanceof Error?error.message:String(error));}
});

// -- automatic download capture --------------------------------------------
// When the browser starts a download, hand it to Rivlet. The browser transfer
// is cancelled only after Rivlet confirms it created a record.
// Guard the namespace: if the downloads permission isn't active yet, accessing
// it unguarded would throw at load and kill the whole service worker.
chrome.downloads?.onCreated?.addListener((item)=>{void grabDownload(item);});

async function resolvedDownload(id:number,initial:chrome.downloads.DownloadItem){
  // onCreated often fires before redirects, the Content-Disposition filename,
  // and the signed final URL have reached the downloads API. Give Chrome a
  // bounded window to settle while Rivlet keeps its transfer paused.
  let current=initial;
  for(let attempt=0;attempt<4;attempt++){
    if(attempt>0)await new Promise(resolve=>setTimeout(resolve,250));
    const matches=await chrome.downloads.search({id}).catch(()=>[]);
    if(matches[0])current=matches[0];
    if(current.finalUrl&&current.finalUrl!==initial.url&&current.filename)break;
  }
  return current;
}

async function grabDownload(item:chrome.downloads.DownloadItem){
  if(item.byExtensionId===chrome.runtime.id)return;
  const cfg=await chrome.storage.local.get(['captureDownloads']);
  if(cfg.captureDownloads===false)return;
  // Stop Chrome at the earliest downloads API event. Otherwise a small file
  // can finish while the native host is still starting.
  let pausedByRivlet=false;
  try{await chrome.downloads.pause(item.id);pausedByRivlet=true;}catch{/* already complete or not pausable */}
  item=await resolvedDownload(item.id,item);
  const url=item.finalUrl||item.url;
  if(!isTakeoverURL(url)){
    if(pausedByRivlet)await chrome.downloads.resume(item.id).catch(()=>{});
    return; // skip blob:, data:, file:
  }
  try{
    // Automatic browser takeover intentionally captures every HTTP(S) file.
  }catch{/* bad URL — fall through */}
  const browserCookies=await chrome.cookies.getAll({url}).catch(()=>[]);
  const cookieHeader=serializeCookies(browserCookies);
  const suggested=item.filename?(item.filename.split(/[\\/]/).pop()||''):'';
  try{
    const response=await native('capture.download',{url,pageUrl:item.referrer,referrer:item.referrer,suggestedFilename:suggested,userAgent:navigator.userAgent,cookieHeader});
    if(!response.ok)throw new Error(response.error||'Rivlet rejected the download');
    try{await chrome.downloads.cancel(item.id);}catch{/* may already be finished */}
    try{await chrome.downloads.erase({id:item.id});}catch{/* ignore */}
  }catch(error){
    if(pausedByRivlet)await chrome.downloads.resume(item.id).catch(()=>{});
    await notifyFailure(error instanceof Error?error.message:String(error));
  }
}

// webRequest is an OPTIONAL permission — the namespace is undefined until the
// user grants media detection from the options page. Registering it here
// unconditionally would throw and kill the whole service worker, so guard it
// and (re)register whenever the permission is granted.
function registerMediaSniffer(){
  if(!chrome.webRequest?.onBeforeRequest)return;
  if(chrome.webRequest.onBeforeRequest.hasListener(onMediaRequest))return;
  chrome.webRequest.onBeforeRequest.addListener(onMediaRequest,{urls:['<all_urls>'],types:['media','xmlhttprequest','other']});
}
function onMediaRequest(details:chrome.webRequest.WebRequestBodyDetails){
  if(details.tabId<0||!isMediaURL(details.url))return;
  let tab=candidates.get(details.tabId);if(!tab){tab=new Map();candidates.set(details.tabId,tab);}
  tab.set(details.url,{url:details.url,kind:details.url.match(/\.(m3u8|mpd|mp4|webm)/i)?.[1]?.toLowerCase(),seenAt:Date.now()});
}
registerMediaSniffer();
chrome.permissions?.onAdded?.addListener(registerMediaSniffer);

// Reloading/updating the extension can drop dynamically-registered content
// scripts even though the granted permission persists — so the in-page video
// popup silently stops appearing. Re-register it on startup when the user has
// previously granted access.
async function ensureContentScript(){
  try{
    if(!chrome.scripting)return;
    const granted=await chrome.permissions.contains({permissions:['scripting'],origins:['<all_urls>']});
    if(!granted)return;
    const existing=await chrome.scripting.getRegisteredContentScripts({ids:['rivlet-video-detection']}).catch(()=>[]);
    if(existing.length)return;
    await chrome.scripting.registerContentScripts([{id:'rivlet-video-detection',js:['content-script.js'],matches:['<all_urls>'],persistAcrossSessions:true,runAt:'document_idle'}]).catch(()=>{});
  }catch{/* ignore */}
}
void ensureContentScript();
chrome.permissions?.onAdded?.addListener(()=>{void ensureContentScript();});

chrome.tabs.onRemoved.addListener(tabId=>candidates.delete(tabId));

chrome.runtime.onMessage.addListener((message,sender,sendResponse)=>{
  void(async()=>{
    if(message?.type==='video.playing'){
      const settings=await chrome.storage.local.get(['videoEnabled','disabledSites']);
      if(settings.videoEnabled===false){sendResponse({show:false});return;}
      const disabled:string[]=settings.disabledSites||[];
      const host=new URL(message.pageUrl).hostname;
      if(isSiteDisabled(host,disabled)){sendResponse({show:false});return;}
      const list=currentCandidates(candidates.get(sender.tab?.id??-1)?.values()||[]);
      sendResponse({show:true,candidates:list});return;
    }
    if(message?.type==='capture.video'){
      const response=await native('capture.video',message.payload);if(!response.ok)throw new Error(response.error||'Video capture failed');sendResponse(response);return;
    }
    if(message?.type==='capture.torrent'){
      const cfg=await chrome.storage.local.get(['captureTorrents']);
      if(cfg.captureTorrents===false){sendResponse({ok:false,error:'Torrent capture is disabled'});return;}
      const response=await native('capture.torrent',{url:message.url,pageUrl:message.pageUrl,referrer:message.pageUrl,suggestedFilename:'',userAgent:navigator.userAgent});
      if(!response.ok)throw new Error(response.error||'Rivlet rejected the torrent');
      sendResponse(response);return;
    }
    if(message?.type==='site.disable'){
      const current:string[]=(await chrome.storage.local.get('disabledSites')).disabledSites||[];
      const next=[...new Set([...current,message.host])];await chrome.storage.local.set({disabledSites:next});sendResponse({ok:true});return;
    }
    if(message?.type==='health'){const response=await native('health',{});const cfg=response.data as Record<string,unknown>|undefined;if(response.ok&&cfg){await chrome.storage.local.set({videoEnabled:cfg.videoEnabled,disabledSites:cfg.disabledVideoSites||[],desktopCaptureFileTypes:cfg.captureFileTypes||[],desktopExcludedSites:cfg.excludedSites||[]});}sendResponse(response);return;}
  })().catch(async error=>{await notifyFailure(error instanceof Error?error.message:String(error));sendResponse({ok:false,error:String(error)});});
  return true;
});
