<script lang="ts" setup>
import { onMounted, onBeforeUnmount, ref } from 'vue';
import { windowControls } from '../services/window';

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
  windowControls.quit();
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
    <!-- draggable region (Wails reads --wails-draggable) -->
    <div class="drag" />

    <!-- window controls -->
    <div class="controls">
      <button class="wc" @click="minimise" title="Minimize" aria-label="Minimize">
        <svg width="11" height="11" viewBox="0 0 11 11"><rect x="1.5" y="5" width="8" height="1" fill="currentColor" /></svg>
      </button>
      <button class="wc" @click="toggleMaximise" :title="maximised ? 'Restore' : 'Maximize'" aria-label="Maximize">
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
  background: var(--bg-toolbar);
  border-bottom: 1px solid var(--border-strong);
  flex: none;
  user-select: none;
}
.drag {
  flex: 1;
  --wails-draggable: drag;
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
}
.wc:hover {
  background: var(--bg-hover);
  color: var(--text);
}
.wc.close:hover {
  background: #e11d2e;
  color: #fff;
}
</style>
