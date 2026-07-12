<script lang="ts" setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useDownloadsStore } from '../stores/downloads';
import { useUiStore } from '../stores/ui';
import { videoTools } from '../services/videoTools';
import type { AddDownloadRequest, VideoInfo } from '../types';
import TitleBar from './TitleBar.vue';
import Toolbar from './Toolbar.vue';
import CategorySidebar from './CategorySidebar.vue';
import DownloadTable from './DownloadTable.vue';
import StatusBar from './StatusBar.vue';
import RowContextMenu from './RowContextMenu.vue';
import Icon from './Icon.vue';
import AddUrlDialog from './dialogs/AddUrlDialog.vue';
import VideoFormatDialog from './dialogs/VideoFormatDialog.vue';
import PropertiesDialog from './dialogs/PropertiesDialog.vue';
import SettingsPage from './SettingsPage.vue';
import RemoveConfirmDialog from './dialogs/RemoveConfirmDialog.vue';
import BrowserConnect from './BrowserConnect.vue';
import CompletionDialog from './dialogs/CompletionDialog.vue';

const store = useDownloadsStore();
const ui = useUiStore();

// dialog + menu state
const showAdd = ref(false);
const showRemove = ref(false);
const propsId = ref<string | null>(null);
const ctxMenu = ref<{ id: string; x: number; y: number } | null>(null);
const searchEl = ref<HTMLInputElement | null>(null);
const fileTypeMenu=ref(false);const fileTypeFilterEl=ref<HTMLElement|null>(null);const fileTypeOptions=[{value:'all',label:'All file types'},{value:'app',label:'Programs'},{value:'archive',label:'Archives'},{value:'document',label:'Documents'},{value:'audio',label:'Music'},{value:'video',label:'Videos'},{value:'image',label:'Images'},{value:'torrent',label:'Torrents'},{value:'file',label:'Other files'}] as const;const fileTypeLabel=computed(()=>fileTypeOptions.find((x)=>x.value===store.fileTypeFilter)?.label??'All file types');function chooseFileType(value:string){store.setFileTypeFilter(value as never);fileTypeMenu.value=false}function closeFileTypeOnOutside(e:PointerEvent){if(!fileTypeFilterEl.value?.contains(e.target as Node))fileTypeMenu.value=false}

// video add flow
const videoInfo = ref<VideoInfo | null>(null);
const pendingReq = ref<AddDownloadRequest | null>(null);
const probing = ref(false);

const activeTitle = computed(() => {
  const c = store.activeCategory;
  if (c === 'all') return 'All Downloads';
  if (c === 'unfinished') return 'Unfinished';
  if (c === 'finished') return 'Finished';
  return store.settings?.categories.find((x) => x.id === c)?.name ?? 'Downloads';
});

// yt-dlp-missing → actionable error toast (manual video adds inside the app).
const errorMsg = ref<string | null>(null);
const errorAction = ref<{ label: string; run: () => void } | null>(null);
const pendingVideoRetry = ref<AddDownloadRequest | null>(null);
let errTimer: ReturnType<typeof setTimeout> | null = null;

function showError(msg: string, action?: { label: string; run: () => void }) {
  errorMsg.value = msg;
  errorAction.value = action ?? null;
  if (errTimer) clearTimeout(errTimer);
  // Errors with an action stay until the user acts or dismisses.
  if (!action) errTimer = setTimeout(() => (errorMsg.value = null), 9000);
}
function dismissError() {
  errorMsg.value = null;
  errorAction.value = null;
}

// Download yt-dlp on demand, then retry the video that triggered the prompt.
async function installYtDlp() {
  errorAction.value = null;
  errorMsg.value = 'Downloading yt-dlp… 0%';
  videoTools.onProgress((received, total) => {
    const pct = total > 0 ? Math.floor((received / total) * 100) : 0;
    errorMsg.value = `Downloading yt-dlp… ${pct}%`;
  });
  try {
    await videoTools.install();
    dismissError();
    const retry = pendingVideoRetry.value;
    pendingVideoRetry.value = null;
    if (retry) await onAddSubmit(retry);
  } catch {
    showError('Couldn’t download yt-dlp automatically. Please install it manually and add it to your PATH.');
  }
}

function openAdd() {
  showAdd.value = true;
}
function closeAdd() {
  showAdd.value = false;
}

