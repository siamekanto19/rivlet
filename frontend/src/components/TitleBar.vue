<script lang="ts" setup>
import WindowControls from './WindowControls.vue';
</script>

<template>
  <div class="titlebar">
    <!-- draggable spacer (the window's drag region) -->
    <div class="drag drag-fill" />
    <WindowControls />
  </div>
</template>

<style scoped>
.titlebar {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  height: 100%; /* fills the merged top bar (see AppShell .topbar) */
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
</style>
