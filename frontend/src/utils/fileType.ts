import type { Download } from '../types';

/**
 * Coarse file-type classification for iconography. A download manager knows
 * what it's fetching — the list should read that way at a glance.
 */
export type FileType =
  | 'archive'
  | 'audio'
  | 'video'
  | 'image'
  | 'app'
  | 'torrent'
  | 'file';

const EXT_MAP: Record<string, FileType> = {
  // archives / images of disks
  zip: 'archive', rar: 'archive', '7z': 'archive', tar: 'archive',
  gz: 'archive', bz2: 'archive', xz: 'archive', iso: 'archive',
  // audio
  mp3: 'audio', m4a: 'audio', flac: 'audio', wav: 'audio', ogg: 'audio',
  aac: 'audio', opus: 'audio',
  // video
  mp4: 'video', mkv: 'video', webm: 'video', mov: 'video', avi: 'video',
  ts: 'video', m3u8: 'video',
  // images
  jpg: 'image', jpeg: 'image', png: 'image', gif: 'image', webp: 'image',
  svg: 'image', bmp: 'image', avif: 'image',
  // installers / executables
  exe: 'app', msi: 'app', msix: 'app', apk: 'app', dmg: 'app', appimage: 'app',
};

export function fileTypeOf(d: Download): FileType {
  if (d.kind === 'torrent') return 'torrent';
  if (d.kind === 'video') return 'video';
  const m = /\.([a-z0-9]+)$/i.exec(d.filename ?? '');
  return (m && EXT_MAP[m[1].toLowerCase()]) || 'file';
}

/** Semantic icon name (see Icon.vue) for a download's file type. */
export function fileIconOf(d: Download): string {
  const t = fileTypeOf(d);
  return t === 'file' ? 'file' : `type-${t}`;
}