// -- add / video flow -------------------------------------------------------
async function onAddSubmit(req: AddDownloadRequest) {
  if (req.kind === 'video') {
    // Probe for formats, then hand off to the picker. Surface failures (the
    // common one being yt-dlp not installed) instead of doing nothing.
    pendingReq.value = req;
    showAdd.value = false;
    probing.value = true; // reading a video can take a few seconds — show it
    try {
      const info = await store.probeVideo(req.url, req.browser, req.browserProfile);
      if (!info || !info.formats?.length) throw new Error('no formats');
      videoInfo.value = info;
    } catch {
      // Most common cause: yt-dlp isn't installed. Offer a one-click install
      // and remember the request so we can retry it automatically afterwards.
      pendingVideoRetry.value = req;
      pendingReq.value = null;
      showError('Video downloads need yt-dlp — Grabify can install it for you.', {
        label: 'Install yt-dlp (~17 MB)',
        run: installYtDlp,
      });
    } finally {
      probing.value = false;
    }
    return;
  }
  await store.add(req);
  closeAdd();
}

async function onVideoSelect(formatId: string) {
  const req = pendingReq.value;
  const info = videoInfo.value;
  if (req) {
    const fmt = info?.formats.find((f) => f.id === formatId);
    const ext = fmt?.ext ?? 'mp4';
    // Prefer the probed title for the filename, and default videos to the
    // Video category when the user left it on auto-detect.
    const filename =
      req.filename ?? (info?.title ? `${info.title}.${ext}` : undefined);
    const d = await store.add({
      ...req,
      kind: 'video',
      filename,
      category: req.category ?? 'video',
      videoFormatId: formatId,
    });
    // attach probed formats + selection so Properties/row reflect the choice
    if (info) {
      d.video = { ...info, selectedFormatId: formatId };
      store.applyOne(d);
    }
  }
  videoInfo.value = null;
  pendingReq.value = null;
}

function closeVideo() {
  videoInfo.value = null;
  pendingReq.value = null;
}

// -- context menu -----------------------------------------------------------
function onRowContext(payload: { id: string; x: number; y: number }) {
  ctxMenu.value = payload;
}
function onOpenRow(id: string) {
  const d = store.byId.get(id);
  if (d?.state === 'completed') store.openFile(id);
  else propsId.value = id;
}

// -- keyboard shortcuts -----------------------------------------------------
function onKey(e: KeyboardEvent) {
  const target = e.target as HTMLElement;
  const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);

  // Ctrl+F focuses search from anywhere (even while typing elsewhere).
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
    e.preventDefault();
    searchEl.value?.focus();
    searchEl.value?.select();
    return;
  }
  if (typing) return;

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
    e.preventDefault();
    openAdd();
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
    e.preventDefault();
    store.selectAll();
  } else if (e.key === 'Delete' && store.hasSelection) {
    e.preventDefault();
    showRemove.value = true;
  }
}

onMounted(() => {document.addEventListener('keydown', onKey);document.addEventListener('pointerdown',closeFileTypeOnOutside)});
onBeforeUnmount(() => {document.removeEventListener('keydown', onKey);document.removeEventListener('pointerdown',closeFileTypeOnOutside)});
</script>

