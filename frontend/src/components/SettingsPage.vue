<script lang="ts" setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useDownloadsStore } from '../stores/downloads';
import { useUiStore } from '../stores/ui';
import type { Category, Settings } from '../types';
import { parseSpeedToBps } from '../utils/format';
import Icon from './Icon.vue';
import WindowControls from './WindowControls.vue';
import { pickFolder } from '../services/folderPicker';
import { integration } from '../services/integration';
import { videoTools, type VideoToolsHealth } from '../services/videoTools';

const store = useDownloadsStore();
const ui = useUiStore();

type Tab = 'general' | 'appearance' | 'personalization' | 'downloads' | 'connection' | 'browser' | 'filetypes' | 'categories' | 'notifications' | 'advanced';
const tabs: { id: Tab; label: string; icon: string }[] = [
  { id: 'general', label: 'General', icon: 'settings' },
  { id: 'appearance', label: 'Appearance', icon: 'appearance' },
  { id: 'personalization', label: 'Personalization', icon: 'personalization' },
  { id: 'downloads', label: 'Downloads', icon: 'http' },
  { id: 'connection', label: 'Connection', icon: 'link' },
  { id: 'browser', label: 'Browser Integration', icon: 'monitor' },
  { id: 'filetypes', label: 'File Types', icon: 'file' },
  { id: 'categories', label: 'Categories', icon: 'folder' },
  { id: 'notifications', label: 'Notifications', icon: 'notification' },
  { id: 'advanced', label: 'Advanced', icon: 'settings' },
];
const active = ref<Tab>('general');

const themeOptions: { id: 'light' | 'dark' | 'system'; label: string; icon: string }[] = [
  { id: 'light', label: 'Light', icon: 'sun' },
  { id: 'dark', label: 'Dark', icon: 'moon' },
  { id: 'system', label: 'System', icon: 'monitor' },
];
const densityOptions: { id: 'compact' | 'comfortable' | 'spacious'; label: string }[] = [
  { id: 'compact', label: 'Compact' },
  { id: 'comfortable', label: 'Comfortable' },
  { id: 'spacious', label: 'Spacious' },
];
const textSizeOptions: { id: 'small' | 'default' | 'large'; label: string }[] = [
  { id: 'small', label: 'Small' },
  { id: 'default', label: 'Default' },
  { id: 'large', label: 'Large' },
];

// working copy of persisted settings (theme is applied live, separately)
const src = store.settings as Settings;
const original=JSON.parse(JSON.stringify(src)) as Settings;
const draft = reactive<Settings>(JSON.parse(JSON.stringify(src)));
const confirmRestore=ref(false);
const pageKeys:Record<Tab,(keyof Settings)[]>={general:['downloadDir','clipboardMonitoring'],appearance:[],personalization:[],downloads:['maxConcurrent','globalSpeedLimitBps','shutdownOnComplete','overwritePolicy','autoResumeOnStartup','removeCompleted'],connection:['segmentCount','retryCount','retryDelaySeconds','requestTimeoutSeconds','userAgent','useSystemProxy','proxyUrl','hostRules'],browser:['showBrowserOnboardingOnStartup','videoDetectionEnabled','disabledVideoSites','preferredVideoQuality','preferredVideoContainer','concurrentFragments','cookieConsent','cookieBrowser','cookieProfile'],filetypes:['captureFileTypes','excludedSites'],categories:['categories'],notifications:['notifyOnComplete','showCompletionDialog'],advanced:['temporaryDir','queues']};
function syncDerivedFields(){captureTypesText.value=(draft.captureFileTypes??[]).join(', ');excludedSitesText.value=(draft.excludedSites??[]).join('\n');disabledVideoSitesText.value=(draft.disabledVideoSites??[]).join('\n');limitOn.value=draft.globalSpeedLimitBps!=null;limitKb.value=draft.globalSpeedLimitBps?Math.round(draft.globalSpeedLimitBps/1024):500}
function resetPage(){for(const key of pageKeys[active.value]){(draft as unknown as Record<string,unknown>)[key]=JSON.parse(JSON.stringify((original as unknown as Record<string,unknown>)[key]))};syncDerivedFields()}
async function restoreDefaults(){const defaults=await store.resetSettings();Object.assign(draft,JSON.parse(JSON.stringify(defaults)));syncDerivedFields();confirmRestore.value=false}
const captureTypesText = ref((draft.captureFileTypes ?? []).join(', '));
const excludedSitesText = ref((draft.excludedSites ?? []).join('\n'));
const disabledVideoSitesText = ref((draft.disabledVideoSites ?? []).join('\n'));
const diagnosticStatus=ref('');
const toolHealth=ref<VideoToolsHealth|null>(null);const toolBusy=ref(false);const toolMessage=ref('');async function refreshTools(){toolHealth.value=await videoTools.health()}async function installTools(){toolBusy.value=true;toolMessage.value='Installing video tools…';try{await videoTools.install();toolMessage.value='Video tools installed';await refreshTools()}catch(e){toolMessage.value=String(e)}finally{toolBusy.value=false}}async function updateTools(){toolBusy.value=true;toolMessage.value='Checking signed update…';try{await videoTools.update();toolMessage.value='yt-dlp updated and self-tested';await refreshTools()}catch(e){toolMessage.value=String(e)}finally{toolBusy.value=false}}async function rollbackTools(){toolBusy.value=true;try{await videoTools.rollback();toolMessage.value='Restored previous yt-dlp version';await refreshTools()}catch(e){toolMessage.value=String(e)}finally{toolBusy.value=false}}
onMounted(refreshTools);
async function exportDiagnostics(){const path=await integration.exportDiagnostics();diagnosticStatus.value=path?`Saved to ${path}`:''}

