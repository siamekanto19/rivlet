<script lang="ts" setup>
import { computed, ref } from 'vue';
import { useDownloadsStore, type SortKey } from '../stores/downloads';
import type { Download } from '../types';
import { formatBytes, formatDate, formatEta, formatSpeed } from '../utils/format';
import { fileIconOf, fileTypeOf } from '../utils/fileType';
import Icon from './Icon.vue';
import ProgressBar from './ProgressBar.vue';
import StatusBadge from './StatusBadge.vue';

const store = useDownloadsStore();

const emit = defineEmits<{
  (e: 'contextmenu', payload: { id: string; x: number; y: number }): void;
  (e: 'open', id: string): void;
  (e: 'delete'): void;
  (e: 'add'): void;
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

/** "1.2 GB of 5.9 GB (49%)" — byte-level detail without spending a column. */
function progressTitle(d: Download): string {
  if (d.state === 'completed') return formatBytes(d.sizeBytes ?? d.downloadedBytes);
  if (d.sizeBytes == null) return `${formatBytes(d.downloadedBytes)} so far (size unknown)`;
  return `${formatBytes(d.downloadedBytes)} of ${formatBytes(d.sizeBytes)} (${Math.floor(d.progressPct)}%)`;
}

// -- inline quick actions (contextual per state) ----------------------------
interface RowAction {
  key: string;
  icon: string;
  title: string;
  size?: number;
  danger?: boolean;
}

function rowActions(d: Download): RowAction[] {
  switch (d.state) {
    case 'active':
    case 'connecting':
    case 'queued':
      return [
        { key: 'pause', icon: 'pause', title: 'Pause' },
        { key: 'cancel', icon: 'stop', title: 'Cancel', size: 13, danger: true },
      ];
    case 'paused':
      return [
        { key: 'resume', icon: 'resume', title: 'Resume' },
        { key: 'cancel', icon: 'stop', title: 'Cancel', size: 13, danger: true },
      ];
    case 'error':
    case 'canceled':
      return [
        { key: 'retry', icon: 'retry', title: 'Retry' },
        { key: 'delete', icon: 'delete', title: 'Remove…', danger: true },
      ];
    case 'completed':
      return [
        { key: 'folder', icon: 'folder', title: 'Open containing folder' },
        { key: 'delete', icon: 'delete', title: 'Remove…', danger: true },
      ];
    default:
      return [];
  }
}

function runAction(e: MouseEvent, d: Download, key: string) {
  e.stopPropagation();
  switch (key) {
    case 'pause':
      store.pause(d.id);
      break;
    case 'resume':
      store.resume(d.id);
      break;
    case 'cancel':
      store.cancel(d.id);
      break;
    case 'retry':
      store.retry(d.id);
      break;
    case 'folder':
      store.openFolder(d.id);
      break;
    case 'delete':
      store.selectSingle(d.id);
      emit('delete');
      break;
  }
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
          <Icon :name="fileIconOf(d)" :size="15" class="kind-icon" :class="'ft-' + fileTypeOf(d)" />
          <span class="fname">{{ d.filename }}</span>
        </div>
        <!-- size -->
        <div class="td right tnum">{{ rowSize(d) }}</div>
        <!-- status -->
        <div class="td">
          <StatusBadge :state="d.state" />
        </div>
        <!-- progress -->
        <div class="td progress-cell" :title="progressTitle(d)">
          <ProgressBar :download="d" />
        </div>
        <!-- speed -->
        <div class="td right tnum">{{ speedCell(d) }}</div>
        <!-- eta -->
        <div class="td right tnum">{{ etaCell(d) }}</div>
        <!-- date -->
        <div class="td tnum date">{{ formatDate(d.dateAdded) }}</div>

        <!-- quick actions — appear on hover, act without selecting first -->
        <div class="row-actions" @mousedown.stop @dblclick.stop @contextmenu.stop>
          <button
            v-for="a in rowActions(d)"
            :key="a.key"
            class="ra"
            :class="{ danger: a.danger }"
            :title="a.title"
            @click="runAction($event, d, a.key)"
          >
            <Icon :name="a.icon" :size="a.size ?? 14" />
          </button>
        </div>
      </div>

      <!-- empty state — contextual -->
      <div v-if="rows.length === 0" class="empty">
        <template v-if="store.searchQuery">
          <Icon name="search" :size="24" />
          <p>No results for “{{ store.searchQuery }}”</p>
          <span>Check the spelling, or clear the search.</span>
        </template>
        <template v-else>
          <Icon name="download" :size="24" />
          <p>Nothing here yet</p>
          <span>Add a URL to start downloading.</span>
          <button class="btn empty-add" @click="emit('add')">Add download</button>
        </template>
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
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  z-index: 2;
  user-select: none;
}
.th {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 0 12px;
  height: 38px;
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  transition: background-color var(--dur-fast) var(--ease-standard),
    color var(--dur-fast) var(--ease-standard);
}
.th:hover {
  background: var(--bg-hover);
  color: var(--text);
}
.th.right {
  justify-content: flex-end;
}
.th.sorted {
  color: var(--accent-text);
}
.th-sort {
  font-size: 8px;
  color: var(--accent-text);
}

/* body */
.tbody {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 2px 0;
}
.tr {
  display: grid;
  align-items: center;
  height: var(--row-h);
  cursor: default;
  position: relative;
  border-radius: var(--radius-sm);
  transition: background-color var(--dur-fast) var(--ease-standard);
}
.tr::after {
  /* hairline row separator that doesn't fight the rounded hover fill */
  content: '';
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: 0;
  height: 1px;
  background: var(--border-subtle);
  pointer-events: none;
}
.tr:hover {
  background: var(--bg-hover);
}
.tr.selected {
  background: var(--bg-selected);
}
.tr.selected:hover {
  background: var(--bg-selected-hover);
}
.tr.selected::after {
  opacity: 0;
}
/* Win11 list selection indicator — rounded accent bar */
.tr.selected::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 18px;
  border-radius: 3px;
  background: var(--accent);
}
.tr.dragging {
  opacity: 0.4;
}
.tr.drop-before {
  box-shadow: inset 0 2px 0 var(--accent);
}
.tr.drop-after {
  box-shadow: inset 0 -2px 0 var(--accent);
}
.td {
  padding: 0 12px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: var(--fs);
}
.td.right {
  text-align: right;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}
