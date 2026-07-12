// ============================================================================
// The contract. Everything the UI does goes through DownloadService.
// Implemented here by MockDownloadService; later the backend supplies
// WailsDownloadService with the identical signature. Treat as frozen.
// ============================================================================

export type DownloadState =
  | 'queued'
  | 'connecting'
  | 'active'
  | 'paused'
  | 'completed'
  | 'error'
  | 'canceled';

export type DownloadKind = 'http' | 'video' | 'torrent';

export interface SegmentProgress {
  index: number;
  from: number;
  to: number;
  done: number;
}

export interface VideoFormat {
  id: string;
  label: string;
  ext: string;
  sizeBytes: number | null;
  hasVideo: boolean;
  hasAudio: boolean;
}

export interface VideoInfo {
  title?: string;
  formats: VideoFormat[];
  selectedFormatId?: string;
}

export interface TorrentInfo {
  peers: number;
  seeders: number;
  ratio: number;
}

export interface Download {
  id: string;
  url: string;
  filename: string;
  destinationPath: string;
  category: string;
  kind: DownloadKind;

  sizeBytes: number | null; // null until known (HEAD not yet done)
  downloadedBytes: number;
  progressPct: number; // 0–100
  speedBps: number;
  etaSeconds: number | null;
  supportsResume: boolean; // server range support; drives UI affordances

  state: DownloadState;
  error?: string | null;

  dateAdded: string; // ISO
  dateCompleted?: string | null;

  segments?: SegmentProgress[]; // for the segmented-progress bar
  video?: VideoInfo; // present when kind === 'video'
  torrent?: TorrentInfo; // present when kind === 'torrent'
  referrer?: string;
  requestUserAgent?: string;
  videoFormatId?: string;
  browserProfile?: string;
}

export interface Category {
  id: string;
  name: string;
  folder: string;
  extensions: string[];
}

export interface Settings {
  downloadDir: string;
  maxConcurrent: number;
  globalSpeedLimitBps: number | null;
  categories: Category[];
  clipboardMonitoring: boolean;
  notifyOnComplete: boolean;
  shutdownOnComplete: boolean;
  schedule: { enabled: boolean; startHHmm: string; stopHHmm: string } | null;
  segmentCount: number;
  retryCount: number;
  retryDelaySeconds: number;
  requestTimeoutSeconds: number;
  userAgent: string;
  autoResumeOnStartup: boolean;
  overwritePolicy: 'rename' | 'overwrite' | 'skip';
  removeCompleted: boolean;
  showCompletionDialog: boolean;
  temporaryDir: string;
  captureFileTypes: string[];
  excludedSites: string[];
  videoDetectionEnabled: boolean;
  disabledVideoSites: string[];
  preferredVideoQuality: 'best' | '2160' | '1440' | '1080' | '720' | '480';
  preferredVideoContainer: 'mp4' | 'mkv' | 'webm';
  concurrentFragments: number;
  cookieBrowser: '' | 'chrome' | 'edge';
  cookieProfile: string;
  cookieConsent: boolean;
  browserOnboardingCompleted: boolean;
  showBrowserOnboardingOnStartup: boolean;
}

// ---------------------------------------------------------------------------
// Commands (UI → service)
// ---------------------------------------------------------------------------

export interface AddDownloadRequest {
  url: string;
  filename?: string;
  destinationPath?: string;
  category?: string;
  kind?: DownloadKind;
  referrer?: string;
  userAgent?: string;
  videoFormatId?: string;
  browser?: 'chrome' | 'edge';
  browserProfile?: string;
}

export type Unsubscribe = () => void;

export interface DownloadService {
  // hydration
  listDownloads(): Promise<Download[]>;
  getSettings(): Promise<Settings>;

  // core actions
  add(req: AddDownloadRequest): Promise<Download>;
  pause(id: string): Promise<void>;
  resume(id: string): Promise<void>;
  pauseAll(): Promise<void>;
  resumeAll(): Promise<void>;
  cancel(id: string): Promise<void>;
  remove(id: string, deleteFile: boolean): Promise<void>;
  retry(id: string): Promise<void>;
  reorder(orderedIds: string[]): Promise<void>;

  // limits
  setGlobalSpeedLimit(bps: number | null): Promise<void>;
  setDownloadSpeedLimit(id: string, bps: number | null): Promise<void>;

  // video grabber
  probeVideo(url: string, browser?: 'chrome' | 'edge', browserProfile?: string): Promise<VideoInfo>;
  selectVideoFormat(id: string, formatId: string): Promise<void>;

  // torrent
  addTorrent(magnetOrFilePath: string): Promise<Download>;
  addTorrentFile(): Promise<Download>;

  // shell helpers
  openFile(id: string): Promise<void>;
  openFolder(id: string): Promise<void>;
  copyUrl(id: string): Promise<void>;

  // settings
  updateSettings(settings: Settings): Promise<void>;

  // events (service → UI)
  onProgress(cb: (updates: Download[]) => void): Unsubscribe; // batched, ~250ms
  onStateChange(cb: (d: Download) => void): Unsubscribe;
  onAdded(cb: (d: Download) => void): Unsubscribe; // e.g. browser/clipboard capture
  onCapturePrompt(cb: (req: AddDownloadRequest) => void): Unsubscribe; // "download this?"
}
