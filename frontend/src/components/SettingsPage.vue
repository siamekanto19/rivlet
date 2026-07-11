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

type Tab = 'general' | 'appearance' | 'downloads' | 'categories' | 'schedule' | 'notifications';
const tabs: { id: Tab; label: string; icon: string }[] = [
  { id: 'general', label: 'General', icon: 'settings' },
  { id: 'appearance', label: 'Appearance', icon: 'appearance' },
  { id: 'downloads', label: 'Downloads', icon: 'http' },
  { id: 'categories', label: 'Categories', icon: 'folder' },
  { id: 'schedule', label: 'Schedule', icon: 'scheduler' },
  { id: 'notifications', label: 'Notifications', icon: 'notification' },
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

      <!-- panels -->
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
            <span class="hint">Choose how Grabby looks. “System” follows your Windows theme.</span>
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
        </section>
      </div>
    </div>

    <!-- footer -->
    <div class="sp-foot">
      <button class="btn" @click="ui.closeSettings()">Discard</button>
      <button class="btn primary" @click="save">Save changes</button>
    </div>
  </div>
</template>

<style scoped>
.settings-page {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg-surface);
  margin: 0 10px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  overflow: hidden;
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
  gap: 12px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border);
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
  font-size: 19px;
  font-weight: 600;
  letter-spacing: -0.01em;
}
.sp-body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 190px 1fr;
}
.tabs {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 12px 8px;
  border-right: 1px solid var(--border);
  overflow-y: auto;
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
  left: -2px;
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
