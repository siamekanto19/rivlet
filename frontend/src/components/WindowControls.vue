<script lang="ts" setup>
import { onMounted, onBeforeUnmount, ref } from 'vue';
import { windowControls } from '../services/window';
import { useDownloadsStore } from '../stores/downloads';
import { useUiStore } from '../stores/ui';

const store = useDownloadsStore();
const ui = useUiStore();

const maximised = ref(false);
let poll: ReturnType<typeof setInterval> | null = null;

async function refresh() {
  maximised.value = await windowControls.isMaximised();
}
function minimise() {
  windowControls.minimise();
}
function toggleMaximise() {
  windowControls.toggleMaximise();
  setTimeout(refresh, 60);
}
function close() {
  // With downloads in flight, closing shrinks to the floating mini-player so
  // progress stays visible; otherwise it tucks away into the system tray.
  if (store.activeCount > 0) ui.enterMini();
  else windowControls.hide();
}

onMounted(() => {
  refresh();
  if (windowControls.isWails()) poll = setInterval(refresh, 800);
});
onBeforeUnmount(() => {
  if (poll) clearInterval(poll);
});
</script>

<template>
  <div class="controls">
    <button class="wc" @click="minimise" title="Minimize" aria-label="Minimize">
      <svg width="11" height="11" viewBox="0 0 11 11"><rect x="1.5" y="5" width="8" height="1" fill="currentColor" /></svg>
    </button>
    <button class="wc" @click="toggleMaximise" :title="maximised ? 'Restore' : 'Maximize'" :aria-label="maximised ? 'Restore window' : 'Maximize window'">
      <svg v-if="!maximised" width="11" height="11" viewBox="0 0 11 11">
        <rect x="1.5" y="1.5" width="8" height="8" fill="none" stroke="currentColor" stroke-width="1" />
      </svg>
      <svg v-else width="11" height="11" viewBox="0 0 11 11">
        <rect x="1.5" y="3" width="6" height="6" fill="none" stroke="currentColor" stroke-width="1" />
        <path d="M3.5 3V1.5H9.5V7.5H8" fill="none" stroke="currentColor" stroke-width="1" />
      </svg>
    </button>
    <button class="wc close" @click="close" title="Close" aria-label="Close">
      <svg width="11" height="11" viewBox="0 0 11 11">
        <path d="M1.5 1.5L9.5 9.5M9.5 1.5L1.5 9.5" stroke="currentColor" stroke-width="1.1" />
      </svg>
    </button>
  </div>
</template>

<style scoped>
.controls {
  display: flex;
  align-items: center;
  align-self: center; /* centre in the (taller) bar — don't stretch full height */
  flex: none;
  /* Keep clear of the window's right edge; Windows 11 rounds the frameless
     window corner, which would otherwise clip a button flush to the edge. */
  padding-right: 8px;
  --wails-draggable: no-drag;
}
.wc {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 40px; /* fixed, proportionate hover target (not the full bar height) */
  border-radius: var(--radius-sm);
  border: none;
  background: transparent;
  color: var(--text-muted);
  transition: background-color var(--dur-fast) var(--ease-standard),
    color var(--dur-fast) var(--ease-standard);
}
.wc:hover {
  background: var(--bg-hover-strong);
  color: var(--text);
}
.wc:active {
  background: var(--bg-hover);
}
.wc.close:hover {
  background: #c42b1c;
  color: #fff;
}
.wc.close:active {
  background: #b02717;
  color: #fff;
}
</style>
