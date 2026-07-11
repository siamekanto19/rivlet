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
const urlInput = ref<HTMLInputElement | null>(null);

const categories = computed(() => store.settings?.categories ?? []);

const kind = computed<DownloadKind | null>(() => {
  const u = url.value.trim();
  if (!u) return null;
  return detectKind(u);
});

const kindLabel = computed(() => {
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

const valid = computed(() => {
  const u = url.value.trim();
  return u.length > 3 && (/^https?:\/\//i.test(u) || u.startsWith('magnet:'));
});

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

function submit() {
  if (!valid.value) return;
  const req: AddDownloadRequest = {
    url: url.value.trim(),
    filename: filename.value.trim() || undefined,
    category: category.value === 'auto' ? undefined : category.value,
    destinationPath: destination.value.trim() || undefined,
    kind: kind.value ?? undefined,
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
          <input
            ref="urlInput"
            v-model="url"
            type="text"
            placeholder="https://…  or  magnet:?xt=…"
            spellcheck="false"
            @keyup.enter="submit"
          />
          <div v-if="kind" class="kind-hint">
            <Icon :name="kind" :size="14" />
            <span>{{ kindLabel }}</span>
          </div>
        </div>
      </label>

      <label class="row">
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
        {{ kind === 'video' ? 'Next…' : 'Download' }}
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
  color: var(--accent);
}
</style>
