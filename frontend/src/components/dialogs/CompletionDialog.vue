<script lang="ts" setup>
import type { Download } from '../../types';
import { useDownloadsStore } from '../../stores/downloads';
import Modal from './Modal.vue';
import Icon from '../Icon.vue';
const props=defineProps<{download:Download}>();const store=useDownloadsStore();
async function open(){await store.openFile(props.download.id);store.dismissCompletion()}
async function folder(){await store.openFolder(props.download.id);store.dismissCompletion()}
</script>
<template><Modal title="Download complete" width="440px" @close="store.dismissCompletion()"><div class="complete"><Icon name="check" :size="28"/><div><strong>{{download.filename}}</strong><p>Saved to {{download.destinationPath}}</p></div></div><template #footer><button class="btn" @click="folder">Open folder</button><button class="btn primary" @click="open">Open file</button></template></Modal></template>
<style scoped>.complete{display:flex;align-items:flex-start;gap:14px}.complete :deep(svg){color:var(--st-complete)}strong{display:block;overflow-wrap:anywhere}p{margin:5px 0 0;color:var(--text-muted);font-size:var(--fs-sm);overflow-wrap:anywhere}</style>
