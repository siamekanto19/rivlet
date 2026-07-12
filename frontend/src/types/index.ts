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
  width?: number; height?: number; fps?: number; videoCodec?: string; audioCodec?: string;
  audioBitrateKbps?: number; hdr?: boolean; compatibility?: string; recommended?: boolean;
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
  errorCategory?: string;
  expectedSha256?: string;
  actualSha256?: string;
  httpVersion?: string;
  dnsMillis?: number;
  tlsMillis?: number;
  ttfbMillis?: number;
  reusedConnections?: number;
  newConnections?: number;
  queueId?: string;
  priority?: number;
  authScheme?: 'basic' | 'bearer';
  authUsername?: string;
  authSecret?: string;
  rememberCredential?: boolean;
  processingStage?: string;

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
  hostRules: { host: string; maxConnections: number; forceSingleConnection: boolean }[];
  useSystemProxy: boolean;
  proxyUrl: string;
  queues: { id:string;name:string;priority:number;maxConcurrent:number;running:boolean;speedLimitBps:number|null;schedule:{enabled:boolean;startHHmm:string;stopHHmm:string;weekdays?:number[];repeat?:boolean}|null;completionAction?:string }[];
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
  expectedSha256?: string;
  queueId?: string;
  priority?: number;
  authScheme?: 'basic' | 'bearer';
  authUsername?: string;
  authSecret?: string;
  rememberCredential?: boolean;
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
  moveToQueue(ids: string[], queueId: string): Promise<void>;
  setQueueRunning(queueId: string, running: boolean): Promise<void>;

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
  resetSettings(): Promise<Settings>;

  // events (service → UI)
  onProgress(cb: (updates: Download[]) => void): Unsubscribe; // batched, ~250ms
  onStateChange(cb: (d: Download) => void): Unsubscribe;
  onAdded(cb: (d: Download) => void): Unsubscribe; // e.g. browser/clipboard capture
  onRemoved(cb: (id: string) => void): Unsubscribe;
  onCompletionRequested(cb: (d: Download) => void): Unsubscribe;
  onCapturePrompt(cb: (req: AddDownloadRequest) => void): Unsubscribe; // "download this?"
}
