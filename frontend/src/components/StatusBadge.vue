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
  gap: 5px;
  font-size: var(--fs-sm);
  white-space: nowrap;
}
.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex: none;
  background: var(--text-faint);
}
.st-queued {
  color: var(--st-queued);
}
.st-queued .dot {
  background: var(--st-queued);
}
.st-connecting {
  color: var(--st-connecting);
}
.st-connecting .dot {
  background: var(--st-connecting);
  animation: blink 1s steps(2, start) infinite;
}
.st-active {
  color: var(--st-active);
}
.st-active .dot {
  background: var(--st-active);
}
.st-paused {
  color: var(--st-paused);
}
.st-paused .dot {
  background: var(--st-paused);
}
.st-completed {
  color: var(--st-completed);
}
.st-completed .dot {
  background: var(--st-completed);
}
.st-error {
  color: var(--st-error);
  font-weight: 600;
}
.st-error .dot {
  background: var(--st-error);
}
.st-canceled {
  color: var(--st-canceled);
}
.st-canceled .dot {
  background: var(--st-canceled);
}
@keyframes blink {
  50% {
    opacity: 0.3;
  }
}
</style>
