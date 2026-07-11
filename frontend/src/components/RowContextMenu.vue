<script lang="ts" setup>
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue';
import { useDownloadsStore } from '../stores/downloads';
import Icon from './Icon.vue';

const store = useDownloadsStore();

const props = defineProps<{ id: string; x: number; y: number }>();
const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'properties', id: string): void;
  (e: 'delete'): void;
}>();

const menuEl = ref<HTMLElement | null>(null);
const pos = ref({ x: props.x, y: props.y });

const target = computed(() => store.byId.get(props.id));
const multi = computed(() => store.selectedIds.length > 1);

const canPause = computed(() =>
  store.selectedDownloads.some((d) => ['active', 'connecting', 'queued'].includes(d.state)),
);
const canResume = computed(() =>
  store.selectedDownloads.some((d) => ['paused', 'queued', 'error', 'canceled'].includes(d.state)),
);
const canCancel = computed(() =>
  store.selectedDownloads.some((d) => ['active', 'connecting', 'queued', 'paused'].includes(d.state)),
);
const canRetry = computed(() =>
  store.selectedDownloads.some((d) => ['error', 'canceled'].includes(d.state)),
);
const canOpen = computed(() => !multi.value && target.value?.state === 'completed');

function close() {
  emit('close');
}

async function doResume() {
  await store.resumeSelected();
  close();
}
async function doPause() {
  await store.pauseSelected();
  close();
}
async function doCancel() {
  for (const d of store.selectedDownloads) await store.cancel(d.id);
  close();
}
async function doRetry() {
  for (const d of store.selectedDownloads) {
    if (['error', 'canceled'].includes(d.state)) await store.retry(d.id);
  }
  close();
}
async function openFile() {
  if (target.value) await store.openFile(target.value.id);
  close();
}
async function openFolder() {
  if (target.value) await store.openFolder(target.value.id);
  close();
}
async function copyUrl() {
  if (target.value) await store.copyUrl(target.value.id);
  close();
}
function properties() {
  if (target.value) emit('properties', target.value.id);
  close();
}
function removeKeep() {
  emit('delete');
  close();
}

// reposition to stay on screen
function reposition() {
  const el = menuEl.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  let x = props.x;
  let y = props.y;
  if (x + rect.width > window.innerWidth) x = window.innerWidth - rect.width - 4;
  if (y + rect.height > window.innerHeight) y = window.innerHeight - rect.height - 4;
  pos.value = { x: Math.max(2, x), y: Math.max(2, y) };
}

function onDocMouseDown(e: MouseEvent) {
  if (menuEl.value && !menuEl.value.contains(e.target as Node)) close();
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') close();
}

onMounted(() => {
  requestAnimationFrame(reposition);
  document.addEventListener('mousedown', onDocMouseDown, true);
  document.addEventListener('keydown', onKey);
});
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocMouseDown, true);
  document.removeEventListener('keydown', onKey);
});
watch(() => [props.x, props.y], () => requestAnimationFrame(reposition));
</script>

<template>
  <div
    ref="menuEl"
    class="menu"
    :style="{ left: pos.x + 'px', top: pos.y + 'px' }"
    @contextmenu.prevent
  >
    <button class="mi" :disabled="!canOpen" @click="openFile">
      <Icon name="file" :size="15" /> <span>Open</span>
    </button>
    <button class="mi" :disabled="multi" @click="openFolder">
      <Icon name="folder" :size="15" /> <span>Open containing folder</span>
    </button>

    <div class="mdiv" />

    <button class="mi" :disabled="!canResume" @click="doResume">
      <Icon name="resume" :size="14" /> <span>Resume</span>
    </button>
    <button class="mi" :disabled="!canPause" @click="doPause">
      <Icon name="pause" :size="14" /> <span>Pause</span>
    </button>
    <button class="mi" :disabled="!canCancel" @click="doCancel">
      <Icon name="stop" :size="13" /> <span>Cancel</span>
    </button>
    <button class="mi" :disabled="!canRetry" @click="doRetry">
      <Icon name="retry" :size="15" /> <span>Retry</span>
    </button>

    <div class="mdiv" />

    <button class="mi" :disabled="multi" @click="copyUrl">
      <Icon name="copy" :size="14" /> <span>Copy download URL</span>
    </button>

    <div class="mdiv" />

    <button class="mi danger" @click="removeKeep">
      <Icon name="delete" :size="15" /> <span>Remove{{ multi ? ' selected' : '' }}…</span>
    </button>

    <div class="mdiv" />

    <button class="mi" :disabled="multi" @click="properties">
      <Icon name="info" :size="15" /> <span>Properties</span>
    </button>
  </div>
</template>

<style scoped>
.menu {
  position: fixed;
  min-width: 232px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-menu);
  padding: 5px;
  z-index: 200;
  user-select: none;
  transform-origin: top left;
  animation: menu-in var(--dur-slow) var(--ease-decel);
}
@keyframes menu-in {
  from {
    opacity: 0;
    transform: scale(0.97) translateY(-4px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}
.mi {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 8px 12px;
  border: none;
  background: transparent;
  color: var(--text);
  text-align: left;
  border-radius: var(--radius-sm);
  font-size: var(--fs);
  white-space: nowrap;
  transition: background-color var(--dur-fast) var(--ease-standard);
}
.mi :deep(svg) {
  color: var(--text-muted);
  flex: none;
}
.mi:hover:not(:disabled) {
  background: var(--bg-hover-strong);
}
.mi:active:not(:disabled) {
  background: var(--bg-active);
}
.mi:disabled {
  color: var(--text-disabled);
}
.mi:disabled :deep(svg) {
  opacity: 0.4;
}
.mi.danger {
  color: var(--st-error);
}
.mi.danger :deep(svg) {
  color: var(--st-error);
}
.mi.danger:hover:not(:disabled) {
  background: var(--st-error-bg);
}
.mdiv {
  height: 1px;
  background: var(--border);
  margin: 5px 8px;
}
</style>
