<script lang="ts" setup>
import { computed, ref } from 'vue';
import { useDownloadsStore } from '../stores/downloads';
import { formatSpeed, formatBytes, parseSpeedToBps } from '../utils/format';
import Icon from './Icon.vue';

const store = useDownloadsStore();

const totalSpeed = computed(() => store.totalSpeedBps);
const activeCount = computed(() => store.activeCount);
const queuedCount = computed(() => store.queuedCount);
const limit = computed(() => store.settings?.globalSpeedLimitBps ?? null);

const menuOpen = ref(false);
const customValue = ref('');

const presets: Array<{ label: string; bps: number | null }> = [
  { label: 'Unlimited', bps: null },
  { label: '256 KB/s', bps: 256 * 1024 },
  { label: '512 KB/s', bps: 512 * 1024 },
  { label: '1 MB/s', bps: 1024 * 1024 },
  { label: '5 MB/s', bps: 5 * 1024 * 1024 },
  { label: '10 MB/s', bps: 10 * 1024 * 1024 },
];

function apply(bps: number | null) {
  store.setGlobalSpeedLimit(bps);
  menuOpen.value = false;
}
function applyCustom() {
  const bps = parseSpeedToBps(customValue.value, 'KB');
  store.setGlobalSpeedLimit(bps);
  customValue.value = '';
  menuOpen.value = false;
}
</script>

<template>
  <div class="statusbar">
    <div class="cell speed">
      <Icon name="gauge" :size="13" />
      <span class="tnum">{{ totalSpeed > 0 ? formatSpeed(totalSpeed) : 'Idle' }}</span>
    </div>

    <div class="sep" />
    <div class="cell">
      <span class="st-active-dot" /> {{ activeCount }} active
    </div>
    <div class="sep" />
    <div class="cell">{{ queuedCount }} queued</div>
    <div class="sep" />
    <div class="cell">{{ store.completedCount }} complete</div>

    <div class="spacer" />

    <div class="limit-wrap">
      <button class="cell limit" :class="{ on: limit != null }" @click="menuOpen = !menuOpen">
        <Icon name="gauge" :size="13" />
        <span>Speed limit: {{ limit == null ? 'Off' : formatBytes(limit) + '/s' }}</span>
        <Icon name="chevron" :size="12" />
      </button>
      <div v-if="menuOpen" class="limit-menu" @mouseleave="menuOpen = false">
        <button
          v-for="p in presets"
          :key="p.label"
          class="lm-item"
          :class="{ sel: p.bps === limit }"
          @click="apply(p.bps)"
        >
          <Icon v-if="p.bps === limit" name="check" :size="13" />
          <span v-else class="ck-space" />
          {{ p.label }}
        </button>
        <div class="lm-custom">
          <input
            v-model="customValue"
            type="number"
            min="1"
            placeholder="Custom"
            @keyup.enter="applyCustom"
          />
          <span>KB/s</span>
          <button class="btn" @click="applyCustom">Set</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.statusbar {
  display: flex;
  align-items: center;
  height: var(--status-h);
  padding: 0 14px;
  background: var(--bg-toolbar);
  backdrop-filter: saturate(1.4) blur(20px);
  -webkit-backdrop-filter: saturate(1.4) blur(20px);
  border-top: 1px solid var(--border);
  font-size: var(--fs-sm);
  color: var(--text-muted);
  flex: none;
  gap: 2px;
}
.cell {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  white-space: nowrap;
}
.cell.speed {
  color: var(--st-active);
  font-weight: 600;
  min-width: 96px;
}
.cell.speed :deep(svg) {
  color: var(--st-active);
}
.sep {
  width: 1px;
  height: 14px;
  background: var(--border);
  margin: 0 2px;
}
.spacer {
  flex: 1;
}
.st-active-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--st-active);
  box-shadow: 0 0 0 3px var(--st-active-bg);
}
.limit-wrap {
  position: relative;
}
.limit {
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-muted);
  height: 24px;
  transition: background-color var(--dur-fast) var(--ease-standard);
}
.limit:hover {
  background: var(--bg-hover-strong);
}
.limit.on {
  color: var(--accent-text);
  font-weight: 600;
}
.limit.on :deep(svg) {
  color: var(--accent-text);
}
.limit-menu {
  position: absolute;
  bottom: 30px;
  right: 0;
  min-width: 200px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-menu);
  padding: 5px;
  z-index: 50;
  transform-origin: bottom right;
  animation: flyout-in var(--dur-slow) var(--ease-decel);
}
@keyframes flyout-in {
  from {
    opacity: 0;
    transform: translateY(6px) scale(0.97);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
.lm-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 10px;
  border: none;
  background: transparent;
  color: var(--text);
  text-align: left;
  border-radius: var(--radius-sm);
  font-size: var(--fs);
  transition: background-color var(--dur-fast) var(--ease-standard);
}
.lm-item:hover {
  background: var(--bg-hover-strong);
}
.lm-item.sel {
  color: var(--accent-text);
  font-weight: 600;
}
.lm-item.sel :deep(svg) {
  color: var(--accent-text);
}
.ck-space {
  width: 13px;
  display: inline-block;
}
.lm-custom {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 6px 4px;
  border-top: 1px solid var(--border);
  margin-top: 5px;
}
.lm-custom input {
  width: 72px;
}
.lm-custom .btn {
  min-width: auto;
  padding: 3px 12px;
}
</style>
