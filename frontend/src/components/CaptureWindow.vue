<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue';
import { useDownloadsStore } from '../stores/downloads';
import { useUiStore } from '../stores/ui';
import { videoTools } from '../services/videoTools';
import { pickFolder } from '../services/folderPicker';
import { formatBytes } from '../utils/format';
import type { AddDownloadRequest, VideoFormat } from '../types';
import Icon from './Icon.vue';

const store = useDownloadsStore();
const ui = useUiStore();

// The captured request lives on the ui store; snapshot it once.
const req = ui.captureReq as AddDownloadRequest;
const isVideo = computed(() => req?.kind === 'video');

const filename = ref(req?.filename ?? '');
const category = ref(req?.category ?? 'auto');
const destination = ref(req?.destinationPath ?? '');
const categories = computed(() => store.settings?.categories ?? []);

// video state
const probing = ref(false);
const needsYtDlp = ref(false);
const installing = ref(false);
const installPct = ref(0);
const formats = ref<VideoFormat[]>([]);
const selectedFormat = ref('');

function formatLabel(f: VideoFormat): string {
  const bits = [f.label];
  if (f.ext) bits.push(f.ext.toUpperCase());
  if (f.sizeBytes) bits.push(formatBytes(f.sizeBytes));
  if (f.hasVideo && !f.hasAudio) bits.push('no audio');
  return bits.join('  ·  ');
}

async function probe() {
  if (!isVideo.value) return;
  probing.value = true;
  needsYtDlp.value = false;
  try {
    const info = await store.probeVideo(req.url, req.browser, req.browserProfile);
    if (!info || !info.formats?.length) throw new Error('no formats');
    formats.value = info.formats;
    selectedFormat.value = info.selectedFormatId || info.formats[0].id;
    if (!filename.value && info.title) filename.value = info.title;
  } catch {
    needsYtDlp.value = true;
  } finally {
    probing.value = false;
  }
}

async function installYtDlp() {
  installing.value = true;
  installPct.value = 0;
  videoTools.onProgress((r, t) => (installPct.value = t > 0 ? Math.floor((r / t) * 100) : 0));
  try {
    await videoTools.install();
    needsYtDlp.value = false;
    await probe();
  } catch {
    /* keep the needs-yt-dlp state; user can retry or install manually */
  } finally {
    installing.value = false;
  }
}

async function chooseFolder() {
  destination.value = await pickFolder(destination.value || store.settings?.downloadDir || '');
}

const canDownload = computed(() => {
  if (!isVideo.value) return true;
  return !probing.value && !needsYtDlp.value && !!selectedFormat.value;
});

async function download() {
  if (!canDownload.value) return;
  const base: AddDownloadRequest = {
    ...req,
    filename: filename.value.trim() || undefined,
    category: category.value === 'auto' ? undefined : category.value,
    destinationPath: destination.value.trim() || undefined,
  };
  if (isVideo.value) {
    await store.add({ ...base, kind: 'video', videoFormatId: selectedFormat.value });
  } else {
    await store.add(base);
  }
  ui.captureDone();
}

onMounted(probe);
</script>

