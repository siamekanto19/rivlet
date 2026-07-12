const $=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const statusEl=$<HTMLDivElement>('status'),video=$<HTMLInputElement>('video-enabled'),sites=$<HTMLTextAreaElement>('disabled-sites'),captureDownloads=$<HTMLInputElement>('capture-downloads'),captureTorrents=$<HTMLInputElement>('capture-torrents');
async function refresh(){const saved=await chrome.storage.local.get(['videoEnabled','disabledSites','captureDownloads','captureTorrents']);video.checked=Boolean(saved.videoEnabled);captureDownloads.checked=saved.captureDownloads!==false;captureTorrents.checked=saved.captureTorrents!==false;sites.value=(saved.disabledSites||[]).join('\n');}
async function test(){statusEl.className='status';statusEl.textContent='Checking native host…';try{const r=await chrome.runtime.sendMessage({type:'health'});statusEl.textContent=r?.ok?'Grabify is connected.':r?.error||'Not connected';statusEl.classList.add(r?.ok?'ok':'error');}catch(e){statusEl.textContent=String(e);statusEl.classList.add('error');}}
$<HTMLButtonElement>('test').onclick=test;
$<HTMLButtonElement>('grant').onclick=async()=>{await chrome.permissions.request({permissions:['webRequest']});video.checked=true;await chrome.storage.local.set({videoEnabled:true});};
$<HTMLButtonElement>('revoke').onclick=async()=>{await chrome.permissions.remove({permissions:['webRequest']});video.checked=false;await chrome.storage.local.set({videoEnabled:false});};
$<HTMLButtonElement>('save').onclick=async()=>{await chrome.storage.local.set({videoEnabled:video.checked,captureDownloads:captureDownloads.checked,captureTorrents:captureTorrents.checked,disabledSites:sites.value.split(/\r?\n/).map(x=>x.trim().toLowerCase()).filter(Boolean)});};
void refresh();void test();
