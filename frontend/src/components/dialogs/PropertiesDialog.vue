<script lang="ts" setup>
import { computed, ref } from 'vue';
import { useDownloadsStore } from '../../stores/downloads';
import type { Download } from '../../types';
import { formatBytes, formatDate, formatSpeed, parseSpeedToBps } from '../../utils/format';
import Icon from '../Icon.vue';
import StatusBadge from '../StatusBadge.vue';
import Modal from './Modal.vue';

const store = useDownloadsStore();
const props = defineProps<{ id: string }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const d = computed<Download | undefined>(() => store.byId.get(props.id));

const limitOn = ref(false);
const limitValue = ref('');

function segPct(seg: { from: number; to: number; done: number }): number {
  const cap = seg.to - seg.from + 1;
  return cap > 0 ? Math.max(0, Math.min(100, (seg.done / cap) * 100)) : 0;
}

function applyLimit() {
  if (!d.value) return;
  const bps = limitOn.value ? parseSpeedToBps(limitValue.value, 'KB') : null;
  store.setDownloadSpeedLimit(d.value.id, bps);
}

const selectedFormat = computed(() => {
  if (!d.value?.video) return null;
  return d.value.video.formats.find((f) => f.id === d.value?.video?.selectedFormatId) ?? null;
});
</script>

<template>
  <Modal v-if="d" :title="'Properties — ' + d.filename" width="560px" @close="emit('close')">
    <div class="head">
      <Icon :name="d.kind === 'video' ? 'video' : d.kind === 'torrent' ? 'torrent' : 'http'" :size="20" />
      <div class="head-txt">
        <div class="fn" :title="d.filename">{{ d.filename }}</div>
        <StatusBadge :state="d.state" />
      </div>
    </div>

    <div v-if="d.error" class="err-box">
      <Icon name="info" :size="14" /> {{ d.error }}
    </div>

    <table class="props">
      <tbody>
        <tr>
          <th>URL</th>
          <td class="brk mono">{{ d.url }}</td>
        </tr>
        <tr>
          <th>Save to</th>
          <td class="brk">{{ d.destinationPath }}</td>
        </tr>
        <tr>
          <th>Category</th>
          <td>{{ d.category }}</td>
        </tr>
        <tr>
          <th>Size</th>
          <td class="tnum">{{ d.sizeBytes == null ? 'Unknown' : formatBytes(d.sizeBytes) }}</td>
        </tr>
        <tr>
          <th>Downloaded</th>
          <td class="tnum">
            {{ formatBytes(d.downloadedBytes) }}
            <span v-if="d.sizeBytes != null" class="muted">({{ Math.floor(d.progressPct) }}%)</span>
          </td>
        </tr>
        <tr v-if="d.state === 'active'">
          <th>Speed</th>
          <td class="tnum">{{ formatSpeed(d.speedBps) }}</td>
        </tr>
        <tr>
          <th>Resume</th>
          <td>
            <span :class="d.supportsResume ? 'ok' : 'warn'">
              {{ d.supportsResume ? 'Supported (server accepts ranges)' : 'Not supported — restart on resume' }}
            </span>
          </td>
        </tr>
        <tr>
          <th>Added</th>
          <td class="tnum">{{ formatDate(d.dateAdded) }}</td>
        </tr>
        <tr v-if="d.dateCompleted">
          <th>Completed</th>
          <td class="tnum">{{ formatDate(d.dateCompleted) }}</td>
        </tr>
      </tbody>
    </table>

    <!-- torrent-specific -->
    <div v-if="d.torrent" class="block">
      <div class="block-title">Torrent</div>
      <div class="tor-grid">
        <div><span class="muted">Peers</span><b class="tnum">{{ d.torrent.peers }}</b></div>
        <div><span class="muted">Seeders</span><b class="tnum">{{ d.torrent.seeders }}</b></div>
        <div><span class="muted">Ratio</span><b class="tnum">{{ d.torrent.ratio.toFixed(2) }}</b></div>
      </div>
    </div>

    <!-- video-specific -->
    <div v-if="d.video" class="block">
      <div class="block-title">Video format</div>
      <div class="muted">
        Selected:
        <b>{{ selectedFormat?.label ?? '—' }}</b>
        <span v-if="selectedFormat"> · {{ formatBytes(selectedFormat.sizeBytes) }} · .{{ selectedFormat.ext }}</span>
      </div>
    </div>

    <!-- segments -->
    <div v-if="d.segments && d.segments.length" class="block">
      <div class="block-title">Segments ({{ d.segments.length }})</div>
      <div class="segs">
        <div v-for="s in d.segments" :key="s.index" class="segrow">
          <span class="seg-idx tnum">#{{ s.index + 1 }}</span>
          <div class="seg-bar">
            <div class="seg-bar-fill" :style="{ width: segPct(s).toFixed(1) + '%' }" />
          </div>
          <span class="seg-num tnum">{{ formatBytes(s.done) }} / {{ formatBytes(s.to - s.from + 1) }}</span>
        </div>
      </div>
    </div>

    <!-- per-download speed limit -->
    <div class="block">
      <div class="block-title">Speed limit (this download)</div>
      <div class="limit-row">
        <label class="chk">
          <input type="checkbox" v-model="limitOn" @change="applyLimit" />
          Limit to
        </label>
        <input
          type="number"
          min="1"
          v-model="limitValue"
          :disabled="!limitOn"
          class="limit-input"
          @input="applyLimit"
        />
        <span class="muted">KB/s</span>
      </div>
    </div>

    <template #footer>
      <button class="btn" @click="emit('close')">Close</button>
    </template>
  </Modal>