const limitOn = ref(draft.globalSpeedLimitBps != null);
const limitKb = ref(
  draft.globalSpeedLimitBps != null ? Math.round(draft.globalSpeedLimitBps / 1024) : 500,
);

const newCatName = ref('');
const newQueueName = ref('');
function addQueue(){const name=newQueueName.value.trim();if(!name)return;draft.queues.push({id:'queue-'+Date.now(),name,priority:0,maxConcurrent:2,running:true,speedLimitBps:null,schedule:{enabled:false,startHHmm:'01:00',stopHHmm:'08:00',weekdays:[0,1,2,3,4,5,6],repeat:true},completionAction:''});newQueueName.value=''}
function removeQueue(id:string){if(id!=='default')draft.queues=draft.queues.filter((q)=>q.id!==id)}
function addCategory() {
  const name = newCatName.value.trim();
  if (!name) return;
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const cat: Category = {
    id: id || 'category-' + (draft.categories.length + 1),
    name,
    folder: draft.downloadDir + '\\' + name,
    extensions: [],
  };
  draft.categories.push(cat);
  newCatName.value = '';
}
function removeCategory(id: string) {
  const i = draft.categories.findIndex((c) => c.id === id);
  if (i >= 0) draft.categories.splice(i, 1);
}
function extText(c: Category): string {
  return c.extensions.join(', ');
}
function setExt(c: Category, value: string) {
  c.extensions = value
    .split(',')
    .map((s) => s.trim().replace(/^\./, '').toLowerCase())
    .filter(Boolean);
}

async function save() {
  draft.globalSpeedLimitBps = limitOn.value ? parseSpeedToBps(String(limitKb.value), 'KB') : null;
  if (!draft.schedule) draft.schedule = { enabled: false, startHHmm: '01:00', stopHHmm: '08:00' };
  draft.captureFileTypes = captureTypesText.value.split(/[\s,]+/).map((x) => x.replace(/^\./, '').toLowerCase()).filter(Boolean);
  draft.excludedSites = excludedSitesText.value.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  draft.disabledVideoSites = disabledVideoSitesText.value.split(/\r?\n/).map((x) => x.trim().toLowerCase()).filter(Boolean);
  await store.updateSettings(JSON.parse(JSON.stringify(draft)));
  ui.closeSettings();
}

async function chooseDefaultFolder() {
  draft.downloadDir = await pickFolder(draft.downloadDir);
}
async function chooseCategoryFolder(category: Category) {
  category.folder = await pickFolder(category.folder || draft.downloadDir);
}
</script>

