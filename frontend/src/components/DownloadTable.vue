<script lang="ts" setup>
import { computed, ref } from 'vue';
import { useDownloadsStore, type SortKey } from '../stores/downloads';
import type { Download } from '../types';
import { formatBytes, formatDate, formatEta, formatSpeed } from '../utils/format';
import Icon from './Icon.vue';
import ProgressBar from './ProgressBar.vue';
import StatusBadge from './StatusBadge.vue';

const store = useDownloadsStore();

const emit = defineEmits<{
  (e: 'contextmenu', payload: { id: string; x: number; y: number }): void;
  (e: 'open', id: string): void;
}>();

interface Col {
  key: SortKey;
  label: string;
  width: string;
  align?: 'right' | 'left';
  class?: string;
}

const columns: Col[] = [
  { key: 'filename', label: 'Name', width: 'minmax(220px, 3fr)' },
  { key: 'sizeBytes', label: 'Size', width: '92px', align: 'right' },
  { key: 'state', label: 'Status', width: '120px' },
  { key: 'progressPct', label: 'Progress', width: 'minmax(120px, 1.4fr)' },
  { key: 'speedBps', label: 'Speed', width: '92px', align: 'right' },
  { key: 'etaSeconds', label: 'Time left', width: '84px', align: 'right' },
  { key: 'dateAdded', label: 'Date added', width: '128px' },
];

const gridTemplate = computed(() => columns.map((c) => c.width).join(' '));

const rows = computed(() => store.visibleDownloads);
const selected = computed(() => new Set(store.selectedIds));

function rowSize(d: Download): string {
  return d.sizeBytes == null ? '—' : formatBytes(d.sizeBytes);
}

function kindIcon(d: Download): string {
  return d.kind === 'video' ? 'video' : d.kind === 'torrent' ? 'torrent' : 'http';
}

function onRowMouseDown(e: MouseEvent, d: Download) {
  if (e.button === 2) {
    // right click: select if not already in selection, then menu handled on contextmenu
    if (!selected.value.has(d.id)) store.selectSingle(d.id);
    return;
  }
  if (e.shiftKey) store.selectRange(d.id);
  else if (e.ctrlKey || e.metaKey) store.toggleSelect(d.id);
  else store.selectSingle(d.id);
}

function onRowContextMenu(e: MouseEvent, d: Download) {
  e.preventDefault();
  if (!selected.value.has(d.id)) store.selectSingle(d.id);
  emit('contextmenu', { id: d.id, x: e.clientX, y: e.clientY });
}

function onRowDblClick(d: Download) {
  emit('open', d.id);
}

function sortIndicator(key: SortKey): string {
  if (store.manualOrder || store.sortKey !== key) return '';
  return store.sortDir === 'asc' ? '▲' : '▼';
}

function speedCell(d: Download): string {
  return d.state === 'active' ? formatSpeed(d.speedBps) : '—';
}
function etaCell(d: Download): string {
  return d.state === 'active' ? formatEta(d.etaSeconds) : '—';
}

// -- drag-to-reorder --------------------------------------------------------
const dragId = ref<string | null>(null);
const overId = ref<string | null>(null);
const overAfter = ref(false);

function onDragStart(e: DragEvent, d: Download) {
  dragId.value = d.id;
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', d.id);
  }
}
function onDragOver(e: DragEvent, d: Download) {
  if (!dragId.value || dragId.value === d.id) return;
  e.preventDefault();
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  overId.value = d.id;
  overAfter.value = e.clientY - rect.top > rect.height / 2;
}
function onDrop(e: DragEvent, d: Download) {
  e.preventDefault();
  const from = dragId.value;
  if (!from || from === d.id) return clearDrag();
  const ids = rows.value.map((r) => r.id).filter((id) => id !== from);
  let idx = ids.indexOf(d.id);
  if (overAfter.value) idx += 1;
  ids.splice(idx, 0, from);
  store.reorderRows(ids);
  clearDrag();
}
function clearDrag() {
  dragId.value = null;
  overId.value = null;
}
</script>

