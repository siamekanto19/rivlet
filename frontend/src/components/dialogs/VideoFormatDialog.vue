<script lang="ts" setup>
import { computed, ref } from 'vue';
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
const selectedFormat=computed(()=>props.info.formats.find((f)=>f.id===selected.value));
function preset(kind:'quality'|'compatibility'|'smallest'){let choice=props.info.formats[0];if(kind==='compatibility')choice=props.info.formats.find((f)=>f.compatibility==='Best')??choice;if(kind==='smallest')choice=props.info.formats.filter((f)=>f.sizeBytes!=null).sort((a,b)=>(a.sizeBytes??Infinity)-(b.sizeBytes??Infinity))[0]??choice;if(choice)selected.value=choice.id}
function codec(value?:string){if(!value||value==='none')return '—';return value.split('.')[0].toUpperCase()}

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
  <Modal title="Choose video format" width="720px" @close="emit('close')">
    <div class="vtitle" :title="info.title">
      <Icon name="video" :size="16" />
      <span>{{ info.title ?? 'Video' }}</span>
    </div>
    <div class="presets" aria-label="Format presets"><button @click="preset('quality')">Best quality</button><button @click="preset('compatibility')">Best compatibility</button><button @click="preset('smallest')">Smallest file</button></div>

    <div class="flist">
      <label
        v-for="f in info.formats"
        :key="f.id"
        class="fitem"
        :class="{ sel: selected === f.id }"
      >
        <input type="radio" name="vfmt" :value="f.id" v-model="selected" />
        <span class="fmt-main"><span class="fmt-label">{{ f.height ? `${f.height}p${f.fps ? ` · ${Math.round(f.fps)} FPS` : ''}` : f.label }}</span><small>{{codec(f.videoCodec)}} video · {{codec(f.audioCodec)}} audio<span v-if="f.audioBitrateKbps"> · {{Math.round(f.audioBitrateKbps)}} kbps</span></small></span>
        <span class="fmt-ext mono">.{{ f.ext }}</span>
        <span class="fmt-badges">
          <span v-for="b in badges(f)" :key="b.text" class="bdg" :class="b.cls">{{ b.text }}</span>
          <span v-if="f.hdr" class="bdg h">HDR</span><span v-if="f.recommended" class="bdg r">Recommended</span><span class="bdg c">{{f.compatibility||'Good'}} compatibility</span>
        </span>
        <span class="fmt-size tnum">{{ formatBytes(f.sizeBytes) }}</span>
      </label>
    </div>
    <div v-if="selectedFormat" class="selection-summary"><span>Final container <b>{{selectedFormat.ext.toUpperCase()}}</b></span><span>Estimated size <b>{{formatBytes(selectedFormat.sizeBytes)}}</b></span><span>{{selectedFormat.hasAudio?'Audio included':'Audio will be merged when available'}}</span></div>

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
.presets{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:10px}.presets button{padding:7px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg-control);color:var(--text-muted)}.presets button:hover{background:var(--bg-hover);color:var(--text)}
.fitem {
  display: grid;
  grid-template-columns: 18px minmax(120px,1fr) auto minmax(110px,auto) 82px;
  align-items: center;
  gap: 10px;
  padding: 8px 11px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-surface);
  transition: background-color var(--dur-fast) var(--ease-standard),
    border-color var(--dur-fast) var(--ease-standard);
}
.fitem:hover {
  background: var(--bg-hover-strong);
}
.fitem.sel {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.fmt-label {
  font-weight: 600;
}
.fmt-main{display:flex;min-width:0;flex-direction:column;gap:2px}.fmt-main small{overflow:hidden;color:var(--text-faint);font-size:10px;text-overflow:ellipsis;white-space:nowrap}
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
.bdg.h{color:var(--accent-text);border-color:var(--accent)}.bdg.r{color:var(--st-active);border-color:var(--st-active)}.bdg.c{border-style:dashed}.selection-summary{display:flex;flex-wrap:wrap;gap:8px 18px;margin-top:10px;padding:10px 12px;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg-subtle);color:var(--text-muted);font-size:var(--fs-xs)}.selection-summary b{color:var(--text)}
.fmt-size {
  text-align: right;
  color: var(--text-muted);
}
</style>