<template>
  <div class="settings-page">
    <!-- page header -->
    <div class="sp-head">
      <button class="back" @click="ui.closeSettings()" title="Back to downloads" aria-label="Back to downloads">
        <Icon name="back" :size="18" />
      </button>
      <h1>Settings</h1>
      <div class="sp-head-spacer" />
      <WindowControls />
    </div>

    <div class="sp-body">
      <!-- nav rail -->
      <nav class="tabs">
        <button
          v-for="t in tabs"
          :key="t.id"
          class="tab"
          :class="{ active: active === t.id }"
          @click="active = t.id"
        >
          <span class="pill" />
          <Icon :name="t.icon" :size="16" />
          <span>{{ t.label }}</span>
        </button>
      </nav>

      <!-- content card: white surface, mirrors the downloads table card -->
      <div class="content-card">
        <div class="panel">
        <!-- GENERAL -->
        <section v-show="active === 'general'" class="pane">
          <div class="frow">
            <label>Default download folder</label>
            <div class="folder-control">
              <input :value="draft.downloadDir" type="text" readonly />
              <button class="browse" type="button" @click="chooseDefaultFolder">
                <Icon name="folder" :size="15" /> Browse
              </button>
            </div>
          </div>
          <div class="frow">
            <label class="chk">
              <input type="checkbox" v-model="draft.clipboardMonitoring" />
              Monitor clipboard for links
            </label>
            <span class="hint">Offer to capture URLs copied to the clipboard.</span>
          </div>
        </section>

        <!-- APPEARANCE -->
        <section v-show="active === 'appearance'" class="pane">
          <div class="frow">
            <label>Theme</label>
            <span class="hint">Choose how Rivlet looks. “System” follows your Windows theme.</span>
            <div class="seg" role="radiogroup" aria-label="Theme">
              <button
                v-for="o in themeOptions"
                :key="o.id"
                class="seg-btn"
                :class="{ on: ui.themePref === o.id }"
                role="radio"
                :aria-checked="ui.themePref === o.id"
                @click="ui.setTheme(o.id)"
              >
                <Icon :name="o.icon" :size="16" />
                <span>{{ o.label }}</span>
              </button>
            </div>
          </div>
        </section>

        <!-- PERSONALIZATION -->
        <section v-show="active === 'personalization'" class="pane">
          <div class="section-intro"><h2>Personalization</h2><p>Tune how Rivlet looks and feels. These preferences apply instantly and are remembered on this PC.</p></div>

          <!-- table style -->
          <div class="frow">
            <label>Table style</label>
            <span class="hint">Striped adds alternating row shading and grid lines between cells.</span>
            <div class="seg" role="radiogroup" aria-label="Table style">
              <button
                class="seg-btn"
                :class="{ on: ui.tableStyle === 'normal' }"
                role="radio"
                :aria-checked="ui.tableStyle === 'normal'"
                @click="ui.setTableStyle('normal')"
              >
                <Icon name="http" :size="16" />
                <span>Normal</span>
              </button>
              <button
                class="seg-btn"
                :class="{ on: ui.tableStyle === 'striped' }"
                role="radio"
                :aria-checked="ui.tableStyle === 'striped'"
                @click="ui.setTableStyle('striped')"
              >
                <Icon name="personalization" :size="16" />
                <span>Striped</span>
              </button>
            </div>
          </div>

          <!-- row density -->
          <div class="frow">
            <label>Row density</label>
            <span class="hint">How tightly downloads are packed in the list — Compact fits more on screen.</span>
            <div class="seg" role="radiogroup" aria-label="Row density">
              <button
                v-for="o in densityOptions"
                :key="o.id"
                class="seg-btn"
                :class="{ on: ui.density === o.id }"
                role="radio"
                :aria-checked="ui.density === o.id"
                @click="ui.setDensity(o.id)"
              >
                <span>{{ o.label }}</span>
              </button>
            </div>
          </div>

          <!-- text size -->
          <div class="frow">
            <label>Text size</label>
            <span class="hint">Adjust the app's text size for easier reading.</span>
            <div class="seg" role="radiogroup" aria-label="Text size">
              <button
                v-for="o in textSizeOptions"
                :key="o.id"
                class="seg-btn"
                :class="{ on: ui.textSize === o.id }"
                role="radio"
                :aria-checked="ui.textSize === o.id"
                @click="ui.setTextSize(o.id)"
              >
                <span>{{ o.label }}</span>
              </button>
            </div>
          </div>

          <!-- toggles -->
          <div class="frow">
            <label class="chk">
              <input type="checkbox" :checked="ui.colorfulIcons" @change="ui.setColorfulIcons(($event.target as HTMLInputElement).checked)" />
              Colorful file-type icons
            </label>
            <span class="hint">Tint icons by file type. Turn off for a calm, monochrome list.</span>
          </div>
          <div class="frow">
            <label class="chk">
              <input type="checkbox" :checked="ui.followSystemAccent" @change="ui.setFollowSystemAccent(($event.target as HTMLInputElement).checked)" />
              Follow Windows accent color
            </label>
            <span class="hint">Match your Windows accent. Turn off to use Rivlet's built-in accent.</span>
          </div>
          <div class="frow">
            <label class="chk">
              <input type="checkbox" :checked="ui.reduceMotion" @change="ui.setReduceMotion(($event.target as HTMLInputElement).checked)" />
              Reduce animations
            </label>
            <span class="hint">Minimize motion and transitions throughout the app.</span>
          </div>
        </section>

        <!-- DOWNLOADS -->
        <section v-show="active === 'downloads'" class="pane">
          <div class="frow inline">
            <label>Maximum concurrent downloads</label>
            <input class="narrow" type="number" min="1" max="16" v-model.number="draft.maxConcurrent" />
          </div>
          <div class="frow">
            <label class="chk">
              <input type="checkbox" v-model="limitOn" />
              Limit global download speed
            </label>
            <div class="inline-sub">
              <input class="narrow" type="number" min="1" v-model.number="limitKb" :disabled="!limitOn" />
              <span class="hint">KB/s</span>
            </div>
          </div>
          <div class="frow">
            <label class="chk">
              <input type="checkbox" v-model="draft.shutdownOnComplete" />
              Shut down computer when all downloads complete
            </label>
          </div>
          <div class="frow inline">
            <label>When a file already exists</label>
            <select v-model="draft.overwritePolicy" class="wide-control">
              <option value="rename">Create a unique name</option>
              <option value="overwrite">Overwrite it</option>
              <option value="skip">Skip the download</option>
            </select>
          </div>
          <label class="chk"><input type="checkbox" v-model="draft.autoResumeOnStartup" /> Resume interrupted downloads when Rivlet starts</label>
          <label class="chk"><input type="checkbox" v-model="draft.removeCompleted" /> Remove completed items from the list automatically</label>
        </section>

        <!-- CONNECTION -->
        <section v-show="active === 'connection'" class="pane">
          <div class="section-intro"><h2>Connection tuning</h2><p>Control parallel connections, failure recovery, and HTTP identity.</p></div>
          <div class="frow inline"><label>Connections per download</label><input class="narrow" type="number" min="1" max="32" v-model.number="draft.segmentCount" /></div>
          <span class="hint">Rivlet adapts this maximum to file size, so small files do not waste connections.</span>
          <div class="frow inline"><label>Retry failed downloads</label><div class="unit-control"><input class="narrow" type="number" min="0" max="20" v-model.number="draft.retryCount" /><span>times</span></div></div>
          <div class="frow inline"><label>Delay between retries</label><div class="unit-control"><input class="narrow" type="number" min="1" max="3600" v-model.number="draft.retryDelaySeconds" /><span>seconds</span></div></div>
          <div class="frow inline"><label>Connection timeout</label><div class="unit-control"><input class="narrow" type="number" min="5" max="300" v-model.number="draft.requestTimeoutSeconds" /><span>seconds</span></div></div>
          <div class="frow"><label>User agent for manually added downloads</label><input v-model="draft.userAgent" type="text" spellcheck="false" /></div>
          <div class="section-intro"><h2>Proxy</h2><p>Use the Windows/system proxy or specify an HTTP, HTTPS, or SOCKS proxy URL.</p></div>
          <label class="chk"><input type="checkbox" v-model="draft.useSystemProxy" :disabled="!!draft.proxyUrl"/> Use system proxy settings</label>
          <div class="frow"><label>Custom proxy URL</label><input v-model="draft.proxyUrl" type="url" placeholder="http://proxy.example:8080" spellcheck="false"/><span class="hint">Credentials are never stored here. URLs containing a username or password are rejected.</span></div>
        </section>

        <!-- FILE TYPES -->
        <section v-show="active === 'filetypes'" class="pane">
          <div class="section-intro"><h2>Browser capture rules</h2><p>Choose which downloads the browser integration should offer to Rivlet.</p></div>
          <div class="frow">
            <button class="btn primary connect-btn" @click="ui.openBrowserConnect()">
              <Icon name="link" :size="15" /> Set up browser integration…
            </button>
            <span class="hint">Load Rivlet's extension into Chrome or Edge, with step-by-step help.</span>
          </div>
          <div class="frow"><label>Captured file extensions</label><textarea v-model="captureTypesText" rows="3" placeholder="zip, exe, pdf, mp4" /><span class="hint">Separate extensions with commas or spaces.</span></div>
          <div class="frow"><label>Excluded sites</label><textarea v-model="excludedSitesText" rows="5" placeholder="*.example.com&#10;downloads.example.org" /><span class="hint">One hostname pattern per line.</span></div>
        </section>

        <!-- BROWSER INTEGRATION -->
        <section v-show="active === 'browser'" class="pane">
          <label class="chk"><input type="checkbox" v-model="draft.showBrowserOnboardingOnStartup" /> Show browser setup whenever Rivlet starts</label>
          <div class="section-intro"><h2>Rivlet browser integration</h2><p>Connect the bundled Chrome or Edge extension to this desktop app.</p></div>
          <div class="integration-status"><span class="status-dot" /> Native capture listener is active</div>
          <div class="tool-health"><div class="tool-health-head"><div><h3>Video tools health</h3><p>{{toolHealth?.diagnosticMessage||'Checking installed tools…'}}</p></div><button class="btn" :disabled="toolBusy" @click="refreshTools">Run diagnostic</button></div><div class="tool-grid"><div v-for="tool in [toolHealth?.ytDlp,toolHealth?.ffmpeg]" :key="tool?.name" class="tool-row"><span class="status-dot" :class="{off:!tool?.installed}"/><div><b>{{tool?.name||'Tool'}}</b><small>{{tool?.installed?(tool.version||'Installed'):'Not installed'}}</small><small v-if="tool?.lastUpdated">Updated {{new Date(tool.lastUpdated).toLocaleDateString()}}</small></div></div></div><div class="tool-actions"><button class="btn primary" :disabled="toolBusy" @click="installTools">Install missing tools</button><button class="btn" :disabled="toolBusy||!toolHealth?.updaterConfigured" :title="toolHealth?.updaterConfigured?'':'Signed updater is not configured in this build'" @click="updateTools">Check for signed update</button><button class="btn" :disabled="toolBusy||!toolHealth?.ytDlp.rollbackAvailable" @click="rollbackTools">Rollback yt-dlp</button></div><span v-if="toolMessage" class="hint">{{toolMessage}}</span></div>
          <ol class="install-steps"><li>Open <b>chrome://extensions</b> or <b>edge://extensions</b>.</li><li>Enable Developer mode and choose <b>Load unpacked</b>.</li><li>Select Rivlet's installed <b>integration\extension</b> folder.</li><li>Open extension options and run Test connection.</li></ol>
          <label class="chk"><input type="checkbox" v-model="draft.videoDetectionEnabled" /> Enable playback-based video detection after granting all-site access in the extension</label>
          <div class="frow"><label>Never prompt on these sites</label><textarea v-model="disabledVideoSitesText" rows="4" placeholder="example.com" /><span class="hint">Keep this list aligned with the extension's Disabled sites list.</span></div>
          <div class="section-intro"><h2>Video preferences</h2><p>Choose the default quality, container, and browser profile options for captured video.</p></div>
          <div class="frow inline"><label>Preferred video quality</label><select v-model="draft.preferredVideoQuality" class="wide-control"><option value="best">Best available</option><option value="2160">2160p</option><option value="1440">1440p</option><option value="1080">1080p</option><option value="720">720p</option><option value="480">480p</option></select></div>
          <div class="frow inline"><label>Preferred container</label><select v-model="draft.preferredVideoContainer" class="wide-control"><option value="mp4">MP4</option><option value="mkv">MKV</option><option value="webm">WebM</option></select></div>
          <div class="frow inline"><label>Concurrent video fragments</label><input class="narrow" type="number" min="1" max="16" v-model.number="draft.concurrentFragments" /></div>
          <div class="cookie-box"><label class="chk"><input type="checkbox" v-model="draft.cookieConsent" /> Allow yt-dlp to read a selected browser profile only when sign-in is required</label><div class="cookie-row"><select v-model="draft.cookieBrowser" :disabled="!draft.cookieConsent"><option value="">Choose browser</option><option value="chrome">Chrome</option><option value="edge">Edge</option></select><input v-model="draft.cookieProfile" :disabled="!draft.cookieConsent" placeholder="Profile path or name (for example Default)" /></div><span class="hint">Rivlet stores only this browser/profile choice, never cookie values. Disable this option to revoke consent.</span></div>
        </section>

        <!-- CATEGORIES -->
        <section v-show="active === 'categories'" class="pane">
          <div class="cat-add">
            <input v-model="newCatName" type="text" placeholder="New category name" @keyup.enter="addCategory" />
            <button class="btn" @click="addCategory">Add</button>
          </div>
          <div class="cat-list">
            <div v-for="c in draft.categories" :key="c.id" class="cat">
              <div class="cat-head">
                <Icon name="folder" :size="14" />
                <input class="cat-name" v-model="c.name" type="text" />
                <button class="rm" @click="removeCategory(c.id)" title="Remove category">
                  <Icon name="close" :size="14" />
                </button>
              </div>
              <div class="cat-fields">
                <label>Folder</label>
                <div class="folder-control compact">
                  <input :value="c.folder" type="text" readonly />
                  <button class="browse icon-only" type="button" @click="chooseCategoryFolder(c)" title="Choose folder">
                    <Icon name="folder" :size="15" />
                  </button>
                </div>
                <label>Extensions</label>
                <input
                  :value="extText(c)"
                  type="text"
                  placeholder="zip, rar, 7z"
                  spellcheck="false"
                  @input="setExt(c, ($event.target as HTMLInputElement).value)"
                />
              </div>
            </div>
          </div>
        </section>

        <!-- SCHEDULE -->
        <!-- NOTIFICATIONS -->
        <section v-show="active === 'notifications'" class="pane">
          <div class="frow">
            <label class="chk">
              <input type="checkbox" v-model="draft.notifyOnComplete" />
              Show a notification when a download completes
            </label>
          </div>
          <label class="chk"><input type="checkbox" v-model="draft.showCompletionDialog" /> Show a completion dialog with Open and Open folder actions</label>
        </section>

        <!-- ADVANCED -->
        <section v-show="active === 'advanced'" class="pane">
          <div class="section-intro"><h2>Download queues</h2><p>Prioritize groups and give each its own concurrency, bandwidth, schedule, and completion action.</p></div>
          <div class="cat-add"><input v-model="newQueueName" placeholder="New queue name" @keyup.enter="addQueue" /><button class="btn" @click="addQueue">Add queue</button></div>
          <div class="cat-list">
            <div v-for="q in draft.queues" :key="q.id" class="cat queue-card">
              <div class="cat-head"><Icon name="scheduler" :size="14"/><input class="cat-name" v-model="q.name"/><button v-if="q.id!=='default'" class="rm" @click="removeQueue(q.id)" aria-label="Remove queue"><Icon name="close" :size="14"/></button></div>
              <label class="chk"><input type="checkbox" v-model="q.running"/> Queue is running</label>
              <div class="queue-grid"><label>Priority<input type="number" min="-10" max="10" v-model.number="q.priority"/></label><label>Concurrent<input type="number" min="1" max="16" v-model.number="q.maxConcurrent"/></label><label>Speed KB/s<input type="number" min="0" :value="q.speedLimitBps ? Math.round(q.speedLimitBps/1024) : 0" @input="q.speedLimitBps=Number(($event.target as HTMLInputElement).value)*1024||null"/></label><label>After completion<select v-model="q.completionAction"><option value="">Do nothing</option><option value="shutdown">Shut down</option><option value="sleep">Sleep</option><option value="hibernate">Hibernate</option></select></label></div>
              <label class="chk"><input type="checkbox" v-model="q.schedule!.enabled"/> Use queue schedule</label>
              <div v-if="q.schedule?.enabled" class="queue-grid"><label>Start<input type="time" v-model="q.schedule.startHHmm"/></label><label>Stop<input type="time" v-model="q.schedule.stopHHmm"/></label></div>
            </div>
          </div>
          <div class="section-intro"><h2>Storage and safety</h2><p>Advanced options for incomplete downloads and automated actions.</p></div>
          <div class="frow"><label>Temporary files folder</label><div class="folder-control"><input :value="draft.temporaryDir" type="text" readonly /><button class="browse" type="button" @click="async () => draft.temporaryDir = await pickFolder(draft.temporaryDir)"><Icon name="folder" :size="15" /> Browse</button></div></div>
          <div class="notice">Site passwords, arbitrary completion programs, forced process termination, and dial-up controls are intentionally not stored or executed until a secure credential and permission model is available.</div>
          <div class="section-intro"><h2>Diagnostics</h2><p>Export a redacted support bundle containing health, retry history, and connection timing. URLs, tokens, cookies, and credentials are excluded.</p></div>
          <div class="frow"><button class="btn connect-btn" @click="exportDiagnostics"><Icon name="file" :size="15"/> Export diagnostics…</button><span v-if="diagnosticStatus" class="hint">{{ diagnosticStatus }}</span></div>
        </section>

        </div>

        <!-- footer -->
        <div class="sp-foot">
          <button class="btn reset-page" @click="resetPage">Reset this page</button>
          <button class="btn danger-outline" @click="confirmRestore=true">Restore all defaults…</button>
          <span class="foot-spacer"/>
          <button class="btn" @click="ui.closeSettings()">Discard</button>
          <button class="btn primary" @click="save">Save changes</button>
        </div>
      </div>
    </div>
  </div>
  <div v-if="confirmRestore" class="confirm-backdrop" @mousedown.self="confirmRestore=false"><div class="confirm-card" role="alertdialog" aria-modal="true" aria-labelledby="restore-title"><Icon name="info" :size="22"/><div><h2 id="restore-title">Restore all settings?</h2><p>This resets folders, connection preferences, queues, categories, browser rules, and appearance preferences to their defaults. Downloads are not removed.</p><div><button class="btn" @click="confirmRestore=false">Cancel</button><button class="btn danger" @click="restoreDefaults">Restore defaults</button></div></div></div></div>