<template>
  <div class="cap">
    <!-- draggable header -->
    <div class="cap-head">
      <span class="cap-badge"><Icon :name="isVideo ? 'video' : 'http'" :size="15" /></span>
      <div class="cap-title">
        <div class="t1">Download with Rivlet</div>
        <div class="t2">{{ isVideo ? 'Video from your browser' : 'Link from your browser' }}</div>
      </div>
      <button class="cap-x" @click="ui.captureCancel()" title="Cancel" aria-label="Cancel"><Icon name="close" :size="15" /></button>
    </div>

    <!-- form -->
    <div class="cap-body">
      <label class="fld">
        <span class="lbl">File name</span>
        <input v-model="filename" type="text" spellcheck="false" placeholder="(auto)" />
      </label>

      <label class="fld">
        <span class="lbl">Category</span>
        <select v-model="category">
          <option value="auto">Auto-detect</option>
          <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
      </label>

      <div class="fld">
        <span class="lbl">Save to</span>
        <div class="folder">
          <input :value="destination || store.settings?.downloadDir || ''" type="text" readonly />
          <button class="btn browse" type="button" @click="chooseFolder"><Icon name="folder" :size="15" /> Browse</button>
        </div>
      </div>

      <!-- video quality -->
      <template v-if="isVideo">
        <div v-if="probing" class="vstate">
          <span class="spinner" /> Reading video…
        </div>
        <div v-else-if="needsYtDlp" class="vstate needs">
          <Icon name="info" :size="15" />
          <span v-if="!installing">Video downloads need <b>yt-dlp</b>.</span>
          <span v-else>Downloading yt-dlp… {{ installPct }}%</span>
          <button v-if="!installing" class="btn primary sm" @click="installYtDlp">Install (~17 MB)</button>
        </div>
        <label v-else class="fld">
          <span class="lbl">Quality</span>
          <select v-model="selectedFormat">
            <option v-for="f in formats" :key="f.id" :value="f.id">{{ formatLabel(f) }}</option>
          </select>
        </label>
      </template>

      <div class="url mono" :title="req?.url">{{ req?.url }}</div>
    </div>

    <!-- footer -->
    <div class="cap-foot">
      <button class="btn" @click="ui.captureCancel()">Cancel</button>
      <button class="btn primary" :disabled="!canDownload" @click="download">Download</button>
    </div>
  </div>
</template>

<style scoped>
.cap {
  height: 100vh;
  width: 100vw;
  display: flex;
  flex-direction: column;
  background: var(--bg-surface);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  overflow: hidden;
  user-select: none;
}
.cap-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 10px 12px 14px;
  border-bottom: 1px solid var(--border);
  flex: none;
  --wails-draggable: drag;
}
.cap-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  flex: none;
  border-radius: 50%;
  color: #fff;
  background: linear-gradient(145deg, #6fdc79 0%, #4fbf5f 100%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.4);
}
:root[data-theme='dark'] .cap-badge {
  color: rgba(0, 0, 0, 0.82);
}
.cap-title {
  flex: 1;
  min-width: 0;
}
.t1 {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 14px;
  letter-spacing: -0.01em;
}
.t2 {
  font-size: var(--fs-sm);
  color: var(--text-muted);
}
.cap-x {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  flex: none;
  border: none;
  background: transparent;
  color: var(--text-muted);
  border-radius: var(--radius-sm);
  --wails-draggable: no-drag;
}
.cap-x:hover {
  background: #c42b1c;
  color: #fff;
}
.cap-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 13px;
}
.fld {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.lbl {
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--text-muted);
}
.fld input,
.fld select {
  width: 100%;
}
.folder {
  display: flex;
  gap: 8px;
  min-width: 0;
}
.folder input {
  flex: 1;
  min-width: 0;
  color: var(--text-muted);
}
.browse {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  white-space: nowrap;
}
.vstate {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 10px 12px;
  border-radius: var(--radius);
  background: var(--bg-subtle);
  font-size: var(--fs-sm);
  color: var(--text-muted);
}
.vstate.needs {
  background: var(--st-error-bg);
}
.vstate.needs :deep(svg) {
  color: var(--st-error);
  flex: none;
}
.vstate .btn.sm {
  margin-left: auto;
  min-width: 0;
  padding: 5px 12px;
  min-height: 30px;
}
.spinner {
  width: 14px;
  height: 14px;
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
.url {
  font-size: var(--fs-xs);
  color: var(--text-faint);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-top: auto;
  padding-top: 4px;
}
.cap-foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 13px 16px;
  border-top: 1px solid var(--border);
  background: var(--bg-subtle);
  flex: none;
}
</style>
