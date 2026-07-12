<script lang="ts" setup>
import { onMounted, watch } from 'vue';
import { useDownloadsStore } from './stores/downloads';
import { useUiStore } from './stores/ui';
import AppShell from './components/AppShell.vue';
import MiniPlayer from './components/MiniPlayer.vue';
import CaptureWindow from './components/CaptureWindow.vue';
import { windowControls } from './services/window';
import { integration } from './services/integration';

const store = useDownloadsStore();
const ui = useUiStore();

function onMiniClose() {
  // Sending the mini-player away keeps downloads running in the tray.
  windowControls.hide();
}

// A browser grab opens the small capture popup rather than the whole app.
watch(
  () => store.capturePrompt,
  (req) => {
    if (!req) return;
    store.dismissCapture();
    ui.enterCapture(req);
  },
);

onMounted(async () => {
  ui.initTheme();
  ui.initAccent();
  await store.init();
  // Backend-persisted state makes first-launch onboarding reliable across
  // WebView cache resets, upgrades, and installer launches.
  if (await integration.needsOnboarding()) setTimeout(() => ui.openBrowserConnect(), 500);
});
</script>

<template>
  <template v-if="store.ready">
    <MiniPlayer v-if="ui.mode === 'mini'" @expand="ui.exitMini()" @close="onMiniClose" />
    <CaptureWindow v-else-if="ui.mode === 'capture'" />
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