</template>

<style scoped>
/* Mirrors the downloads page: chrome header + mica nav rail + white card. */
.settings-page {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: transparent;
  animation: page-in var(--dur-slow) var(--ease-decel);
}
@keyframes page-in {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
/* Doubles as the window title bar: flush-right for the caption buttons, and
   the empty areas act as the window drag region. */
.sp-head {
  display: flex;
  align-items: center;
  gap: 10px;
  height: var(--topbar-h);
  padding: 0 0 0 16px;
  flex: none;
  --wails-draggable: drag;
}
.back {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: var(--radius);
  background: transparent;
  color: var(--text-muted);
  --wails-draggable: no-drag;
  transition: background-color var(--dur-fast) var(--ease-standard),
    color var(--dur-fast) var(--ease-standard);
}
.back:hover {
  background: var(--bg-hover-strong);
  color: var(--text);
}
.sp-head h1 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 600;
  letter-spacing: -0.01em;
}
.sp-head-spacer {
  flex: 1; /* pushes the window controls to the right edge */
}
.settings-search{--wails-draggable:no-drag;margin-left:auto;width:260px;height:32px;display:flex;align-items:center;gap:7px;padding:0 9px;border:1px solid var(--border-control);border-bottom-color:var(--border-control-bottom);border-radius:var(--radius-sm);background:var(--bg-control);color:var(--text-faint)}.settings-search:focus-within{border-bottom-color:var(--accent);box-shadow:inset 0 -1px var(--accent)}.settings-search input{flex:1;min-width:0;height:28px;border:0;background:transparent;box-shadow:none}.settings-results{flex:1;padding:22px 26px;overflow:auto}.settings-results>button{display:flex;align-items:center;gap:12px;width:100%;max-width:620px;padding:12px;border:0;border-bottom:1px solid var(--border);background:transparent;color:var(--text);text-align:left}.settings-results>button:hover{background:var(--bg-hover)}.settings-results>button>span{display:flex;flex:1;flex-direction:column;gap:3px}.settings-results small{color:var(--text-faint)}.no-settings{display:flex;flex-direction:column;align-items:center;gap:5px;padding:60px 20px;color:var(--text-faint);text-align:center}.no-settings p{margin:8px 0 0;color:var(--text);font-weight:600}.no-settings span{font-size:var(--fs-sm)}
.sp-body {
  flex: 1;
  min-height: 0;
  display: flex;
  padding: 0 10px 10px;
  gap: 10px;
}
/* nav rail — floats on the Mica backdrop, exactly like the download sidebar */
.tabs {
  width: 190px;
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px 6px;
  overflow-y: auto;
}
/* white content card — same surface, border, radius and shadow as the table */
.content-card {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  overflow: hidden;
}
.tab {
  position: relative;
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 8px 12px;
  border: 1px solid transparent;
  border-radius: var(--radius);
  background: transparent;
  color: var(--text);
  text-align: left;
  font-size: var(--fs);
  transition: background-color var(--dur-fast) var(--ease-standard);
}
.tab :deep(svg) {
  color: var(--text-muted);
  flex: none;
  transition: color var(--dur-fast) var(--ease-standard);
}
.tab:hover {
  background: var(--bg-hover-strong);
}
.tab.active {
  background: var(--bg-selected);
  font-weight: 600;
}
.tab.active :deep(svg) {
  color: var(--accent-text);
}
.pill {
  position: absolute;
  left: 0;
  top: 50%;
  width: 3px;
  height: 0;
  border-radius: 3px;
  background: var(--accent);
  transform: translateY(-50%);
  transition: height var(--dur-slow) var(--ease-decel);
}
.tab.active .pill {
  height: 16px;
}
.panel {
  flex: 1;
  min-height: 0;
  padding: 22px 26px;
  overflow-y: auto;
}
.pane {
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-width: 560px;
}
.frow {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.frow.inline {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}
.frow.dim {
  opacity: 0.55;
}
.frow > label {
  font-size: var(--fs);
  font-weight: 600;
  color: var(--text);
}
.chk {
  display: flex;
  align-items: center;
  gap: 9px;
  font-weight: 400 !important;
}
.hint {
  font-size: var(--fs-sm);
  color: var(--text-faint);
}
.inline-sub {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-left: 29px;
}
.narrow {
  width: 92px;
}
.wide-control { width: 210px; }
.unit-control { display: flex; align-items: center; gap: 8px; color: var(--text-muted); font-size: var(--fs-sm); }
.section-intro { padding-bottom: 4px; border-bottom: 1px solid var(--border); }
.section-intro h2 { margin: 0 0 4px; font-size: 15px; font-weight: 650; }
.section-intro p { margin: 0; color: var(--text-muted); font-size: var(--fs-sm); }
textarea { width: 100%; min-height: 80px; resize: vertical; }
.notice { padding: 12px 14px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--bg-subtle); color: var(--text-muted); font-size: var(--fs-sm); line-height: 1.45; }
.integration-status { display:flex;align-items:center;gap:9px;padding:10px 12px;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg-subtle);font-weight:600 }
.status-dot { width:8px;height:8px;border-radius:50%;background:var(--st-active);box-shadow:0 0 0 3px color-mix(in srgb,var(--st-active) 18%,transparent) }
.status-dot.off{background:var(--st-error);box-shadow:0 0 0 3px color-mix(in srgb,var(--st-error) 18%,transparent)}.tool-health{display:flex;flex-direction:column;gap:12px;padding:14px;border:1px solid var(--border);border-radius:var(--radius-lg);background:var(--bg-subtle)}.tool-health-head{display:flex;justify-content:space-between;gap:12px}.tool-health h3{margin:0 0 3px;font-size:15px}.tool-health p{margin:0;color:var(--text-muted);font-size:var(--fs-sm)}.tool-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.tool-row{display:flex;align-items:flex-start;gap:10px;padding:10px;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg-surface)}.tool-row .status-dot{margin-top:5px}.tool-row div{display:flex;flex-direction:column;gap:2px}.tool-row small{color:var(--text-faint)}.tool-actions{display:flex;flex-wrap:wrap;gap:7px}
.install-steps { margin:0;padding:12px 14px 12px 34px;border:1px solid var(--border);border-radius:var(--radius);color:var(--text-muted);line-height:1.7 }
.install-steps b { color:var(--text) }
.cookie-box { display:flex;flex-direction:column;gap:10px;padding:12px 14px;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg-subtle) }
.cookie-row { display:grid;grid-template-columns:130px 1fr;gap:8px }
.queue-card{display:flex;flex-direction:column;gap:10px}.queue-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.queue-grid label{display:flex;flex-direction:column;gap:5px;color:var(--text-muted);font-size:var(--fs-sm)}

