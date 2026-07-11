<script lang="ts" setup>
import { computed, ref } from 'vue';
import { useDownloadsStore } from '../../stores/downloads';
import { detectKind } from '../../services/MockDownloadService';
import type { AddDownloadRequest } from '../../types';
import Icon from '../Icon.vue';

const store = useDownloadsStore();
const props = defineProps<{ request: AddDownloadRequest }>();

const category = ref(props.request.category ?? 'auto');
const categories = computed(() => store.settings?.categories ?? []);

const kind = computed(() => props.request.kind ?? detectKind(props.request.url));
const isVideo = computed(() => kind.value === 'video');

async function accept() {
  await store.acceptCapture({
    ...props.request,
    category: category.value === 'auto' ? undefined : category.value,
  });
}
function dismiss() {
  store.dismissCapture();
}
</script>

<template>
  <div class="capture">
    <div class="cap-head">
      <Icon :name="kind" :size="16" />
      <span class="cap-title">{{ isVideo ? 'Download this video?' : 'Download this file?' }}</span>
      <button class="cap-x" @click="dismiss" title="Dismiss"><Icon name="close" :size="14" /></button>
    </div>

    <div class="cap-body">
      <div class="cap-file" :title="request.filename ?? request.url">
        {{ request.filename ?? request.url }}
      </div>
      <div class="cap-url mono" :title="request.url">{{ request.url }}</div>

      <label class="cap-cat">
        <span>Category</span>
        <select v-model="category">
          <option value="auto">Auto-detect</option>
          <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
      </label>
    </div>

    <div class="cap-actions">
      <button class="btn" @click="dismiss">Ignore</button>
      <button class="btn primary" @click="accept">
        <Icon name="add" :size="14" /> Download
      </button>
    </div>
  </div>
</template>

<style scoped>
.capture {
  position: fixed;
  right: 18px;
  bottom: 44px;
  width: 330px;
  background: var(--bg-surface);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-dialog);
  z-index: 250;
  overflow: hidden;
  transform-origin: bottom right;
  animation: capture-in var(--dur-slow) var(--ease-decel);
}
@keyframes capture-in {
  from {
    opacity: 0;
    transform: translateY(16px) scale(0.97);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
.cap-head {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 10px 8px 10px 14px;
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--accent) 82%, #33c0ff) 0%,
    var(--accent) 100%
  );
  color: var(--text-on-accent);
}
.cap-head :deep(svg) {
  color: var(--text-on-accent);
}
.cap-title {
  flex: 1;
  font-weight: 600;
  font-size: var(--fs);
}
.cap-x {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  background: transparent;
  color: #fff;
  border-radius: var(--radius);
}
.cap-x:hover {
  background: rgba(255, 255, 255, 0.22);
}
.cap-body {
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.cap-file {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cap-url {
  font-size: var(--fs-sm);
  color: var(--text-faint);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cap-cat {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
  font-size: var(--fs-sm);
  color: var(--text-muted);
}
.cap-cat select {
  flex: 1;
}
.cap-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 8px 12px 12px;
}
.cap-actions .btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
</style>
