<script lang="ts" setup>
import { computed } from 'vue';
import { useDownloadsStore } from '../stores/downloads';
import Icon from './Icon.vue';

const store = useDownloadsStore();

const active = computed(() => store.activeCategory);
const categories = computed(() => store.settings?.categories ?? []);
const counts = computed(() => store.categoryCounts);

const categoryIcon: Record<string, string> = {
  video: 'video',
  music: 'file',
  documents: 'file',
  compressed: 'file',
  programs: 'file',
  general: 'folder',
};

function pick(cat: string) {
  store.setCategory(cat);
}
</script>

<template>
  <aside class="sidebar">
    <div class="sb-section">
      <div class="sb-title">Status</div>
      <button class="sb-item" :class="{ active: active === 'all' }" @click="pick('all')">
        <span class="pill" />
        <Icon name="folder" :size="16" />
        <span class="lbl">All Downloads</span>
        <span class="cnt">{{ store.downloads.length }}</span>
      </button>
      <button class="sb-item" :class="{ active: active === 'unfinished' }" @click="pick('unfinished')">
        <span class="pill" />
        <Icon name="resume" :size="14" />
        <span class="lbl">Unfinished</span>
        <span class="cnt">{{ store.unfinishedCount }}</span>
      </button>
      <button class="sb-item" :class="{ active: active === 'finished' }" @click="pick('finished')">
        <span class="pill" />
        <Icon name="check" :size="16" />
        <span class="lbl">Finished</span>
        <span class="cnt">{{ store.finishedCount }}</span>
      </button>
    </div>

    <div class="sb-section">
      <div class="sb-title">Categories</div>
      <button
        v-for="c in categories"
        :key="c.id"
        class="sb-item"
        :class="{ active: active === c.id }"
        @click="pick(c.id)"
        :title="c.folder"
      >
        <span class="pill" />
        <Icon :name="categoryIcon[c.id] ?? 'folder'" :size="16" />
        <span class="lbl">{{ c.name }}</span>
        <span class="cnt" v-if="counts[c.id]">{{ counts[c.id] }}</span>
      </button>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  width: 214px;
  flex: none;
  background: transparent; /* NavigationView floats on the Mica backdrop */
  overflow-y: auto;
  overflow-x: hidden;
  padding: 4px 6px 12px;
  user-select: none;
}
.sb-section {
  margin-bottom: 14px;
}
.sb-title {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-faint);
  padding: 8px 12px 4px;
}
.sb-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 11px;
  width: 100%;
  min-height: 36px;
  padding: 7px 12px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--text);
  text-align: left;
  border-radius: var(--radius);
  transition: background-color var(--dur-fast) var(--ease-standard),
    transform var(--dur-fast) var(--ease-standard);
}
.sb-item:hover {
  background: var(--bg-hover-strong);
}
.sb-item:active {
  background: var(--bg-active);
  transform: scale(0.99);
}
.sb-item.active {
  background: var(--bg-selected);
  font-weight: 600;
}
.sb-item.active:hover {
  background: var(--bg-selected-hover);
}
/* the iconic Win11 NavigationView selection indicator */
.pill {
  position: absolute;
  left: 0;
  top: 50%;
  width: 3px;
  height: 0;
  border-radius: 3px;
  background: var(--accent);
  transform: translateY(-50%);
  transition: height var(--dur-slow) var(--ease-decel);
}
.sb-item.active .pill {
  height: 16px;
}
.sb-item :deep(svg) {
  color: var(--text-muted);
  flex: none;
  transition: color var(--dur-fast) var(--ease-standard);
}
.sb-item.active :deep(svg) {
  color: var(--accent-text);
}
.lbl {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--fs);
}
.cnt {
  font-size: var(--fs-xs);
  font-weight: 600;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 999px;
  min-width: 20px;
  text-align: center;
  padding: 1px 6px;
}
.sb-item.active .cnt {
  color: var(--accent-text);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  border-color: var(--accent-soft-border);
}
</style>
