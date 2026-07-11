<script lang="ts" setup>
import { onMounted, ref } from 'vue';
import { useDownloadsStore } from './stores/downloads';
import AppShell from './components/AppShell.vue';
import { windowControls } from './services/window';

const store = useDownloadsStore();
const theme = ref<'light' | 'dark'>('light');

function applyTheme(t: 'light' | 'dark') {
  theme.value = t;
  document.documentElement.setAttribute('data-theme', t);
  // Keep the native WebView backing surface in sync, preventing a gray edge
  // or flash around the frameless application window.
  if (t === 'dark') windowControls.setBackgroundColour(0, 0, 0);
  else windowControls.setBackgroundColour(238, 241, 245);
  try {
    localStorage.setItem('idm-theme', t);
  } catch {
    /* ignore */
  }
}

function toggleTheme() {
  applyTheme(theme.value === 'dark' ? 'light' : 'dark');
}

onMounted(() => {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem('idm-theme');
  } catch {
    /* ignore */
  }
  applyTheme(saved === 'dark' ? 'dark' : 'light');
  store.init();
});
</script>

<template>
  <AppShell v-if="store.ready" @toggle-theme="toggleTheme" />
  <div v-else class="boot">Loading…</div>
</template>

<style scoped>
.boot {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
  color: var(--text-muted);
}
</style>
