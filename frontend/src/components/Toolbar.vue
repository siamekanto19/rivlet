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
    <div class="group">
      <button class="tbtn accent" @click="emit('add')" title="Add a new download (Ctrl+N)">
        <Icon name="add" :size="18" />
        <span>Add URL</span>
      </button>
    </div>

    <div class="sep" />

    <div class="group">
      <button class="tbtn" :disabled="!canResume" @click="store.resumeSelected()" title="Resume selected">
        <Icon name="resume" :size="18" />
        <span>Resume</span>
      </button>
      <button class="tbtn" :disabled="!canPause" @click="store.pauseSelected()" title="Pause selected">
        <Icon name="pause" :size="18" />
        <span>Pause</span>
      </button>
    </div>

    <div class="sep" />

    <div class="group">
      <button class="tbtn" @click="store.resumeAll()" title="Resume all downloads">
        <Icon name="resume-all" :size="18" />
        <span>Resume All</span>
      </button>
      <button class="tbtn" @click="store.pauseAll()" title="Pause all downloads">
        <Icon name="pause-all" :size="18" />
        <span>Pause All</span>
      </button>
    </div>

    <div class="sep" />

    <div class="group">
      <button class="tbtn danger" :disabled="!hasSel" @click="emit('delete')" title="Remove selected">
        <Icon name="delete" :size="18" />
        <span>Delete</span>
      </button>
    </div>

    <div class="spacer" />

    <div class="group">
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
  padding: 0 12px;
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
.sep {
  width: 1px;
  height: 34px;
  background: var(--border);
  margin: 0 9px;
}
.spacer {
  flex: 1;
}
.tbtn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-width: 58px;
  height: 50px;
  padding: 4px 10px;
  border: 1px solid transparent;
  border-radius: var(--radius);
  background: transparent;
  color: var(--text);
}
.tbtn span {
  font-size: 11px;
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
  color: var(--accent);
}
.tbtn.accent:hover:not(:disabled) {
  background: var(--accent-soft);
  border-color: var(--accent);
}
.tbtn.danger:hover:not(:disabled) {
  color: var(--st-error);
  background: color-mix(in srgb, var(--st-error) 12%, transparent);
  border-color: var(--st-error);
}
.tbtn.ghost {
  min-width: 40px;
  color: var(--text-muted);
}
.tbtn.dev {
  color: var(--text-muted);
}
</style>
