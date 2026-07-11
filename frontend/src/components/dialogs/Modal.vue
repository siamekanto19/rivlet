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
  background: rgba(0, 0, 0, 0.42);
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 9vh;
  z-index: 300;
  animation: overlay-in var(--dur-slow) var(--ease-standard);
}
@keyframes overlay-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
.dialog {
  background: var(--bg-surface);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-dialog);
  max-width: 92vw;
  max-height: 84vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: dialog-in var(--dur-slow) var(--ease-decel);
}
@keyframes dialog-in {
  from {
    opacity: 0;
    transform: translateY(14px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
.titlebar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 52px;
  padding: 0 12px 0 20px;
  background: transparent;
  flex: none;
}
.title {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 15px;
  letter-spacing: -0.01em;
}
.x {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  border-radius: var(--radius-sm);
  transition: background-color var(--dur-fast) var(--ease-standard),
    color var(--dur-fast) var(--ease-standard);
}
.x:hover {
  background: var(--bg-hover-strong);
  color: var(--text);
}
.x:active {
  background: var(--bg-active);
}
.body {
  padding: 6px 20px 20px;
  overflow-y: auto;
}
.footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 20px;
  border-top: 1px solid var(--border);
  background: var(--bg-subtle);
  flex: none;
}
</style>
