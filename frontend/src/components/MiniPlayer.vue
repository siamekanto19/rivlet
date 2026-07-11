<script lang="ts" setup>
import { computed } from 'vue';
import { useDownloadsStore } from '../stores/downloads';
import { formatSpeed } from '../utils/format';
import Icon from './Icon.vue';

const store = useDownloadsStore();

const emit = defineEmits<{ (e: 'expand'): void; (e: 'close'): void }>();

const active = computed(() =>
  store.downloads.filter((d) => d.state === 'active' || d.state === 'connecting'),
);
const pausedList = computed(() => store.downloads.filter((d) => d.state === 'paused'));
const activeCount = computed(() => active.value.length);
const pausedCount = computed(() => pausedList.value.length);
const queued = computed(() => store.queuedCount);
const totalSpeed = computed(() => store.totalSpeedBps);

// Downloads with partial progress worth showing (running or paused).
const inProgress = computed(() => [...active.value, ...pausedList.value]);

// Nothing left to do — every download is finished, cancelled or errored.
const done = computed(
  () => activeCount.value === 0 && pausedCount.value === 0 && queued.value === 0,
);

// Overall progress across in-progress downloads (byte-weighted where sizes are
// known, otherwise a simple average of the per-download percentages).
const overall = computed(() => {
  const list = inProgress.value;
  if (!list.length) return 100; // nothing running/paused -> show as done
  const known = list.filter((d) => d.sizeBytes != null);
  const total = known.reduce((s, d) => s + (d.sizeBytes || 0), 0);
  const got = known.reduce((s, d) => s + d.downloadedBytes, 0);
  if (total > 0) return Math.min(100, (got / total) * 100);
  return list.reduce((s, d) => s + d.progressPct, 0) / list.length;
});

// The download to headline — the fastest active one, else a paused one.
const primary = computed(() => {
  if (active.value.length)
    return [...active.value].sort((x, y) => (y.speedBps || 0) - (x.speedBps || 0))[0];
  return pausedList.value[0] ?? null;
});

const headline = computed(() => {
  if (activeCount.value > 0)
    return `${activeCount.value} downloading`;
  if (pausedCount.value > 0)
    return pausedCount.value > 1 ? `${pausedCount.value} paused` : 'Paused';
  if (queued.value > 0) return `${queued.value} queued`;
  return 'All downloads complete';
});

const subline = computed(() => {
  if (primary.value) return primary.value.filename;
  if (queued.value > 0) return 'Waiting to start…';
  return 'Nothing is downloading';
});

const speedText = computed(() => {
  if (activeCount.value > 0) return formatSpeed(totalSpeed.value);
  if (pausedCount.value > 0) return 'Paused';
  if (queued.value > 0) return 'Queued';
  return 'Idle';
});

// -- queue transport controls (act on the whole queue) ----------------------
const RESUMABLE = ['paused', 'queued', 'error', 'canceled'];
const PAUSABLE = ['active', 'connecting', 'queued'];
const CANCELABLE = ['active', 'connecting', 'queued', 'paused'];

const canResume = computed(() => store.downloads.some((d) => RESUMABLE.includes(d.state)));
const canPause = computed(() => store.downloads.some((d) => PAUSABLE.includes(d.state)));
const canCancel = computed(() => store.downloads.some((d) => CANCELABLE.includes(d.state)));

function resumeAll() {
  store.resumeAll();
}
function pauseAll() {
  store.pauseAll();
}
function cancelAll() {
  for (const d of store.downloads) {
    if (CANCELABLE.includes(d.state)) store.cancel(d.id);
  }
}
</script>

