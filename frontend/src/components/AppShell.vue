<script lang="ts" setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useDownloadsStore } from '../stores/downloads';
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
import SettingsDialog from './dialogs/SettingsDialog.vue';
import RemoveConfirmDialog from './dialogs/RemoveConfirmDialog.vue';
import CapturePrompt from './dialogs/CapturePrompt.vue';

const store = useDownloadsStore();

// dialog + menu state
const showAdd = ref(false);
const showSettings = ref(false);
const showRemove = ref(false);
const propsId = ref<string | null>(null);
const ctxMenu = ref<{ id: string; x: number; y: number } | null>(null);

// video add flow
const videoInfo = ref<VideoInfo | null>(null);
const pendingReq = ref<AddDownloadRequest | null>(null);

const activeTitle = computed(() => {
  const c = store.activeCategory;
  if (c === 'all') return 'All Downloads';
  if (c === 'unfinished') return 'Unfinished';
  if (c === 'finished') return 'Finished';
  return store.settings?.categories.find((x) => x.id === c)?.name ?? 'Downloads';
});

// -- add / video flow -------------------------------------------------------
async function onAddSubmit(req: AddDownloadRequest) {
  if (req.kind === 'video') {
    // probe for formats, then hand off to the picker
    pendingReq.value = req;
    videoInfo.value = await store.probeVideo(req.url);
    showAdd.value = false;
    return;
  }
  await store.add(req);
  showAdd.value = false;
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
    });
    // attach probed formats + selection so Properties/row reflect the choice
    if (info) {
      d.video = { ...info, selectedFormatId: formatId };
      store.applyOne(d);
    }
    await store.selectVideoFormat(d.id, formatId);
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
  if (typing) return;

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
    e.preventDefault();
    showAdd.value = true;
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
    e.preventDefault();
    store.selectAll();
  } else if (e.key === 'Delete' && store.hasSelection) {
    e.preventDefault();
    showRemove.value = true;
  }
}

onMounted(() => document.addEventListener('keydown', onKey));
onBeforeUnmount(() => document.removeEventListener('keydown', onKey));
</script>

<template>
  <div class="shell">
    <TitleBar />

    <Toolbar
      @add="showAdd = true"
      @settings="showSettings = true"
      @delete="showRemove = true"
      @capture="store.triggerCapture()"
      @toggle-theme="$emit('toggle-theme')"
    />

    <!-- filter / search sub-bar -->
    <div class="subbar">
      <div class="crumb">
        <Icon name="folder" :size="14" />
        <span>{{ activeTitle }}</span>
        <span class="crumb-count">{{ store.visibleDownloads.length }}</span>
      </div>
      <div class="search">
        <Icon name="search" :size="14" />
        <input
          type="search"
          placeholder="Search downloads…"
          :value="store.searchQuery"
          @input="store.setSearch(($event.target as HTMLInputElement).value)"
        />
      </div>
    </div>

    <div class="main">
      <CategorySidebar />
      <div class="content">
        <DownloadTable @contextmenu="onRowContext" @open="onOpenRow" />
      </div>
    </div>

    <StatusBar />

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

    <AddUrlDialog v-if="showAdd" @close="showAdd = false" @submit="onAddSubmit" />
    <VideoFormatDialog
      v-if="videoInfo"
      :info="videoInfo"
      @close="closeVideo"
      @select="onVideoSelect"
    />
    <PropertiesDialog v-if="propsId" :id="propsId" @close="propsId = null" />
    <SettingsDialog v-if="showSettings && store.settings" @close="showSettings = false" />
    <RemoveConfirmDialog v-if="showRemove && store.hasSelection" @close="showRemove = false" />
    <CapturePrompt v-if="store.capturePrompt" :request="store.capturePrompt" />
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
</style>
