<script lang="ts" setup>
import { computed } from 'vue';
import type { Download } from '../types';

const props = defineProps<{ download: Download }>();

const d = computed(() => props.download);

// Indeterminate when the size isn't known yet (HEAD not done) but bytes flow.
const indeterminate = computed(
  () => d.value.sizeBytes == null && (d.value.state === 'active' || d.value.state === 'connecting'),
);

// Segment fill fractions for the segmented bar.
const segs = computed(() => {
  const list = d.value.segments;
  if (!list || !list.length) return [];
  return list.map((s) => {
    const cap = s.to - s.from + 1;
    return cap > 0 ? Math.max(0, Math.min(1, s.done / cap)) : 0;
  });
});

const pct = computed(() => Math.max(0, Math.min(100, d.value.progressPct)));

const stateClass = computed(() => `s-${d.value.state}`);
const stageLabel=computed(()=>{if(d.value.kind!=='video')return '';switch(d.value.processingStage){case'merging':return'Merging';case'processing':return'Processing';case'verifying':return'Verifying';default:return''}});
</script>

<template>
  <div class="pbar" :class="stateClass" :title="stageLabel || (indeterminate ? 'Downloading (size unknown)' : pct.toFixed(0) + '%')">
    <!-- segmented view when segments exist and download is in flight -->
    <template v-if="segs.length && !indeterminate">
      <div class="seg-track">
        <div v-for="(f, i) in segs" :key="i" class="seg">
          <div class="seg-fill" :style="{ width: (f * 100).toFixed(1) + '%' }" />
        </div>
      </div>
    </template>

    <!-- indeterminate stripe -->
    <template v-else-if="indeterminate">
      <div class="indet"><div class="indet-bar" /></div>
    </template>

    <!-- plain single bar -->
    <template v-else>
      <div class="bar-track">
        <div class="bar-fill" :style="{ width: pct.toFixed(1) + '%' }" />
      </div>
    </template>

    <span class="pct tnum" :class="{stage:stageLabel}">{{ stageLabel || (indeterminate ? '' : Math.floor(pct) + '%') }}</span>
  </div>
</template>

<style scoped>
.pbar {
  position: relative;
  height: 18px;
  width: 100%;
  display: flex;
  align-items: center;
  gap: 9px;
}
.bar-track,
.seg-track,
.indet {
  position: relative;
  height: 6px;
  flex: 1;
  min-width: 0;
  background: var(--progress-track);
  border-radius: 999px;
  overflow: hidden;
}
.bar-fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(
    90deg,
    var(--progress-fill-2),
    var(--progress-fill)
  );
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.35);
  transition: width 0.25s var(--ease-decel);
}
.seg-track {
  display: flex;
  gap: 2px;
  background: transparent;
}
.seg {
  flex: 1 1 0;
  height: 100%;
  background: var(--progress-track);
  border-radius: 999px;
  position: relative;
  overflow: hidden;
}
.seg-fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(
    90deg,
    var(--progress-fill-2),
    var(--progress-fill)
  );
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.35);
  transition: width 0.25s var(--ease-decel);
}

/* completed */
.s-completed .bar-fill,
.s-completed .seg-fill {
  background: linear-gradient(
    90deg,
    var(--progress-done-2),
    var(--progress-done)
  );
}
/* paused / queued / canceled — muted */
.s-paused .bar-fill,
.s-paused .seg-fill,
.s-queued .bar-fill,
.s-queued .seg-fill {
  background: var(--st-paused);
  opacity: 0.7;
}
.s-canceled .bar-fill,
.s-canceled .seg-fill {
  background: var(--st-canceled);
  opacity: 0.55;
}
/* error */
.s-error .bar-fill,
.s-error .seg-fill {
  background: var(--progress-error);
}

.pct {
  flex: none;
  min-width: 30px;
  text-align: right;
  font-size: var(--fs-xs);
  font-weight: 600;
  color: var(--text-muted);
  pointer-events: none;
  font-variant-numeric: tabular-nums;
}
.pct.stage{min-width:62px;color:var(--accent-text)}
.s-completed .pct {
  color: var(--st-completed);
}
.s-error .pct {
  color: var(--st-error);
}

/* indeterminate animation — the one animation the PRD allows (progress) */
.indet {
  background: var(--progress-track);
}
.indet-bar {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  width: 33%;
  background: linear-gradient(90deg, transparent, var(--progress-fill), transparent);
  animation: indet 1.1s linear infinite;
}
@keyframes indet {
  0% {
    left: -33%;
  }
  100% {
    left: 100%;
  }
}
</style>
