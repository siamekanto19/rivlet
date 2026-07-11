<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue';
import { useDownloadsStore } from '../../stores/downloads';
import { detectKind } from '../../services/MockDownloadService';
import type { AddDownloadRequest, DownloadKind } from '../../types';
import Icon from '../Icon.vue';
import Modal from './Modal.vue';
import { pickFolder } from '../../services/folderPicker';

const store = useDownloadsStore();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'submit', req: AddDownloadRequest): void;
}>();

const url = ref('');
const filename = ref('');
const category = ref('auto');
const destination = ref('');
const urlInput = ref<HTMLTextAreaElement | null>(null);

const categories = computed(() => store.settings?.categories ?? []);

function isUrl(u: string): boolean {
  return u.length > 3 && (/^https?:\/\//i.test(u) || u.startsWith('magnet:'));
}

// Paste one URL — or a whole list, one per line. Batch adds skip the video
// format picker (a chain of modals would be hostile); each video takes its
// default format instead.
const urls = computed(() =>
  url.value
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(isUrl),
);
const multi = computed(() => urls.value.length > 1);
const inputRows = computed(() =>
  Math.min(4, Math.max(1, url.value.split('\n').length)),
);

const kind = computed<DownloadKind | null>(() => {
  if (multi.value) return null;
  const u = urls.value[0];
  return u ? detectKind(u) : null;
});

const kindLabel = computed(() => {
  if (multi.value) return `${urls.value.length} links detected — all will be added`;
  switch (kind.value) {
    case 'video':
      return 'Video — a format picker will open next';
    case 'torrent':
      return 'Torrent / magnet link';
    case 'http':
      return 'Direct HTTP download';
    default:
      return '';
  }
});

const valid = computed(() => urls.value.length >= 1);

// Prefill from clipboard if it looks like a URL (mirrors IDM behavior).
onMounted(async () => {
  try {
    const text = await navigator.clipboard?.readText?.();
    if (text && (/^https?:\/\//i.test(text) || text.startsWith('magnet:'))) {
      url.value = text.trim();
    }
  } catch {
    /* clipboard unavailable in dev; ignore */
  }
  urlInput.value?.focus();
});

async function submit() {
  if (!valid.value) return;
  const shared = {
    category: category.value === 'auto' ? undefined : category.value,
    destinationPath: destination.value.trim() || undefined,
  };
  if (multi.value) {
    for (const u of urls.value) {
      await store.add({ url: u, kind: detectKind(u), ...shared });
    }
    emit('close');
    return;
  }
  const req: AddDownloadRequest = {
    url: urls.value[0],
    filename: filename.value.trim() || undefined,
    kind: kind.value ?? undefined,
    ...shared,
  };
  emit('submit', req);
}

async function chooseDestination() {
  destination.value = await pickFolder(destination.value || store.settings?.downloadDir || '');
}
</script>

<template>
  <Modal title="Add download" width="520px" @close="emit('close')">
    <div class="form">
      <label class="row">
        <span class="lab">Address</span>
        <div class="field">
          <textarea
            ref="urlInput"
            v-model="url"
            class="url-input"
            :rows="inputRows"
            placeholder="https://…  or  magnet:?xt=…  (one per line for a batch)"
            spellcheck="false"
            @keydown.enter.exact.prevent="submit"
          />
          <div v-if="kindLabel" class="kind-hint">
            <Icon :name="multi ? 'copy' : kind ?? 'http'" :size="14" />
            <span>{{ kindLabel }}</span>
          </div>
        </div>
      </label>

      <label class="row" v-if="!multi">
        <span class="lab">Save as</span>
        <input v-model="filename" type="text" placeholder="(auto from URL)" spellcheck="false" />
      </label>

      <label class="row">
        <span class="lab">Category</span>
        <select v-model="category">
          <option value="auto">Auto-detect</option>
          <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
      </label>

      <div class="row">
        <span class="lab">Save to</span>
        <div class="folder-control">
          <input
            :value="destination || store.settings?.downloadDir || ''"
            type="text"
            placeholder="Default download folder"
            readonly
          />
          <button class="browse" type="button" @click="chooseDestination">
            <Icon name="folder" :size="15" />
            Browse
          </button>
        </div>
      </div>
    </div>

    <template #footer>
      <button class="btn" @click="emit('close')">Cancel</button>
      <button class="btn primary" :disabled="!valid" @click="submit">
        {{ multi ? `Download ${urls.length} files` : kind === 'video' ? 'Next…' : 'Download' }}
      </button>
    </template>
  </Modal>
</template>

<style scoped>
.form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.row {
  display: grid;
  grid-template-columns: 78px 1fr;
  align-items: start;
  gap: 12px;
}
.lab {
  font-size: var(--fs);
  color: var(--text-muted);
  padding-top: 7px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.field input,
.row > input,
.row > select {
  width: 100%;
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
.kind-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--fs-sm);
  color: var(--accent-text);
}
.url-input {
  min-height: 32px;
  resize: none;
  overflow-y: auto;
  line-height: 1.5;
  padding-top: 5px;
  padding-bottom: 5px;
}
</style>