<template>
  <div class="shell">
    <!-- Merged top bar: command buttons on the left (where the title bar's empty
         drag space used to be), a draggable region + window controls on the
         right. Reclaims the whole row the toolbar previously owned. -->
    <div class="topbar" v-if="ui.view !== 'settings'">
      <Toolbar
        @add="openAdd"
        @delete="showRemove = true"
      />
      <TitleBar />
    </div>

    <!-- Settings takes over the whole area as a full page; it renders its own
         title bar + window controls, so there is no separate top bar here. -->
    <SettingsPage v-if="ui.view === 'settings'" />

    <template v-else>

    <!-- filter / search sub-bar -->
    <div class="subbar">
      <div class="crumb">
        <Icon name="folder" :size="14" />
        <span>{{ activeTitle }}</span>
        <span class="crumb-count">{{ store.visibleDownloads.length }}</span>
      </div>
      <div class="sub-actions">
      <div ref="fileTypeFilterEl" class="type-filter"><button class="type-trigger" :aria-expanded="fileTypeMenu" aria-haspopup="listbox" @click="fileTypeMenu=!fileTypeMenu"><Icon name="file" :size="14"/><span>{{fileTypeLabel}}</span><Icon name="chevron" :size="12"/></button><div v-if="fileTypeMenu" class="type-menu" role="listbox" aria-label="Filter by file type"><button v-for="o in fileTypeOptions" :key="o.value" role="option" :aria-selected="store.fileTypeFilter===o.value" :class="{selected:store.fileTypeFilter===o.value}" @click="chooseFileType(o.value)"><Icon v-if="store.fileTypeFilter===o.value" name="check" :size="13"/><span v-else class="option-space"/>{{o.label}}</button></div></div>
      <div class="search">
        <Icon name="search" :size="14" />
        <input
          ref="searchEl"
          type="search"
          placeholder="Search downloads   Ctrl+F"
          :value="store.searchQuery"
          @input="store.setSearch(($event.target as HTMLInputElement).value)"
        />
      </div>
      </div>
    </div>

    <div class="main">
      <CategorySidebar />
      <div class="content">
        <DownloadTable
          @contextmenu="onRowContext"
          @open="onOpenRow"
          @delete="showRemove = true"
          @add="openAdd"
        />
      </div>
    </div>

    <StatusBar />
    </template>

    <!-- overlays -->
    <RowContextMenu
      v-if="ctxMenu"
      :id="ctxMenu.id"
      :x="ctxMenu.x"
      :y="ctxMenu.y"
      @close="ctxMenu = null"
      @properties="propsId = $event"
      @delete="showRemove = true"
    />

    <AddUrlDialog v-if="showAdd" @close="closeAdd" @submit="onAddSubmit" />
    <VideoFormatDialog
      v-if="videoInfo"
      :info="videoInfo"
      @close="closeVideo"
      @select="onVideoSelect"
    />
    <PropertiesDialog v-if="propsId" :id="propsId" @close="propsId = null" />
    <RemoveConfirmDialog v-if="showRemove && store.hasSelection" @close="showRemove = false" />
    <BrowserConnect v-if="ui.browserConnect" @close="ui.closeBrowserConnect()" />
    <CompletionDialog v-if="store.completionPrompt" :download="store.completionPrompt" />

    <!-- reading-a-video progress (probe can take a few seconds) -->
    <div v-if="probing" class="probing">
      <div class="probing-card">
        <span class="spinner" />
        <span>Reading video…</span>
      </div>
    </div>

    <!-- transient error toast (e.g. video needs yt-dlp) -->
    <div v-if="errorMsg" class="err-toast">
      <Icon name="info" :size="16" />
      <span class="err-msg">{{ errorMsg }}</span>
      <button v-if="errorAction" class="err-action" @click="errorAction.run()">{{ errorAction.label }}</button>
      <button class="err-x" @click="dismissError" aria-label="Dismiss"><Icon name="close" :size="14" /></button>
    </div>
  </div>
</template>

<style scoped>
.shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  background: transparent; /* Mica backdrop from body reads through */
}
/* Single top row: commands (Toolbar) sized to content on the left; the title
   bar (draggable filler + window controls) fills the remaining width so the
   window stays draggable and the caption buttons sit top-right. */
