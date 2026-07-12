<script lang="ts" setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useDownloadsStore } from '../../stores/downloads';
import { detectKind } from '../../services/MockDownloadService';
import type { AddDownloadRequest, DownloadKind } from '../../types';
import Icon from '../Icon.vue';
import Modal from './Modal.vue';
import { pickFolder } from '../../services/folderPicker';
import { formatBytes } from '../../utils/format';

const store = useDownloadsStore();
const props = defineProps<{ initialRequest?: AddDownloadRequest | null }>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'submit', req: AddDownloadRequest): void;
}>();

const url = ref(props.initialRequest?.url ?? '');
const filename = ref(props.initialRequest?.filename ?? '');
const category = ref(props.initialRequest?.category ?? 'auto');
const destination = ref(props.initialRequest?.destinationPath ?? '');
const urlInput = ref<HTMLTextAreaElement | null>(null);
const expectedSha256 = ref(props.initialRequest?.expectedSha256 ?? '');
const authScheme=ref<'none'|'basic'|'bearer'>('none');const authUsername=ref('');const authSecret=ref('');const rememberCredential=ref(false);

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

// -- auto-probe: fetch the filename + size from the URL ----------------------
const probedSize = ref<number | null>(null);
const probing = ref(false);
// Never clobber a name the user typed (or one a capture request supplied).
const filenameTouched = ref(!!props.initialRequest?.filename);
let probeSeq = 0;
let probeTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleProbe() {
  if (probeTimer) clearTimeout(probeTimer);
  probeSeq++; // invalidate any in-flight probe
  probedSize.value = null;
  probing.value = false;
  const single = urls.value[0];
  if (multi.value || !single || kind.value !== 'http') return;
  probeTimer = setTimeout(() => runProbe(single), 500);
}
async function runProbe(u: string) {
  const seq = ++probeSeq;
  probing.value = true;
  try {
    const info = await store.probeUrl(u);
    if (seq !== probeSeq) return; // a newer URL superseded this probe
    probedSize.value = info.sizeBytes ?? null;
    if (!filenameTouched.value && info.filename) filename.value = info.filename;
  } catch {
    /* probe is best-effort — leave the fields as they are */
  } finally {
    if (seq === probeSeq) probing.value = false;
  }
}
watch(url, scheduleProbe, { immediate: true });

// Prefill from clipboard if it looks like a URL (mirrors IDM behavior).
onMounted(async () => {
  try {
    if (!props.initialRequest?.url) {
      const text = await navigator.clipboard?.readText?.();
      if (text && (/^https?:\/\//i.test(text) || text.startsWith('magnet:'))) {
        url.value = text.trim();
      }
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
	...props.initialRequest,
    url: urls.value[0],
    filename: filename.value.trim() || undefined,
    kind: kind.value ?? undefined,
	expectedSha256: expectedSha256.value.trim() || undefined,
    authScheme: authScheme.value==='none'?undefined:authScheme.value,
    authUsername: authUsername.value.trim()||undefined,
    authSecret: authSecret.value||undefined,
    rememberCredential: rememberCredential.value,
    ...shared,
  };
  emit('submit', req);
}

async function chooseDestination() {
  destination.value = await pickFolder(destination.value || store.settings?.downloadDir || '');
}

// Open a .torrent file via the native picker (handled in Go); closes on success.
async function openTorrentFile() {
  const d = await store.addTorrentFile();
  if (d && d.id) emit('close');
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
          <button type="button" class="torrent-file-btn" @click="openTorrentFile">
            <Icon name="torrent" :size="14" />
            <span>Or open a <b>.torrent</b> file…</span>
          </button>
        </div>
      </label>

      <label class="row" v-if="!multi">
        <span class="lab">Save as</span>
        <div class="field">
          <input v-model="filename" @input="filenameTouched = true" type="text" placeholder="(auto from URL)" spellcheck="false" />
          <div v-if="probing" class="meta-hint"><span class="dot-spin" /> Fetching file details…</div>
          <div v-else-if="probedSize != null" class="meta-hint size"><Icon name="file" :size="13" /> Size: {{ formatBytes(probedSize) }}</div>
        </div>
      </label>

      <label class="row" v-if="!multi && kind === 'http'">
        <span class="lab">SHA-256</span>
        <input v-model="expectedSha256" type="text" maxlength="64" placeholder="Optional integrity checksum" spellcheck="false" />
      </label>
      <div class="row" v-if="!multi && kind === 'http'"><span class="lab">Authentication</span><div class="auth-fields"><select v-model="authScheme"><option value="none">None</option><option value="basic">HTTP Basic</option><option value="bearer">Bearer token</option></select><template v-if="authScheme!=='none'"><input v-if="authScheme==='basic'" v-model="authUsername" autocomplete="username" placeholder="Username"/><input v-model="authSecret" type="password" autocomplete="current-password" :placeholder="authScheme==='bearer'?'Token':'Password'"/><label class="remember"><input type="checkbox" v-model="rememberCredential"/> Remember securely in Windows Credential Manager</label></template></div></div>

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
.meta-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--fs-sm);
  color: var(--text-muted);
}
.meta-hint.size {
  color: var(--accent-text);
  font-variant-numeric: tabular-nums;
}
.meta-hint :deep(svg) {
  color: currentColor;
}
.dot-spin {
  width: 11px;
  height: 11px;
  border-radius: 50%;
  border: 2px solid var(--border-strong);
  border-top-color: var(--accent);
  animation: dot-spin 0.7s linear infinite;
}
@keyframes dot-spin {
  to {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .dot-spin {
    animation: none;
  }
}
.url-input {
  min-height: 32px;
  resize: none;
  overflow-y: auto;
  line-height: 1.5;
  padding-top: 5px;
  padding-bottom: 5px;
}
.torrent-file-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  align-self: flex-start;
  padding: 3px 2px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: var(--fs-sm);
  cursor: pointer;
}
.torrent-file-btn:hover {
  color: var(--accent-text);
}
.torrent-file-btn :deep(svg) {
  color: var(--ft-torrent);
}
.auth-fields{display:flex;flex-direction:column;gap:8px}.remember{display:flex;align-items:center;gap:7px;color:var(--text-muted);font-size:var(--fs-sm)}
</style>