.td.date {
  color: var(--text-faint);
  font-size: var(--fs-sm);
}
.name {
  display: flex;
  align-items: center;
  gap: 10px;
}
.kind-icon {
  flex: none;
  color: var(--text-faint);
}
/* muted per-type tints — the list reads at a glance without turning rainbow */
.kind-icon.ft-archive {
  color: var(--ft-archive);
}
.kind-icon.ft-audio {
  color: var(--ft-audio);
}
.kind-icon.ft-video {
  color: var(--ft-video);
}
.kind-icon.ft-image {
  color: var(--ft-image);
}
.kind-icon.ft-app {
  color: var(--ft-app);
}
.kind-icon.ft-torrent {
  color: var(--ft-torrent);
}
.tr.s-error .kind-icon {
  color: var(--st-error);
}
.tr.s-canceled .kind-icon {
  color: var(--text-faint);
}
.fname {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}
.tr.s-completed .fname {
  color: var(--text);
  font-weight: 400;
}
.tr.s-canceled .fname,
.tr.s-paused .fname {
  color: var(--text-muted);
  font-weight: 400;
}
.progress-cell {
  overflow: visible;
}

/* inline quick actions — floating mini-toolbar at the row's right edge */
.row-actions {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  display: none;
  align-items: center;
  gap: 1px;
  padding: 2px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-card);
  z-index: 1;
}
.tr:hover .row-actions {
  display: flex;
}
.ra {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 24px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-muted);
  transition: background-color var(--dur-fast) var(--ease-standard),
    color var(--dur-fast) var(--ease-standard);
}
.ra:hover {
  background: var(--bg-hover-strong);
  color: var(--text);
}
.ra.danger:hover {
  background: var(--st-error-bg);
  color: var(--st-error);
}

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 100%;
  min-height: 260px;
  color: var(--text-faint);
}
.empty :deep(svg) {
  opacity: 0.5;
  margin-bottom: 4px;
}
.empty p {
  margin: 6px 0 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-muted);
}
.empty span {
  font-size: var(--fs-sm);
}
.empty-add {
  margin-top: 12px;
}
</style>
