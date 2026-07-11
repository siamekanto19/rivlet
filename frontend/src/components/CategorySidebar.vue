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
        <Icon name="folder" :size="15" />
        <span class="lbl">All Downloads</span>
        <span class="cnt">{{ store.downloads.length }}</span>
      </button>
      <button class="sb-item" :class="{ active: active === 'unfinished' }" @click="pick('unfinished')">
        <Icon name="resume" :size="13" />
        <span class="lbl">Unfinished</span>
        <span class="cnt">{{ store.unfinishedCount }}</span>
      </button>
      <button class="sb-item" :class="{ active: active === 'finished' }" @click="pick('finished')">
        <Icon name="check" :size="15" />
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
        <Icon :name="categoryIcon[c.id] ?? 'folder'" :size="15" />
        <span class="lbl">{{ c.name }}</span>
        <span class="cnt" v-if="counts[c.id]">{{ counts[c.id] }}</span>
      </button>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  width: 210px;
  flex: none;
  background: var(--bg-panel);
  border-right: 1px solid var(--border-strong);
  overflow-y: auto;
  padding: 12px 8px;
  user-select: none;
}
.sb-section {
  margin-bottom: 16px;
}
.sb-title {
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-faint);
  padding: 6px 10px;
}
.sb-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 36px;
  padding: 7px 10px;
  border: none;
  background: transparent;
  color: var(--text);
  text-align: left;
  border-radius: 6px;
}
.sb-item:hover {
  background: var(--bg-hover);
}
.sb-item.active {
  background: var(--bg-selected);
  font-weight: 600;
}
.sb-item :deep(svg) {
  color: var(--text-muted);
  flex: none;
}
.sb-item.active :deep(svg) {
  color: var(--accent);
}
.lbl {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--fs);
}
.cnt {
  font-size: var(--fs-sm);
  color: var(--text-faint);
  font-variant-numeric: tabular-nums;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 9px;
  min-width: 18px;
  text-align: center;
  padding: 0 5px;
}
.sb-item.active .cnt {
  color: var(--accent);
  border-color: var(--accent);
}
</style>
