<script lang="ts" setup>
import { onMounted } from 'vue';
import { useDownloadsStore } from './stores/downloads';
import { useUiStore } from './stores/ui';
import AppShell from './components/AppShell.vue';
import MiniPlayer from './components/MiniPlayer.vue';
import { windowControls } from './services/window';

const store = useDownloadsStore();
const ui = useUiStore();

function onMiniClose() {
  // Sending the mini-player away keeps downloads running in the tray.
  windowControls.hide();
}

onMounted(() => {
  ui.initTheme();
  ui.initAccent();
  store.init();
});
</script>

<template>
  <template v-if="store.ready">
    <MiniPlayer v-if="ui.mode === 'mini'" @expand="ui.exitMini()" @close="onMiniClose" />
    <AppShell v-else />
  </template>
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
