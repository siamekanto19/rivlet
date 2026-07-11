<script lang="ts" setup>
import { reactive, ref } from 'vue';
import { useDownloadsStore } from '../../stores/downloads';
import type { Category, Settings } from '../../types';
import { parseSpeedToBps } from '../../utils/format';
import Icon from '../Icon.vue';
import Modal from './Modal.vue';
import { pickFolder } from '../../services/folderPicker';

const store = useDownloadsStore();
const emit = defineEmits<{ (e: 'close'): void }>();

type Tab = 'general' | 'downloads' | 'categories' | 'schedule' | 'notifications';
const tabs: { id: Tab; label: string; icon: string }[] = [
  { id: 'general', label: 'General', icon: 'settings' },
  { id: 'downloads', label: 'Downloads', icon: 'http' },
  { id: 'categories', label: 'Categories', icon: 'folder' },
  { id: 'schedule', label: 'Schedule', icon: 'scheduler' },
  { id: 'notifications', label: 'Notifications', icon: 'info' },
];
const active = ref<Tab>('general');

// working copy
const src = store.settings as Settings;
const draft = reactive<Settings>(JSON.parse(JSON.stringify(src)));

// global speed limit as a KB/s field
const limitOn = ref(draft.globalSpeedLimitBps != null);
const limitKb = ref(
  draft.globalSpeedLimitBps != null ? Math.round(draft.globalSpeedLimitBps / 1024) : 500,
);

// category editing
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
  emit('close');
}

async function chooseDefaultFolder() {
  draft.downloadDir = await pickFolder(draft.downloadDir);
}

async function chooseCategoryFolder(category: Category) {
  category.folder = await pickFolder(category.folder || draft.downloadDir);
}
</script>

<template>
  <Modal title="Settings" width="640px" @close="emit('close')">
    <div class="settings">
      <!-- tab rail -->
      <div class="tabs">
        <button
          v-for="t in tabs"
          :key="t.id"
          class="tab"
          :class="{ active: active === t.id }"
          @click="active = t.id"
        >
          <Icon :name="t.icon" :size="15" />
          <span>{{ t.label }}</span>
        </button>
      </div>

      <!-- panels -->
      <div class="panel">
        <!-- GENERAL -->
        <div v-show="active === 'general'" class="pane">
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
        </div>

        <!-- DOWNLOADS -->
        <div v-show="active === 'downloads'" class="pane">
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
        </div>

        <!-- CATEGORIES -->
        <div v-show="active === 'categories'" class="pane">
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
        </div>

        <!-- SCHEDULE -->
        <div v-show="active === 'schedule'" class="pane">
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
        </div>

        <!-- NOTIFICATIONS -->
        <div v-show="active === 'notifications'" class="pane">
          <div class="frow">
            <label class="chk">
              <input type="checkbox" v-model="draft.notifyOnComplete" />
              Show a notification when a download completes
            </label>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <button class="btn" @click="emit('close')">Cancel</button>
      <button class="btn primary" @click="save">Save</button>
    </template>
  </Modal>
</template>

<style scoped>
.settings {
  display: grid;
  grid-template-columns: 150px 1fr;
  gap: 0;
  min-height: 320px;
  margin: -14px -16px;
}
.tabs {
  display: flex;
  flex-direction: column;
  gap: 1px;
  background: var(--bg-panel);
  border-right: 1px solid var(--border);
  padding: 8px 6px;
}
.tab {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border: 1px solid transparent;
  border-radius: var(--radius);
  background: transparent;
  color: var(--text);
  text-align: left;
  font-size: var(--fs);
}
.tab :deep(svg) {
  color: var(--text-muted);
  flex: none;
}
.tab:hover {
  background: var(--bg-hover);
}
.tab.active {
  background: var(--bg-selected);
  font-weight: 600;
}
.tab.active :deep(svg) {
  color: var(--accent);
}
.panel {
  padding: 16px 18px;
  overflow-y: auto;
  max-height: 60vh;
}
.pane {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.frow {
  display: flex;
  flex-direction: column;
  gap: 5px;
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
  color: var(--text);
}
.chk {
  display: flex;
  align-items: center;
  gap: 8px;
}
.hint {
  font-size: var(--fs-sm);
  color: var(--text-faint);
}
.inline-sub {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-left: 22px;
}
.narrow {
  width: 90px;
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
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--bg-surface);
  color: var(--text);
  font-weight: 600;
}
.browse:hover {
  background: var(--bg-hover);
}
.browse.icon-only {
  width: 34px;
  padding: 0;
  flex: none;
}
.cat-add {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
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
  padding: 8px 10px;
  background: var(--bg-panel);
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
  border-radius: var(--radius);
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
  gap: 6px 10px;
  align-items: center;
}
.cat-fields label {
  font-size: var(--fs-sm);
  color: var(--text-muted);
}
</style>
