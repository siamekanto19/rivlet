<script lang="ts" setup>
import { computed } from 'vue';
import { useDownloadsStore } from '../stores/downloads';
import Icon from './Icon.vue';

const store = useDownloadsStore();

const emit = defineEmits<{
  (e: 'add'): void;
  (e: 'settings'): void;
  (e: 'delete'): void;
  (e: 'capture'): void;
  (e: 'toggle-theme'): void;
}>();

const hasSel = computed(() => store.hasSelection);
const canPause = computed(() => store.canPause);
const canResume = computed(() => store.canResume);
const isDark = computed(() => document.documentElement.getAttribute('data-theme') === 'dark');
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
      <button class="tbtn ghost dev" @click="emit('capture')" title="Simulate a browser capture (dev)">
        <Icon name="link" :size="18" />
        <span>Capture</span>
      </button>
      <button class="tbtn ghost" @click="emit('toggle-theme')" :title="isDark ? 'Switch to light theme' : 'Switch to dark theme'">
        <Icon :name="isDark ? 'sun' : 'moon'" :size="18" />
      </button>
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
  padding: 8px 12px;
  background: var(--bg-toolbar);
  border-bottom: 1px solid var(--border-strong);
  gap: 4px;
  flex: none;
}
.group {
  display: flex;
  align-items: stretch;
  gap: 4px;
}
.spacer {
  flex: 1;
}
.tbtn {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-width: 42px;
  height: 36px;
  padding: 0 12px;
  border: 1px solid transparent;
  border-radius: var(--radius);
  background: transparent;
  color: var(--text);
}
.command-group {
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: color-mix(in srgb, var(--bg-surface) 72%, transparent);
}
.command-group .tbtn {
  height: 32px;
  padding: 0 10px;
  border-radius: 7px;
}
.utility-group {
  gap: 2px;
}
.tbtn span {
  font-size: 12px;
  line-height: 1;
}
.tbtn:hover:not(:disabled) {
  background: var(--bg-hover);
  border-color: var(--border);
}
.tbtn:active:not(:disabled) {
  background: var(--bg-selected);
}
.tbtn:disabled {
  color: var(--text-faint);
  opacity: 0.55;
}
.tbtn.accent {
  color: var(--text-inverse);
  background: var(--accent);
  border-color: var(--accent);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
}
.tbtn.accent:hover:not(:disabled) {
  background: var(--accent-hover);
  border-color: var(--accent-hover);
}
.tbtn.danger:hover:not(:disabled) {
  color: var(--st-error);
  background: color-mix(in srgb, var(--st-error) 12%, transparent);
  border-color: var(--st-error);
}
.tbtn.ghost {
  min-width: 36px;
  padding: 0 9px;
  color: var(--text-muted);
}
.tbtn.dev {
  color: var(--text-muted);
}
</style>
