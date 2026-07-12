<script lang="ts" setup>
import { computed } from 'vue';
import { useDownloadsStore } from '../stores/downloads';
import Icon from './Icon.vue';

const store = useDownloadsStore();

const emit = defineEmits<{
  (e: 'add'): void;
  (e: 'settings'): void;
  (e: 'delete'): void;
}>();

const hasSel = computed(() => store.hasSelection);
const canPause = computed(() => store.canPause);
const canResume = computed(() => store.canResume);
</script>

<template>
  <div class="toolbar">
    <div class="group primary-group">
      <button class="tbtn accent" @click="emit('add')" title="Add a new download (Ctrl+N)">
        <Icon name="add" :size="18" />
        <span>Add URL</span>
      </button>
    </div>

    <div class="group command-group" aria-label="Selected download actions">
      <button class="tbtn" :disabled="!canResume" @click="store.resumeSelected()" title="Resume selected">
        <Icon name="resume" :size="18" />
        <span>Resume</span>
      </button>
      <button class="tbtn" :disabled="!canPause" @click="store.pauseSelected()" title="Pause selected">
        <Icon name="pause" :size="18" />
        <span>Pause</span>
      </button>
      <button class="tbtn danger" :disabled="!hasSel" @click="emit('delete')" title="Remove selected">
        <Icon name="delete" :size="18" />
        <span>Delete</span>
      </button>
    </div>

    <div class="group command-group" aria-label="Queue actions">
      <button class="tbtn" @click="store.resumeAll()" title="Resume all downloads">
        <Icon name="resume-all" :size="18" />
        <span>Start all</span>
      </button>
      <button class="tbtn" @click="store.pauseAll()" title="Pause all downloads">
        <Icon name="pause-all" :size="18" />
        <span>Pause all</span>
      </button>
    </div>

    <div class="spacer" />

    <div class="group utility-group">
      <button class="tbtn" @click="emit('settings')" title="Settings">
        <Icon name="settings" :size="18" />
        <span>Settings</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  height: var(--toolbar-h);
  padding: 0 14px;
  /* Transparent so it reads as the same Mica backdrop as the sub-bar and
     sidebar — no distinct command-bar tint. */
  background: transparent;
  gap: 6px;
  flex: none;
}
.group {
  display: flex;
  align-items: stretch;
  gap: 3px;
}
.spacer {
  flex: 1;
}
.tbtn {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-width: 42px;
  height: 36px;
  padding: 0 13px;
  border: 1px solid transparent;
  border-radius: var(--radius);
  background: transparent;
  color: var(--text);
  transition: background-color var(--dur-fast) var(--ease-standard),
    border-color var(--dur-fast) var(--ease-standard),
    color var(--dur-fast) var(--ease-standard),
    transform var(--dur-fast) var(--ease-standard),
    box-shadow var(--dur-fast) var(--ease-standard);
}
.tbtn :deep(svg) {
  transition: color var(--dur-fast) var(--ease-standard);
}
.command-group {
  gap: 2px;
  padding: 3px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--bg-surface);
  box-shadow: var(--shadow-card);
}
.command-group .tbtn {
  height: 32px;
  padding: 0 11px;
  border-radius: var(--radius-sm);
}
.utility-group {
  gap: 3px;
}
.tbtn span {
  font-size: 12.5px;
  line-height: 1;
  font-weight: 500;
}
.tbtn:hover:not(:disabled) {
  background: var(--bg-hover-strong);
}
.tbtn:active:not(:disabled) {
  background: var(--bg-active);
  transform: scale(0.97);
}
.tbtn:disabled {
  color: var(--text-disabled);
}
.tbtn:disabled :deep(svg) {
  opacity: 0.5;
}

/* primary accent button — Fluent fill with inner top highlight */
.primary-group {
  margin-right: 3px;
}
.tbtn.accent {
  color: var(--text-on-accent);
  padding: 0 16px;
  height: 36px;
  /* Native WinUI accent button: flat fill, hairline top highlight. */
  background: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 88%, #000);
  border-top-color: color-mix(in srgb, var(--accent) 82%, #fff);
  box-shadow: var(--shadow-control);
}
.tbtn.accent span {
  font-weight: 600;
}
.tbtn.accent:hover:not(:disabled) {
  background: var(--accent-hover);
  border-color: color-mix(in srgb, var(--accent-hover) 88%, #000);
  border-top-color: color-mix(in srgb, var(--accent-hover) 82%, #fff);
}
.tbtn.accent:active:not(:disabled) {
  background: var(--accent-pressed);
  color: color-mix(in srgb, var(--text-on-accent) 80%, transparent);
  transform: scale(0.97);
}
.tbtn.danger:hover:not(:disabled) {
  color: var(--st-error);
  background: var(--st-error-bg);
}
@media (max-width:760px){.toolbar{padding:0 8px}.command-group .tbtn span,.utility-group .tbtn span{display:none}.command-group .tbtn,.utility-group .tbtn{width:34px;padding:0;justify-content:center}.group{padding-right:4px;margin-right:2px}}
</style>