/* theme segmented control */
.seg {
  display: inline-flex;
  gap: 4px;
  margin-top: 4px;
  padding: 4px;
  background: var(--bg-subtle);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  width: fit-content;
}
.seg-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 18px;
  border: 1px solid transparent;
  border-radius: var(--radius);
  background: transparent;
  color: var(--text-muted);
  font-size: var(--fs);
  font-weight: 500;
  transition: background-color var(--dur-fast) var(--ease-standard),
    color var(--dur-fast) var(--ease-standard),
    box-shadow var(--dur-fast) var(--ease-standard);
}
.seg-btn:hover:not(.on) {
  background: var(--bg-hover-strong);
  color: var(--text);
}
.seg-btn.on {
  background: var(--bg-surface);
  border-color: var(--border);
  color: var(--accent-text);
  font-weight: 600;
  box-shadow: var(--shadow-control);
}
.seg-btn.on :deep(svg) {
  color: var(--accent-text);
}

.folder-control {
  display: flex;
  gap: 8px;
  min-width: 0;
}
.folder-control input {
  flex: 1;
  min-width: 0;
  color: var(--text-muted);
}
.browse {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--border-control);
  border-bottom-color: var(--border-control-bottom);
  border-radius: var(--radius-sm);
  background: var(--bg-control);
  color: var(--text);
  font-weight: 600;
}
.browse:hover {
  background: var(--bg-hover-strong);
}
.browse.icon-only {
  width: 34px;
  padding: 0;
  flex: none;
}
.cat-add {
  display: flex;
  gap: 8px;
  margin-bottom: 4px;
}
.cat-add input {
  flex: 1;
}
.cat-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.cat {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 10px 12px;
  background: var(--bg-subtle);
}
.cat-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.cat-head :deep(svg) {
  color: var(--text-muted);
}
.cat-name {
  flex: 1;
  font-weight: 600;
}
.rm {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-surface);
  color: var(--text-muted);
}
.rm:hover {
  background: var(--st-error);
  border-color: var(--st-error);
  color: #fff;
}
.cat-fields {
  display: grid;
  grid-template-columns: 84px 1fr;
  gap: 8px 10px;
  align-items: center;
}
.cat-fields label {
  font-size: var(--fs-sm);
  color: var(--text-muted);
}
.connect-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  width: fit-content;
}
.sp-foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 18px;
  border-top: 1px solid var(--border);
  background: var(--bg-subtle);
  flex: none;
}
.foot-spacer{flex:1}.sp-foot .danger-outline{color:var(--st-error);border-color:color-mix(in srgb,var(--st-error) 35%,var(--border));background:var(--st-error-bg)}.confirm-backdrop{position:fixed;inset:0;z-index:500;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.42);backdrop-filter:blur(3px)}.confirm-card{display:flex;gap:14px;width:min(460px,calc(100vw - 32px));padding:20px;border:1px solid var(--border-strong);border-radius:var(--radius-lg);background:var(--bg-surface);box-shadow:var(--shadow-dialog)}.confirm-card>:deep(svg){color:var(--st-error);flex:none}.confirm-card h2{margin:0 0 7px;font-size:17px}.confirm-card p{margin:0 0 18px;color:var(--text-muted);line-height:1.5}.confirm-card div div{display:flex;justify-content:flex-end;gap:8px}.btn.danger{background:var(--st-error);border-color:var(--st-error);color:#fff}
@media(max-width:820px){.tabs{width:58px}.tab{justify-content:center;padding:8px}.tab>span:last-child{display:none}.settings-search{width:210px}.panel{padding:18px}.sp-body{gap:4px}.queue-grid,.tool-grid{grid-template-columns:1fr}.sp-foot{padding:10px}.sp-foot .reset-page,.sp-foot .danger-outline{font-size:0;width:34px;padding:0}.sp-foot .reset-page::after{content:'↺';font-size:17px}.sp-foot .danger-outline::after{content:'!';font-size:15px;font-weight:700}}
</style>
