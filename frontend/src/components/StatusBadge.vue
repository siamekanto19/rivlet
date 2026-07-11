<script lang="ts" setup>
import { computed } from 'vue';
import type { DownloadState } from '../types';

const props = defineProps<{ state: DownloadState }>();

const labels: Record<DownloadState, string> = {
  queued: 'Queued',
  connecting: 'Connecting',
  active: 'Downloading',
  paused: 'Paused',
  completed: 'Complete',
  error: 'Error',
  canceled: 'Canceled',
};

const label = computed(() => labels[props.state]);
</script>

<template>
  <span class="badge" :class="'st-' + state">
    <span class="dot" />
    {{ label }}
  </span>
</template>

<style scoped>
.badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--fs-sm);
  font-weight: 600;
  white-space: nowrap;
  padding: 2px 9px 2px 8px;
  border-radius: 999px;
  border: 1px solid transparent;
}
.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex: none;
  background: currentColor;
}
.st-queued {
  color: var(--st-queued);
  background: var(--st-queued-bg);
}
.st-connecting {
  color: var(--st-connecting);
  background: var(--st-connecting-bg);
}
.st-connecting .dot {
  animation: pulse 1.1s var(--ease-standard) infinite;
}
.st-active {
  color: var(--st-active);
  background: var(--st-active-bg);
}
.st-active .dot {
  position: relative;
  animation: pulse 1.6s var(--ease-standard) infinite;
}
.st-paused {
  color: var(--st-paused);
  background: var(--st-paused-bg);
}
.st-completed {
  color: var(--st-completed);
  background: var(--st-completed-bg);
}
.st-error {
  color: var(--st-error);
  background: var(--st-error-bg);
}
.st-canceled {
  color: var(--st-canceled);
  background: var(--st-canceled-bg);
}
@keyframes pulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.45;
    transform: scale(0.82);
  }
}
</style>