</template>

<style scoped>
.head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 10px;
}
.head :deep(svg) {
  color: var(--accent);
  flex: none;
}
.head-txt {
  min-width: 0;
}
.fn {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-bottom: 3px;
}
.err-box {
  display: flex;
  align-items: center;
  gap: 6px;
  background: color-mix(in srgb, var(--st-error) 12%, transparent);
  border: 1px solid var(--st-error);
  color: var(--st-error);
  border-radius: var(--radius);
  padding: 6px 10px;
  font-size: var(--fs-sm);
  margin-bottom: 12px;
}
.props {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--fs);
}
.props th {
  text-align: left;
  vertical-align: top;
  width: 96px;
  color: var(--text-muted);
  font-weight: 500;
  padding: 3px 8px 3px 0;
  white-space: nowrap;
}
.props td {
  padding: 3px 0;
}
.brk {
  word-break: break-all;
}
.muted {
  color: var(--text-faint);
}
.ok {
  color: var(--st-active);
}
.warn {
  color: var(--st-paused);
}
.block {
  margin-top: 14px;
  padding-top: 10px;
  border-top: 1px solid var(--border);
}
.block-title {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--text-faint);
  margin-bottom: 7px;
}
.tor-grid {
  display: flex;
  gap: 28px;
}
.tor-grid div {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.tor-grid b {
  font-size: 15px;
}
.segs {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.segrow {
  display: grid;
  grid-template-columns: 34px 1fr 150px;
  align-items: center;
  gap: 8px;
}
.seg-idx {
  color: var(--text-faint);
  font-size: var(--fs-sm);
}
.seg-bar {
  height: 9px;
  background: var(--progress-track);
  border: 1px solid var(--border);
  border-radius: 2px;
  overflow: hidden;
}
.seg-bar-fill {
  height: 100%;
  background: var(--progress-fill);
}
.seg-num {
  text-align: right;
  color: var(--text-muted);
  font-size: var(--fs-sm);
}
.limit-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.chk {
  display: flex;
  align-items: center;
  gap: 6px;
}
.limit-input {
  width: 90px;
}
</style>
