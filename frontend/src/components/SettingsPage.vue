<script lang="ts" setup>
import { reactive, ref } from 'vue';
import { useDownloadsStore } from '../stores/downloads';
import { useUiStore } from '../stores/ui';
import type { Category, Settings } from '../types';
import { parseSpeedToBps } from '../utils/format';
import Icon from './Icon.vue';
import { pickFolder } from '../services/folderPicker';

const store = useDownloadsStore();
const ui = useUiStore();

type Tab = 'general' | 'appearance' | 'downloads' | 'connection' | 'browser' | 'filetypes' | 'categories' | 'schedule' | 'notifications' | 'advanced';
const tabs: { id: Tab; label: string; icon: string }[] = [
  { id: 'general', label: 'General', icon: 'settings' },
  { id: 'appearance', label: 'Appearance', icon: 'appearance' },
  { id: 'downloads', label: 'Downloads', icon: 'http' },
  { id: 'connection', label: 'Connection', icon: 'link' },
  { id: 'browser', label: 'Browser Integration', icon: 'monitor' },
  { id: 'filetypes', label: 'File Types', icon: 'file' },
  { id: 'categories', label: 'Categories', icon: 'folder' },
  { id: 'schedule', label: 'Schedule', icon: 'scheduler' },
  { id: 'notifications', label: 'Notifications', icon: 'notification' },
  { id: 'advanced', label: 'Advanced', icon: 'settings' },
];
const active = ref<Tab>('general');

const themeOptions: { id: 'light' | 'dark' | 'system'; label: string; icon: string }[] = [
  { id: 'light', label: 'Light', icon: 'sun' },
  { id: 'dark', label: 'Dark', icon: 'moon' },
  { id: 'system', label: 'System', icon: 'monitor' },
];

// working copy of persisted settings (theme is applied live, separately)
const src = store.settings as Settings;
const draft = reactive<Settings>(JSON.parse(JSON.stringify(src)));
const captureTypesText = ref((draft.captureFileTypes ?? []).join(', '));
const excludedSitesText = ref((draft.excludedSites ?? []).join('\n'));
const disabledVideoSitesText = ref((draft.disabledVideoSites ?? []).join('\n'));

const limitOn = ref(draft.globalSpeedLimitBps != null);
const limitKb = ref(
  draft.globalSpeedLimitBps != null ? Math.round(draft.globalSpeedLimitBps / 1024) : 500,
);

const newCatName = ref('');
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

