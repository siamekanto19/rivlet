import type {
  AddDownloadRequest,
  Download,
  DownloadKind,
  DownloadService,
  Settings,
  Unsubscribe,
  VideoInfo,
} from '../types';
import { DEFAULT_SETTINGS, makeFixtures } from './fixtures';

type ProgressCb = (updates: Download[]) => void;
type StateCb = (d: Download) => void;
type AddedCb = (d: Download) => void;
type CaptureCb = (req: AddDownloadRequest) => void;

const MB = 1024 * 1024;

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `d-mock-${idCounter}`;
}

/** Best-effort filename from a URL, for when the caller doesn't supply one. */
function filenameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split('/').filter(Boolean).pop();
    if (last && /\.[a-z0-9]{1,6}$/i.test(last)) return decodeURIComponent(last);
  } catch {
    /* ignore */
  }
  return 'download.bin';
}

/** Naive kind detection from a URL — mirrors what the real backend will do. */
export function detectKind(url: string): DownloadKind {
  const u = url.toLowerCase();
  if (u.startsWith('magnet:') || u.endsWith('.torrent')) return 'torrent';
  if (
    /(youtube\.com|youtu\.be|vimeo\.com|dailymotion\.com|twitch\.tv)/.test(u) ||
    /\/watch\?|\/embed\//.test(u)
  ) {
    return 'video';
  }
  return 'http';
}

function clone(d: Download): Download {
  return JSON.parse(JSON.stringify(d)) as Download;
}