.topbar {
  display: flex;
  align-items: stretch;
  height: var(--topbar-h); /* taller than the buttons so they sit with padding */
  flex: none;
}
.topbar > .toolbar {
  flex: none;
}
.topbar > .titlebar {
  flex: 1;
  min-width: 0;
}
.subbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 50px;
  padding: 0 16px 10px;
  background: transparent;
  flex: none;
}
.crumb {
  display: flex;
  align-items: center;
  gap: 9px;
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 16px;
  letter-spacing: -0.01em;
}
.crumb :deep(svg) {
  color: var(--accent-text);
}
.crumb-count {
  font-size: var(--fs-sm);
  color: var(--text-muted);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 999px;
  min-width: 22px;
  text-align: center;
  padding: 1px 8px;
  box-shadow: var(--shadow-control);
}
.search {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--bg-control);
  border: 1px solid var(--border-control);
  border-bottom-color: var(--border-control-bottom);
  border-radius: var(--radius-sm);
  padding: 0 11px;
  height: 32px;
  width: 300px;
  transition: border-color var(--dur) var(--ease-standard),
    box-shadow var(--dur) var(--ease-standard);
}
.sub-actions{display:flex;align-items:center;gap:8px;margin-left:auto}.type-filter{position:relative}.type-trigger{display:flex;align-items:center;gap:7px;height:32px;min-width:154px;padding:0 9px;border:1px solid var(--border-control);border-bottom-color:var(--border-control-bottom);border-radius:var(--radius-sm);background:var(--bg-control);color:var(--text-muted)}.type-trigger span{flex:1;text-align:left}.type-trigger:hover,.type-trigger[aria-expanded=true]{background:var(--bg-surface);color:var(--text)}.type-menu{position:absolute;right:0;top:36px;width:190px;padding:5px;border:1px solid var(--border);border-radius:var(--radius-lg);background:var(--bg-surface);box-shadow:var(--shadow-menu);z-index:80}.type-menu button{display:flex;align-items:center;gap:8px;width:100%;padding:7px 9px;border:0;border-radius:var(--radius-sm);background:transparent;color:var(--text);text-align:left}.type-menu button:hover{background:var(--bg-hover-strong)}.type-menu button.selected{color:var(--accent-text);font-weight:600}.option-space{width:13px}
.search:hover {
  background: var(--bg-surface);
}
.search:focus-within {
  border-bottom-color: var(--accent);
  box-shadow: inset 0 -1px 0 0 var(--accent);
}
.search :deep(svg) {
  color: var(--text-faint);
  flex: none;
}
.search input {
  border: none;
  background: transparent;
  padding: 0;
  flex: 1;
  height: 100%;
  min-height: 0;
  line-height: normal;
  outline: none;
  box-shadow: none;
}
.search input:focus {
  border: none;
  box-shadow: none;
}
.search input::-webkit-search-cancel-button {
  cursor: pointer;
}
.main {
  flex: 1;
  display: flex;
  min-height: 0;
  padding: 0 10px 10px;
  gap: 10px;
}
.content {
  flex: 1;
  min-width: 0;
  display: flex;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: var(--shadow-card);
}
.probing {
  position: fixed;
  inset: 0;
  z-index: 350;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 9vh;
  background: rgba(0, 0, 0, 0.42);
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
  animation: err-in var(--dur-slow) var(--ease-standard);
}
.probing-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 22px;
  background: var(--bg-surface);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-dialog);
  font-size: var(--fs);
  font-weight: 500;
}
.spinner {
  width: 18px;
  height: 18px;
  flex: none;
  border: 2px solid var(--border-strong);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.err-toast {
  position: fixed;
  left: 50%;
  bottom: 46px;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: 560px;
  padding: 11px 12px 11px 14px;
  background: var(--st-error-bg);
  border: 1px solid color-mix(in srgb, var(--st-error) 40%, transparent);
  color: var(--text);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-menu);
  font-size: var(--fs-sm);
  z-index: 400;
  cursor: default;
  animation: err-in var(--dur-slow) var(--ease-decel);
}
.err-toast :deep(svg) {
  color: var(--st-error);
  flex: none;
}
.err-msg {
  flex: 1;
  min-width: 0;
}
.err-action {
  flex: none;
  padding: 6px 12px;
  border: 1px solid var(--st-error);
  border-radius: var(--radius-sm);
  background: var(--st-error);
  color: #fff;
  font-size: var(--fs-sm);
  font-weight: 600;
  white-space: nowrap;
}
.err-action:hover {
  background: color-mix(in srgb, var(--st-error) 88%, #000);
}
.err-x {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  flex: none;
  border: none;
  background: transparent;
  color: var(--text-muted);
  border-radius: var(--radius-sm);
}
.err-x:hover {
  background: var(--bg-hover-strong);
  color: var(--text);
}
@keyframes err-in {
  from { opacity: 0; transform: translate(-50%, 8px); }
  to { opacity: 1; transform: translate(-50%, 0); }
}
@media (max-width:900px){.search{width:220px}.type-trigger{min-width:132px}.subbar{gap:8px}.crumb{font-size:14px}}
@media (max-width:720px){.main :deep(.sidebar){display:none}.main{padding-left:8px}.crumb-count{display:none}.type-trigger{min-width:34px;width:34px}.type-trigger span,.type-trigger :deep(svg:last-child){display:none}.search{width:min(260px,45vw)}}
</style>
