<script lang="ts" setup>
import { computed, ref } from 'vue';
import { useDownloadsStore } from '../../stores/downloads';
import Icon from '../Icon.vue';
import Modal from './Modal.vue';

const store = useDownloadsStore();
const emit = defineEmits<{ (e: 'close'): void }>();

const deleteFile = ref(false);
const items = computed(() => store.selectedDownloads);
const count = computed(() => items.value.length);

// Only completed downloads have a file worth deleting; others are partial.
const anyCompleted = computed(() => items.value.some((d) => d.state === 'completed'));

async function confirm() {
  await store.removeSelected(deleteFile.value);
  emit('close');
}
</script>

<template>
  <Modal :title="count > 1 ? 'Remove ' + count + ' downloads' : 'Remove download'" width="420px" @close="emit('close')">
    <div class="warn">
      <Icon name="delete" :size="18" />
      <p>
        Remove
        <template v-if="count === 1"><b>{{ items[0]?.filename }}</b></template>
        <template v-else><b>{{ count }} selected downloads</b></template>
        from the list?
      </p>
    </div>

    <label class="chk">
      <input type="checkbox" v-model="deleteFile" />
      Also delete downloaded file{{ count > 1 ? 's' : '' }} from disk
    </label>
    <div v-if="deleteFile && !anyCompleted" class="note">
      These downloads are incomplete — only the partial data will be deleted.
    </div>

    <template #footer>
      <button class="btn" @click="emit('close')">Cancel</button>
      <button class="btn danger" @click="confirm">
        {{ deleteFile ? 'Remove & delete' : 'Remove' }}
      </button>
    </template>
  </Modal>
</template>

<style scoped>
.warn {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 14px;
}
.warn :deep(svg) {
  color: var(--st-error);
  flex: none;
  margin-top: 2px;
}
.warn p {
  margin: 0;
  line-height: 1.45;
}
.chk {
  display: flex;
  align-items: center;
  gap: 8px;
}
.note {
  margin-top: 8px;
  font-size: var(--fs-sm);
  color: var(--st-paused);
  padding-left: 22px;
}
</style>