<template>
  <div class="table" role="grid">
    <!-- header -->
    <div class="thead" :style="{ gridTemplateColumns: gridTemplate }">
      <div
        v-for="c in columns"
        :key="c.key"
        class="th"
        :class="{ right: c.align === 'right', sorted: store.sortKey === c.key }"
        @click="store.setSort(c.key)"
      >
        <span class="th-label">{{ c.label }}</span>
        <span class="th-sort">{{ sortIndicator(c.key) }}</span>
      </div>
    </div>

    <!-- body -->
    <div class="tbody" @mousedown.self="store.clearSelection()">
      <div
        v-for="d in rows"
        :key="d.id"
        class="tr"
        :class="[
          's-' + d.state,
          {
            selected: selected.has(d.id),
            dragging: dragId === d.id,
            'drop-before': overId === d.id && !overAfter,
            'drop-after': overId === d.id && overAfter,
          },
        ]"
        :style="{ gridTemplateColumns: gridTemplate }"
        draggable="true"
        @mousedown="onRowMouseDown($event, d)"
        @contextmenu="onRowContextMenu($event, d)"
        @dblclick="onRowDblClick(d)"
        @dragstart="onDragStart($event, d)"
        @dragover="onDragOver($event, d)"
        @drop="onDrop($event, d)"
        @dragend="clearDrag"
      >
        <!-- name -->
        <div class="td name" :title="d.filename">
          <Icon :name="kindIcon(d)" :size="14" class="kind-icon" />
          <span class="fname">{{ d.filename }}</span>
        </div>
        <!-- size -->
        <div class="td right tnum">{{ rowSize(d) }}</div>
        <!-- status -->
        <div class="td">
          <StatusBadge :state="d.state" />
        </div>
        <!-- progress -->
        <div class="td progress-cell">
          <ProgressBar :download="d" />
        </div>
        <!-- speed -->
        <div class="td right tnum">{{ speedCell(d) }}</div>
        <!-- eta -->
        <div class="td right tnum">{{ etaCell(d) }}</div>
        <!-- date -->
        <div class="td tnum date">{{ formatDate(d.dateAdded) }}</div>
      </div>

      <!-- empty state -->
      <div v-if="rows.length === 0" class="empty">
        <Icon name="add" :size="26" />
        <p>No downloads here.</p>
        <span>Add a URL to get started.</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.table {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-surface);
  overflow: hidden;
}

/* header */
.thead {
  display: grid;
  align-items: stretch;
  background: var(--bg-header);
  border-bottom: 1px solid var(--border-strong);
  position: sticky;
  top: 0;
  z-index: 2;
  user-select: none;
}
.th {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 11px;
  height: 36px;
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--text-muted);
  border-right: 1px solid var(--border);
  white-space: nowrap;
  overflow: hidden;
}
.th:last-child {
  border-right: none;
}
.th:hover {
  background: var(--bg-hover);
  color: var(--text);
}
.th.right {
  justify-content: flex-end;
}
.th.sorted {
  color: var(--accent);
}
.th-sort {
  font-size: 8px;
}

/* body */
.tbody {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
}
.tr {
  display: grid;
  align-items: center;
  height: var(--row-h);
  border-bottom: 1px solid var(--border-subtle);
  cursor: default;
}
.tr:nth-child(even) {
  background: var(--bg-stripe);
}
.tr:hover {
  background: var(--bg-hover);
}
.tr.selected {
  background: var(--bg-selected);
  box-shadow: inset 3px 0 0 var(--accent);
}
.tr.dragging {
  opacity: 0.45;
}
.tr.drop-before {
  box-shadow: inset 0 2px 0 var(--accent);
}
.tr.drop-after {
  box-shadow: inset 0 -2px 0 var(--accent);
}
.td {
  padding: 0 11px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: var(--fs);
  border-right: 1px solid transparent;
}
.td.right {
  text-align: right;
  color: var(--text-muted);
}
.td.date {
  color: var(--text-muted);
  font-size: var(--fs-sm);
}
.name {
  display: flex;
  align-items: center;
  gap: 9px;
}
.kind-icon {
  flex: none;
  color: var(--text-faint);
}
.tr.s-active .kind-icon,
.tr.s-connecting .kind-icon {
  color: var(--accent);
}
.tr.s-error .kind-icon {
  color: var(--st-error);
}
.fname {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tr.s-completed .fname {
  color: var(--text);
}
.tr.s-canceled .fname,
.tr.s-paused .fname {
  color: var(--text-muted);
}
.progress-cell {
  overflow: visible;
}

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 220px;
  color: var(--text-faint);
}
.empty p {
  margin: 6px 0 0;
  font-size: 14px;
  color: var(--text-muted);
}
.empty span {
  font-size: var(--fs-sm);
}
</style>
