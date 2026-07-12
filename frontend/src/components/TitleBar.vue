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
  // give the window a beat to settle, then re-read state
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
  // keep the maximise/restore glyph in sync if the user drags/snaps the window
  if (windowControls.isWails()) poll = setInterval(refresh, 800);
});
onBeforeUnmount(() => {
  if (poll) clearInterval(poll);
});
</script>

<template>
  <div class="titlebar">
    <!-- draggable spacer -->
    <div class="drag drag-fill" />

    <!-- window controls -->
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
  </div>
</template>

<style scoped>
.titlebar {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  height: var(--titlebar-h);
  background: transparent; /* let the Mica backdrop read through */
  flex: none;
  user-select: none;
}
.drag {
  --wails-draggable: drag;
}
.drag-fill {
  flex: 1;
}

/* brand mark */
.brand {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 0 14px 0 13px;
}
.brand-name {
  font-family: var(--font-display);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.01em;
  color: var(--text);
}

.controls {
  display: flex;
  align-items: stretch;
  --wails-draggable: no-drag;
}
.wc {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 100%;
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