<template>
  <div class="mini" :class="{ done }">
    <!-- header (drag region) + window controls -->
    <div class="mini-head">
      <span class="mini-glyph" :class="{ done }">
        <Icon :name="done ? 'check' : 'download'" :size="14" />
      </span>
      <span class="mini-headline">{{ headline }}</span>
      <div class="mini-actions">
        <button class="mbtn" @click="emit('expand')" title="Restore window" aria-label="Restore window">
          <svg width="11" height="11" viewBox="0 0 12 12">
            <path d="M4 1.5H1.5V4M8 1.5h2.5V4M4 10.5H1.5V8M8 10.5h2.5V8"
              fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
          </svg>
        </button>
        <button class="mbtn close" @click="emit('close')" title="Send to tray" aria-label="Send to tray">
          <svg width="11" height="11" viewBox="0 0 11 11">
            <path d="M1.5 1.5L9.5 9.5M9.5 1.5L1.5 9.5" stroke="currentColor" stroke-width="1.1" />
          </svg>
        </button>
      </div>
    </div>

    <!-- primary download -->
    <div class="mini-file">
      <span class="fname" :title="subline">{{ subline }}</span>
      <span class="pct tnum" v-if="!done">{{ Math.floor(overall) }}%</span>
    </div>

    <!-- overall progress -->
    <div class="mini-track">
      <div class="mini-fill" :class="{ done }" :style="{ width: overall.toFixed(1) + '%' }" />
    </div>

    <!-- transport controls + speed -->
    <div class="mini-foot">
      <div class="mini-controls">
        <button class="cbtn" :disabled="!canResume" @click="resumeAll" title="Resume all" aria-label="Resume all">
          <Icon name="resume" :size="15" />
        </button>
        <button class="cbtn" :disabled="!canPause" @click="pauseAll" title="Pause all" aria-label="Pause all">
          <Icon name="pause" :size="15" />
        </button>
        <button class="cbtn danger" :disabled="!canCancel" @click="cancelAll" title="Cancel all" aria-label="Cancel all">
          <Icon name="stop" :size="14" />
        </button>
      </div>
      <span class="mini-speed tnum">{{ speedText }}</span>
    </div>
  </div>
</template>

<style scoped>
.mini {
  /* the whole OS window is the widget */
  height: 100vh;
  width: 100vw;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 11px 14px 12px;
  background: var(--bg-surface);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  overflow: hidden;
  user-select: none;
  /* drag the whole widget anywhere on the desktop */
  --wails-draggable: drag;
}
.mini-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.mini-glyph {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  flex: none;
  border-radius: 50%;
  color: #fff;
  background: linear-gradient(145deg, #6fdc79 0%, #4fbf5f 100%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.4);
}
:root[data-theme='dark'] .mini-glyph {
  color: rgba(0, 0, 0, 0.82);
}
.mini-glyph.done {
  background: linear-gradient(145deg, #6fdc79 0%, #43b063 100%);
}
.mini-headline {
  flex: 1;
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 13.5px;
  letter-spacing: -0.01em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mini-actions {
  display: flex;
  gap: 2px;
  flex: none;
  --wails-draggable: no-drag;
}
.mbtn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-muted);
  transition: background-color var(--dur-fast) var(--ease-standard),
    color var(--dur-fast) var(--ease-standard);
}
.mbtn:hover {
  background: var(--bg-hover-strong);
  color: var(--text);
}
.mbtn.close:hover {
  background: #c42b1c;
  color: #fff;
}
.mini-file {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.fname {
  flex: 1;
  font-size: var(--fs);
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pct {
  flex: none;
  font-size: var(--fs);
  font-weight: 700;
  color: var(--accent-text);
}
.mini-track {
  height: 6px;
  width: 100%;
  background: var(--progress-track);
  border-radius: 999px;
  overflow: hidden;
}
.mini-fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--progress-fill-2), var(--progress-fill));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.35);
  transition: width 0.25s var(--ease-decel);
}
.mini-fill.done {
  background: linear-gradient(90deg, var(--progress-done-2), var(--progress-done));
}
.mini-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 1px;
}
.mini-controls {
  display: flex;
  align-items: center;
  gap: 2px;
  /* keep transport clicks from dragging the window */
  --wails-draggable: no-drag;
}
.cbtn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 28px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text);
  transition: background-color var(--dur-fast) var(--ease-standard),
    color var(--dur-fast) var(--ease-standard);
}
.cbtn:hover:not(:disabled) {
  background: var(--bg-hover-strong);
}
.cbtn:active:not(:disabled) {
  background: var(--bg-active);
}
.cbtn:disabled {
  color: var(--text-disabled);
}
.cbtn:disabled :deep(svg) {
  opacity: 0.45;
}
.cbtn.danger:hover:not(:disabled) {
  background: var(--st-error-bg);
  color: var(--st-error);
}
.mini-speed {
  flex: none;
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--text-muted);
}
</style>
