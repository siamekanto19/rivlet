<script lang="ts" setup>
import { ref } from 'vue';
import type { VideoInfo } from '../../types';
import { formatBytes } from '../../utils/format';
import Icon from '../Icon.vue';
import Modal from './Modal.vue';

const props = defineProps<{ info: VideoInfo; confirmLabel?: string }>();
const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'select', formatId: string): void;
}>();

const selected = ref(props.info.selectedFormatId ?? props.info.formats[0]?.id ?? '');

function badges(f: VideoInfo['formats'][number]): { text: string; cls: string }[] {
  const out: { text: string; cls: string }[] = [];
  if (f.hasVideo) out.push({ text: 'Video', cls: 'v' });
  if (f.hasAudio) out.push({ text: 'Audio', cls: 'a' });
  if (f.hasVideo && !f.hasAudio) out.push({ text: 'No sound', cls: 'w' });
  if (!f.hasVideo && f.hasAudio) out.push({ text: 'Audio only', cls: 'w' });
  return out;
}

function confirm() {
  if (selected.value) emit('select', selected.value);
}
</script>

<template>
  <Modal title="Choose video format" width="540px" @close="emit('close')">
    <div class="vtitle" :title="info.title">
      <Icon name="video" :size="16" />
      <span>{{ info.title ?? 'Video' }}</span>
    </div>

    <div class="flist">
      <label
        v-for="f in info.formats"
        :key="f.id"
        class="fitem"
        :class="{ sel: selected === f.id }"
      >
        <input type="radio" name="vfmt" :value="f.id" v-model="selected" />
        <span class="fmt-label">{{ f.label }}</span>
        <span class="fmt-ext mono">.{{ f.ext }}</span>
        <span class="fmt-badges">
          <span v-for="b in badges(f)" :key="b.text" class="bdg" :class="b.cls">{{ b.text }}</span>
        </span>
        <span class="fmt-size tnum">{{ formatBytes(f.sizeBytes) }}</span>
      </label>
    </div>

    <template #footer>
      <button class="btn" @click="emit('close')">Cancel</button>
      <button class="btn primary" :disabled="!selected" @click="confirm">
        {{ confirmLabel ?? 'Download' }}
      </button>
    </template>
  </Modal>
</template>

<style scoped>
.vtitle {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border);
}
.vtitle :deep(svg) {
  color: var(--accent);
  flex: none;
}
.vtitle span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.flist {
  display: flex;
  flex-direction: column;
  gap: 3px;
  max-height: 46vh;
  overflow-y: auto;
}
.fitem {
  display: grid;
  grid-template-columns: 18px 1fr auto auto 90px;
  align-items: center;
  gap: 10px;
  padding: 7px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-surface);
}
.fitem:hover {
  background: var(--bg-hover);
}
.fitem.sel {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.fmt-label {
  font-weight: 600;
}
.fmt-ext {
  color: var(--text-faint);
  font-size: var(--fs-sm);
}
.fmt-badges {
  display: flex;
  gap: 4px;
}
.bdg {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 8px;
  border: 1px solid var(--border-strong);
  color: var(--text-muted);
}
.bdg.v {
  color: var(--accent);
  border-color: var(--accent);
}
.bdg.a {
  color: var(--st-active);
  border-color: var(--st-active);
}
.bdg.w {
  color: var(--st-paused);
  border-color: var(--st-paused);
}
.fmt-size {
  text-align: right;
  color: var(--text-muted);
}
</style>
