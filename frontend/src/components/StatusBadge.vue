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
/* Quiet, typographic status — a colored dot and tinted text. No pill fills;
   this is a data column in a utility, not a dashboard chip. */
.badge {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: var(--fs-sm);
  font-weight: 500;
  white-space: nowrap;
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
}
.st-connecting {
  color: var(--st-connecting);
}
.st-connecting .dot {
  animation: pulse 1.1s var(--ease-standard) infinite;
}
.st-active {
  color: var(--st-active);
  font-weight: 600;
}
.st-paused {
  color: var(--st-paused);
}
.st-completed {
  color: var(--st-completed);
}
.st-error {
  color: var(--st-error);
  font-weight: 600;
}
.st-canceled {
  color: var(--st-canceled);
}
@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.35;
  }
}
</style>