export class MockDownloadService implements DownloadService {
  private downloads = new Map<string, Download>();
  private settings: Settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));

  private perDownloadLimit = new Map<string, number | null>();

  private progressCbs = new Set<ProgressCb>();
  private stateCbs = new Set<StateCb>();
  private addedCbs = new Set<AddedCb>();
  private captureCbs = new Set<CaptureCb>();

  private tickHandle: ReturnType<typeof setInterval> | null = null;
  private dirty = new Set<string>(); // ids changed since last progress flush

  constructor() {
    for (const d of makeFixtures()) this.downloads.set(d.id, d);
    this.startTicker();
  }

  // -- ticker ---------------------------------------------------------------

  private startTicker() {
    if (this.tickHandle) return;
    // Advance every 250ms and flush a batched progress event, matching the
    // contract's "~250ms" cadence.
    this.tickHandle = setInterval(() => this.tick(), 250);
  }

  private tick() {
    const dt = 0.25; // seconds per tick
    for (const d of this.downloads.values()) {
      if (d.state === 'connecting') {
        // brief connecting phase, then flip to active
        if (Math.random() < 0.4) this.transition(d, 'active');
        continue;
      }
      if (d.state !== 'active') continue;

      const limit = this.effectiveLimit(d.id);
      // Wander the speed a little so bars feel alive, then clamp to the limit.
      const jitter = 1 + (Math.sin(idCounter + d.downloadedBytes / MB) * 0.06);
      let speed = Math.max(0, (d.speedBps || 4 * MB) * jitter);
      if (limit != null) speed = Math.min(speed, limit);
      d.speedBps = speed;

      const advance = speed * dt;
      d.downloadedBytes += advance;

      if (d.sizeBytes != null) {
        if (d.downloadedBytes >= d.sizeBytes) {
          d.downloadedBytes = d.sizeBytes;
          d.progressPct = 100;
          d.speedBps = 0;
          d.etaSeconds = 0;
          this.distributeSegments(d);
          this.transition(d, 'completed');
          continue;
        }
        d.progressPct = (d.downloadedBytes / d.sizeBytes) * 100;
        d.etaSeconds = speed > 0 ? Math.round((d.sizeBytes - d.downloadedBytes) / speed) : null;
        this.distributeSegments(d);
      } else {
        // unknown size: no %/ETA, just keep counting bytes
        d.progressPct = 0;
        d.etaSeconds = null;
      }

      if (d.torrent) {
        d.torrent.ratio = Math.round((d.torrent.ratio + 0.001) * 1000) / 1000;
      }

      this.dirty.add(d.id);
    }

    if (this.dirty.size > 0 && this.progressCbs.size > 0) {
      const updates: Download[] = [];
      for (const id of this.dirty) {
        const d = this.downloads.get(id);
        if (d) updates.push(clone(d));
      }
      for (const cb of this.progressCbs) cb(updates);
    }
    this.dirty.clear();
  }

  private distributeSegments(d: Download) {
    if (!d.segments || d.segments.length === 0 || d.sizeBytes == null) return;
    let remaining = d.downloadedBytes;
    for (const seg of d.segments) {
      const cap = seg.to - seg.from + 1;
      seg.done = Math.max(0, Math.min(cap, remaining));
      remaining -= seg.done;
      if (remaining < 0) remaining = 0;
    }
  }

  private effectiveLimit(id: string): number | null {
    const per = this.perDownloadLimit.get(id);
    const global = this.settings.globalSpeedLimitBps;
    const limits = [per, global].filter((x): x is number => typeof x === 'number');
    return limits.length ? Math.min(...limits) : null;
  }

  private transition(d: Download, state: Download['state']) {
    d.state = state;
    if (state === 'completed') {
      d.dateCompleted = new Date().toISOString();
    }
    for (const cb of this.stateCbs) cb(clone(d));
  }

  // -- hydration ------------------------------------------------------------

  async listDownloads(): Promise<Download[]> {
    return Array.from(this.downloads.values()).map(clone);
  }

  async getSettings(): Promise<Settings> {
    return JSON.parse(JSON.stringify(this.settings));
  }

  // -- core actions ---------------------------------------------------------

  async add(req: AddDownloadRequest): Promise<Download> {
    const kind = req.kind ?? detectKind(req.url);
    const filename = req.filename?.trim() || filenameFromUrl(req.url);
    const category = req.category ?? this.categorize(filename);
    const dest = req.destinationPath ?? this.folderForCategory(category);

    const size = kind === 'torrent' ? 3.1 * 1024 * MB : (Math.floor(Math.random() * 400) + 40) * MB;

    const d: Download = {
      id: nextId(),
      url: req.url,
      filename,
      destinationPath: dest,
      category,
      kind,
      sizeBytes: size,
      downloadedBytes: 0,
      progressPct: 0,
      speedBps: 4 * MB,
      etaSeconds: null,
      supportsResume: true,
      state: 'connecting',
      dateAdded: new Date().toISOString(),
      segments: kind === 'http' ? this.freshSegments(size) : undefined,
      video:
        kind === 'video'
          ? {
              title: filename.replace(/\.[^.]+$/, ''),
              selectedFormatId: 'v-1080',
              formats: [
                { id: 'v-1080', label: '1080p (Full HD)', ext: 'mp4', sizeBytes: size, hasVideo: true, hasAudio: true },
                { id: 'v-720', label: '720p (HD)', ext: 'mp4', sizeBytes: Math.floor(size * 0.6), hasVideo: true, hasAudio: true },
                { id: 'a-audio-only', label: 'Audio only (m4a)', ext: 'm4a', sizeBytes: Math.floor(size * 0.1), hasVideo: false, hasAudio: true },
              ],
            }
          : undefined,
      torrent: kind === 'torrent' ? { peers: 12, seeders: 5, ratio: 0 } : undefined,
    };

    this.downloads.set(d.id, d);
    for (const cb of this.addedCbs) cb(clone(d));
    return clone(d);
  }

  private freshSegments(size: number): Download['segments'] {
    const n = 8;
    const span = Math.floor(size / n);
    return Array.from({ length: n }, (_, i) => ({
      index: i,
      from: i * span,
      to: i === n - 1 ? size : (i + 1) * span - 1,
      done: 0,
    }));
  }

  private categorize(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase() ?? '';
    for (const c of this.settings.categories) {
      if (c.extensions.includes(ext)) return c.id;
    }
    return 'general';
  }

  private folderForCategory(id: string): string {
    return this.settings.categories.find((c) => c.id === id)?.folder ?? this.settings.downloadDir;
  }

  async pause(id: string): Promise<void> {
    const d = this.downloads.get(id);
    if (!d) return;
    if (d.state === 'active' || d.state === 'connecting' || d.state === 'queued') {
      d.speedBps = 0;
      d.etaSeconds = null;
      this.transition(d, 'paused');
    }
  }

  async resume(id: string): Promise<void> {
    const d = this.downloads.get(id);
    if (!d) return;
    if (d.state === 'paused' || d.state === 'queued' || d.state === 'error' || d.state === 'canceled') {
      d.speedBps = 4 * MB;
      this.transition(d, 'connecting');
    }
  }

  async pauseAll(): Promise<void> {
    for (const d of this.downloads.values()) {
      if (d.state === 'active' || d.state === 'connecting' || d.state === 'queued') {
        d.speedBps = 0;
        d.etaSeconds = null;
        this.transition(d, 'paused');
      }
    }
  }

  async resumeAll(): Promise<void> {
    for (const d of this.downloads.values()) {
      if (d.state === 'paused' || d.state === 'queued') {
        d.speedBps = 4 * MB;
        this.transition(d, 'connecting');
      }
    }
  }

  async cancel(id: string): Promise<void> {
    const d = this.downloads.get(id);
    if (!d) return;
    d.speedBps = 0;
    d.etaSeconds = null;
    this.transition(d, 'canceled');
  }

  async remove(id: string, _deleteFile: boolean): Promise<void> {
    this.downloads.delete(id);
    this.perDownloadLimit.delete(id);
    this.dirty.delete(id);
  }

  async retry(id: string): Promise<void> {
    const d = this.downloads.get(id);
    if (!d) return;
    d.error = null;
    d.downloadedBytes = 0;
    d.progressPct = 0;
    d.speedBps = 4 * MB;
    if (d.segments) d.segments.forEach((s) => (s.done = 0));
    this.transition(d, 'connecting');
  }

  async reorder(orderedIds: string[]): Promise<void> {
    const next = new Map<string, Download>();
    for (const id of orderedIds) {
      const d = this.downloads.get(id);
      if (d) next.set(id, d);
    }
    // keep any not mentioned (defensive)
    for (const [id, d] of this.downloads) if (!next.has(id)) next.set(id, d);
    this.downloads = next;
  }
  async moveToQueue(ids: string[], queueId: string): Promise<void> { for (const id of ids) { const d=this.downloads.get(id);if(d)d.queueId=queueId; } }
  async setQueueRunning(queueId: string, running: boolean): Promise<void> { const q=this.settings.queues.find((x)=>x.id===queueId);if(q)q.running=running; }

  // -- limits ---------------------------------------------------------------

  async setGlobalSpeedLimit(bps: number | null): Promise<void> {
    this.settings.globalSpeedLimitBps = bps;
  }

  async setDownloadSpeedLimit(id: string, bps: number | null): Promise<void> {
    this.perDownloadLimit.set(id, bps);
  }

  // -- video grabber --------------------------------------------------------

  async probeVideo(_url: string, _browser?: 'chrome' | 'edge', _browserProfile?: string): Promise<VideoInfo> {
    return {
      title: 'Sample Video — Probed',
      selectedFormatId: 'v-1080',
      formats: [
        { id: 'v-2160', label: '2160p (4K)', ext: 'mp4', sizeBytes: 3.2 * 1024 * MB, hasVideo: true, hasAudio: true },
        { id: 'v-1440', label: '1440p (QHD)', ext: 'mp4', sizeBytes: 1.6 * 1024 * MB, hasVideo: true, hasAudio: true },
        { id: 'v-1080', label: '1080p (Full HD)', ext: 'mp4', sizeBytes: 720 * MB, hasVideo: true, hasAudio: true },
        { id: 'v-720', label: '720p (HD)', ext: 'mp4', sizeBytes: 420 * MB, hasVideo: true, hasAudio: true },
        { id: 'v-480', label: '480p', ext: 'mp4', sizeBytes: 210 * MB, hasVideo: true, hasAudio: true },
        { id: 'a-audio-only', label: 'Audio only (m4a)', ext: 'm4a', sizeBytes: 62 * MB, hasVideo: false, hasAudio: true },
      ],
    };
  }

  async selectVideoFormat(id: string, formatId: string): Promise<void> {
    const d = this.downloads.get(id);
    if (!d?.video) return;
    d.video.selectedFormatId = formatId;
    const fmt = d.video.formats.find((f) => f.id === formatId);
    if (fmt?.sizeBytes != null) {
      d.sizeBytes = fmt.sizeBytes;
      d.progressPct = d.sizeBytes ? (d.downloadedBytes / d.sizeBytes) * 100 : 0;
    }
  }

  // -- torrent --------------------------------------------------------------

  async addTorrent(magnetOrFilePath: string): Promise<Download> {
    return this.add({ url: magnetOrFilePath, kind: 'torrent' });
  }

  async addTorrentFile(): Promise<Download> {
    // No file picker in the browser mock — simulate a chosen .torrent.
    return this.add({
      url: 'C:\\Users\\you\\Downloads\\example.torrent',
      filename: 'ubuntu-24.04-desktop-amd64.iso',
      kind: 'torrent',
    });
  }

  // -- shell helpers (no-ops in mock, logged for visibility) ----------------

  async openFile(id: string): Promise<void> {
    console.info('[mock] openFile', this.downloads.get(id)?.filename);
  }

  async openFolder(id: string): Promise<void> {
    console.info('[mock] openFolder', this.downloads.get(id)?.destinationPath);
  }

  async copyUrl(id: string): Promise<void> {
    const url = this.downloads.get(id)?.url;
    if (url && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        /* clipboard may be blocked in dev; ignore */
      }
    }
  }

  // -- settings -------------------------------------------------------------

  async updateSettings(settings: Settings): Promise<void> {
    this.settings = JSON.parse(JSON.stringify(settings));
  }
  async resetSettings(): Promise<Settings> { this.settings=JSON.parse(JSON.stringify(DEFAULT_SETTINGS));return this.getSettings(); }

  // -- events ---------------------------------------------------------------

  onProgress(cb: ProgressCb): Unsubscribe {
    this.progressCbs.add(cb);
    return () => this.progressCbs.delete(cb);
  }

  onStateChange(cb: StateCb): Unsubscribe {
    this.stateCbs.add(cb);
    return () => this.stateCbs.delete(cb);
  }

  onAdded(cb: AddedCb): Unsubscribe {
    this.addedCbs.add(cb);
    return () => this.addedCbs.delete(cb);
  }
  onRemoved(_cb: (id: string) => void): Unsubscribe { return () => {}; }
  onCompletionRequested(_cb: (d: Download) => void): Unsubscribe { return () => {}; }

  onCapturePrompt(cb: CaptureCb): Unsubscribe {
    this.captureCbs.add(cb);
    return () => this.captureCbs.delete(cb);
  }

  // -- dev-only trigger to exercise the capture flow ------------------------

  /** Not part of the contract — a dev hook to fire a capture prompt. */
  triggerCapture(req?: AddDownloadRequest): void {
    const sample: AddDownloadRequest = req ?? {
      url: 'https://videos.example.com/watch?v=NewClip42',
      filename: 'Captured Clip — 2026.mp4',
      kind: 'video',
    };
    for (const cb of this.captureCbs) cb(sample);
  }
}

// A single shared instance for the app. Swapping in WailsDownloadService later
// means changing only this line.
export const downloadService: DownloadService & { triggerCapture?: (r?: AddDownloadRequest) => void } =
  new MockDownloadService();