function save() {
  draft.globalSpeedLimitBps = limitOn.value ? parseSpeedToBps(String(limitKb.value), 'KB') : null;
  if (!draft.schedule) draft.schedule = { enabled: false, startHHmm: '01:00', stopHHmm: '08:00' };
  draft.captureFileTypes = captureTypesText.value.split(/[\s,]+/).map((x) => x.replace(/^\./, '').toLowerCase()).filter(Boolean);
  draft.excludedSites = excludedSitesText.value.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  draft.disabledVideoSites = disabledVideoSitesText.value.split(/\r?\n/).map((x) => x.trim().toLowerCase()).filter(Boolean);
  store.updateSettings(JSON.parse(JSON.stringify(draft)));
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
      <button class="back" @click="ui.closeSettings()" title="Back to downloads" aria-label="Back">
        <Icon name="back" :size="18" />
      </button>
      <h1>Settings</h1>
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
            <span class="hint">Choose how Grabify looks. “System” follows your Windows theme.</span>
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
          <label class="chk"><input type="checkbox" v-model="draft.autoResumeOnStartup" /> Resume interrupted downloads when Grabify starts</label>
          <label class="chk"><input type="checkbox" v-model="draft.removeCompleted" /> Remove completed items from the list automatically</label>
        </section>

        <!-- CONNECTION -->
        <section v-show="active === 'connection'" class="pane">
          <div class="section-intro"><h2>Connection tuning</h2><p>Control parallel connections, failure recovery, and HTTP identity.</p></div>
          <div class="frow inline"><label>Segments per download</label><input class="narrow" type="number" min="1" max="32" v-model.number="draft.segmentCount" /></div>
          <span class="hint">Grabify adapts this maximum to file size. Sixteen is fast for large files without wasting connections on small files.</span>
          <div class="frow inline"><label>Retry failed downloads</label><div class="unit-control"><input class="narrow" type="number" min="0" max="20" v-model.number="draft.retryCount" /><span>times</span></div></div>
          <div class="frow inline"><label>Delay between retries</label><div class="unit-control"><input class="narrow" type="number" min="1" max="3600" v-model.number="draft.retryDelaySeconds" /><span>seconds</span></div></div>
          <div class="frow inline"><label>Connection timeout</label><div class="unit-control"><input class="narrow" type="number" min="5" max="300" v-model.number="draft.requestTimeoutSeconds" /><span>seconds</span></div></div>
          <div class="frow"><label>User agent for manually added downloads</label><input v-model="draft.userAgent" type="text" spellcheck="false" /></div>
        </section>

        <!-- FILE TYPES -->
        <section v-show="active === 'filetypes'" class="pane">
          <div class="section-intro"><h2>Browser capture rules</h2><p>Choose which downloads the browser integration should offer to Grabify.</p></div>
          <div class="frow">
            <button class="btn primary connect-btn" @click="ui.openBrowserConnect()">
              <Icon name="link" :size="15" /> Set up browser integration…
            </button>
            <span class="hint">Load Grabify's extension into Chrome or Edge, with step-by-step help.</span>
          </div>
          <div class="frow"><label>Captured file extensions</label><textarea v-model="captureTypesText" rows="3" placeholder="zip, exe, pdf, mp4" /><span class="hint">Separate extensions with commas or spaces.</span></div>
          <div class="frow"><label>Excluded sites</label><textarea v-model="excludedSitesText" rows="5" placeholder="*.example.com&#10;downloads.example.org" /><span class="hint">One hostname pattern per line.</span></div>
        </section>

        <!-- BROWSER INTEGRATION -->
        <section v-show="active === 'browser'" class="pane">
          <label class="chk"><input type="checkbox" v-model="draft.showBrowserOnboardingOnStartup" /> Show browser setup whenever Grabify starts</label>
          <div class="section-intro"><h2>Grabify browser integration</h2><p>Connect the bundled Chrome or Edge extension to this desktop app.</p></div>
          <div class="integration-status"><span class="status-dot" /> Native capture listener is active</div>
          <ol class="install-steps"><li>Open <b>chrome://extensions</b> or <b>edge://extensions</b>.</li><li>Enable Developer mode and choose <b>Load unpacked</b>.</li><li>Select Grabify's installed <b>integration\extension</b> folder.</li><li>Open extension options and run Test connection.</li></ol>
          <label class="chk"><input type="checkbox" v-model="draft.videoDetectionEnabled" /> Enable playback-based video detection after granting all-site access in the extension</label>
          <div class="frow"><label>Never prompt on these sites</label><textarea v-model="disabledVideoSitesText" rows="4" placeholder="example.com" /><span class="hint">Keep this list aligned with the extension's Disabled sites list.</span></div>
          <div class="frow inline"><label>Preferred video quality</label><select v-model="draft.preferredVideoQuality" class="wide-control"><option value="best">Best available</option><option value="2160">2160p</option><option value="1440">1440p</option><option value="1080">1080p</option><option value="720">720p</option><option value="480">480p</option></select></div>
          <div class="frow inline"><label>Preferred container</label><select v-model="draft.preferredVideoContainer" class="wide-control"><option value="mp4">MP4</option><option value="mkv">MKV</option><option value="webm">WebM</option></select></div>
          <div class="frow inline"><label>Concurrent video fragments</label><input class="narrow" type="number" min="1" max="16" v-model.number="draft.concurrentFragments" /></div>
          <div class="cookie-box"><label class="chk"><input type="checkbox" v-model="draft.cookieConsent" /> Allow yt-dlp to read a selected browser profile only when sign-in is required</label><div class="cookie-row"><select v-model="draft.cookieBrowser" :disabled="!draft.cookieConsent"><option value="">Choose browser</option><option value="chrome">Chrome</option><option value="edge">Edge</option></select><input v-model="draft.cookieProfile" :disabled="!draft.cookieConsent" placeholder="Profile path or name (for example Default)" /></div><span class="hint">Grabify stores only this browser/profile choice, never cookie values. Disable this option to revoke consent.</span></div>
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
        <section v-show="active === 'schedule'" class="pane">
          <template v-if="draft.schedule">
            <div class="frow">
              <label class="chk">
                <input type="checkbox" v-model="draft.schedule.enabled" />
                Enable download scheduler
              </label>
              <span class="hint">Automatically start and stop the queue within a time window.</span>
            </div>
            <div class="frow inline" :class="{ dim: !draft.schedule.enabled }">
              <label>Start queue at</label>
              <input class="narrow" type="time" v-model="draft.schedule.startHHmm" :disabled="!draft.schedule.enabled" />
            </div>
            <div class="frow inline" :class="{ dim: !draft.schedule.enabled }">
              <label>Stop queue at</label>
              <input class="narrow" type="time" v-model="draft.schedule.stopHHmm" :disabled="!draft.schedule.enabled" />
            </div>
          </template>
        </section>

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
          <div class="section-intro"><h2>Storage and safety</h2><p>Advanced options for incomplete downloads and automated actions.</p></div>
          <div class="frow"><label>Temporary files folder</label><div class="folder-control"><input :value="draft.temporaryDir" type="text" readonly /><button class="browse" type="button" @click="async () => draft.temporaryDir = await pickFolder(draft.temporaryDir)"><Icon name="folder" :size="15" /> Browse</button></div></div>
          <div class="notice">Site passwords, arbitrary completion programs, forced process termination, and dial-up controls are intentionally not stored or executed until a secure credential and permission model is available.</div>
        </section>
        </div>

        <!-- footer -->
        <div class="sp-foot">
          <button class="btn" @click="ui.closeSettings()">Discard</button>
          <button class="btn primary" @click="save">Save changes</button>
        </div>
      </div>
    </div>
  </div>
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
.sp-head {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 50px;
  padding: 0 16px 10px;
  flex: none;
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
.install-steps { margin:0;padding:12px 14px 12px 34px;border:1px solid var(--border);border-radius:var(--radius);color:var(--text-muted);line-height:1.7 }
.install-steps b { color:var(--text) }
.cookie-box { display:flex;flex-direction:column;gap:10px;padding:12px 14px;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg-subtle) }
.cookie-row { display:grid;grid-template-columns:130px 1fr;gap:8px }

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
</style>
