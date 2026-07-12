<script lang="ts" setup>
// Thin wrapper over Hugeicons. Keeps the app's semantic icon names
// (`<Icon name="add" />`) so call sites never touch the underlying library.
import { computed } from 'vue';
import { HugeiconsIcon } from '@hugeicons/vue';
import {
  PlusSignIcon,
  PlayIcon,
  PlayCircleIcon,
  PauseIcon,
  PauseCircleIcon,
  StopIcon,
  Delete02Icon,
  Settings01Icon,
  Folder01Icon,
  File01Icon,
  Link01Icon,
  Copy01Icon,
  ArrowReloadHorizontalIcon,
  InformationCircleIcon,
  Search01Icon,
  Video01Icon,
  MagnetIcon,
  GlobeIcon,
  ArrowDown01Icon,
  ArrowRight01Icon,
  Cancel01Icon,
  Tick02Icon,
  Moon02Icon,
  Sun03Icon,
  Clock01Icon,
  DashboardSpeed02Icon,
  ClipboardIcon,
  DragDropVerticalIcon,
  Download04Icon,
  FileZipIcon,
  FileMusicIcon,
  FileVideoIcon,
  FileImageIcon,
  FileCogIcon,
  ComputerIcon,
  PaintBoardIcon,
  ArrowLeft02Icon,
  Notification03Icon,
} from '@hugeicons/core-free-icons';

type IconData = readonly (readonly [string, Record<string, string | number>])[];

const props = defineProps<{ name: string; size?: number; strokeWidth?: number }>();

const map: Record<string, IconData> = {
  add: PlusSignIcon,
  resume: PlayIcon,
  'resume-all': PlayCircleIcon,
  pause: PauseIcon,
  'pause-all': PauseCircleIcon,
  stop: StopIcon,
  delete: Delete02Icon,
  settings: Settings01Icon,
  folder: Folder01Icon,
  file: File01Icon,
  link: Link01Icon,
  copy: Copy01Icon,
  retry: ArrowReloadHorizontalIcon,
  info: InformationCircleIcon,
  search: Search01Icon,
  video: Video01Icon,
  torrent: MagnetIcon,
  http: GlobeIcon,
  download: Download04Icon,
  chevron: ArrowDown01Icon,
  'chevron-right': ArrowRight01Icon,
  back: ArrowLeft02Icon,
  monitor: ComputerIcon,
  appearance: PaintBoardIcon,
  notification: Notification03Icon,
  close: Cancel01Icon,
  cross: Cancel01Icon,
  check: Tick02Icon,
  moon: Moon02Icon,
  sun: Sun03Icon,
  scheduler: Clock01Icon,
  gauge: DashboardSpeed02Icon,
  clipboard: ClipboardIcon,
  drag: DragDropVerticalIcon,
  // file-type icons (see utils/fileType.ts)
  'type-archive': FileZipIcon,
  'type-audio': FileMusicIcon,
  'type-video': FileVideoIcon,
  'type-image': FileImageIcon,
  'type-app': FileCogIcon,
  'type-document': File01Icon,
  'type-torrent': MagnetIcon,
};

const icon = computed<IconData>(() => map[props.name] ?? PlusSignIcon);
const px = computed(() => props.size ?? 16);
// Slightly lighter default stroke reads cleaner at small sizes.
const stroke = computed(() => props.strokeWidth ?? 1.8);
</script>

<template>
  <HugeiconsIcon :icon="icon" :size="px" :stroke-width="stroke" />
</template>
