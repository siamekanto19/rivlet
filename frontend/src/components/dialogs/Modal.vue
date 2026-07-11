<script lang="ts" setup>
import { onBeforeUnmount, onMounted } from 'vue';
import Icon from '../Icon.vue';

defineProps<{ title: string; width?: string }>();
const emit = defineEmits<{ (e: 'close'): void }>();

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close');
}
onMounted(() => document.addEventListener('keydown', onKey));
onBeforeUnmount(() => document.removeEventListener('keydown', onKey));
</script>

<template>
  <div class="overlay" @mousedown.self="emit('close')">
    <div class="dialog" :style="{ width: width ?? '460px' }" role="dialog">
      <div class="titlebar">
        <span class="title">{{ title }}</span>
        <button class="x" @click="emit('close')" title="Close">
          <Icon name="close" :size="16" />
        </button>
      </div>
      <div class="body">
        <slot />
      </div>
      <div class="footer" v-if="$slots.footer">
        <slot name="footer" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 22, 33, 0.42);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 8vh;
  z-index: 300;
}
.dialog {
  background: var(--bg-surface);
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  box-shadow: var(--shadow-dialog);
  max-width: 92vw;
  max-height: 84vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.titlebar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 44px;
  padding: 0 10px 0 18px;
  background: var(--bg-toolbar);
  border-bottom: 1px solid var(--border);
  flex: none;
}
.title {
  font-weight: 600;
  font-size: 13px;
}
.x {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  border-radius: var(--radius);
}
.x:hover {
  background: var(--st-error);
  color: #fff;
}
.body {
  padding: 18px 20px;
  overflow-y: auto;
}
.footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 20px;
  border-top: 1px solid var(--border);
  background: var(--bg-panel);
  flex: none;
}
</style>
