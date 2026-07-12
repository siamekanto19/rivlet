import { defineStore } from 'pinia';
import type {
  AddDownloadRequest,
  Download,
  DownloadState,
  Settings,
} from '../types';
import { downloadService } from '../services/WailsDownloadService';
import { fileTypeOf, type FileType } from '../utils/fileType';

export type SortKey =
  | 'filename'
  | 'sizeBytes'
  | 'state'
  | 'progressPct'
  | 'speedBps'
  | 'etaSeconds'
  | 'dateAdded';

export type SortDir = 'asc' | 'desc';

const UNFINISHED: DownloadState[] = ['queued', 'connecting', 'active', 'paused', 'error'];
const FINISHED: DownloadState[] = ['completed', 'canceled'];

interface State {
  downloads: Download[];
  settings: Settings | null;
  selectedIds: string[];
  lastAnchorId: string | null;
  activeCategory: string; // 'all' | 'unfinished' | 'finished' | <categoryId>
  searchQuery: string;
  fileTypeFilter: 'all' | FileType;
  sortKey: SortKey;
  sortDir: SortDir;
  manualOrder: boolean; // set by drag-reorder; suspends column sorting
  capturePrompt: AddDownloadRequest | null;
  completionPrompt: Download | null;
  ready: boolean;
}

export const useDownloadsStore = defineStore('downloads', {
  state: (): State => ({
    downloads: [],
    settings: null,
    selectedIds: [],
    lastAnchorId: null,
    activeCategory: 'all',
    searchQuery: '',
    fileTypeFilter: 'all',
    sortKey: 'dateAdded',
    sortDir: 'desc',
    manualOrder: false,
    capturePrompt: null,
    completionPrompt: null,
    ready: false,
  }),

  getters: {
    byId: (s) => {
      const m = new Map<string, Download>();
      for (const d of s.downloads) m.set(d.id, d);
      return m;
    },

    // rows after category filter + search, then sort
    visibleDownloads(s): Download[] {
      let rows = s.downloads.slice();

      // category / grouping filter
      if (s.activeCategory === 'unfinished') {
        rows = rows.filter((d) => UNFINISHED.includes(d.state));
      } else if (s.activeCategory === 'finished') {
        rows = rows.filter((d) => FINISHED.includes(d.state));
      } else if (s.activeCategory !== 'all') {
        rows = rows.filter((d) => d.category === s.activeCategory);
      }

      // search
      const q = s.searchQuery.trim().toLowerCase();
      if (q) {
        rows = rows.filter(
          (d) => d.filename.toLowerCase().includes(q) || d.url.toLowerCase().includes(q),
        );
      }

      if (s.fileTypeFilter !== 'all') rows = rows.filter((d) => fileTypeOf(d) === s.fileTypeFilter);

      // manual (drag) order preserves the master array order
      if (s.manualOrder) return rows;

      // sort
      const dir = s.sortDir === 'asc' ? 1 : -1;
      const key = s.sortKey;
      rows.sort((a, b) => {
        let av: number | string;
        let bv: number | string;
        if (key === 'filename' || key === 'state') {
          av = a[key];
          bv = b[key];
        } else {
          av = (a[key] ?? -1) as number;
          bv = (b[key] ?? -1) as number;
        }
        if (av < bv) return -1 * dir;
        if (av > bv) return 1 * dir;
        return 0;
      });
      return rows;
    },

    selectedDownloads(s): Download[] {
      const set = new Set(s.selectedIds);
      return s.downloads.filter((d) => set.has(d.id));
    },

    // status-bar totals
    totalSpeedBps(s): number {
      return s.downloads
        .filter((d) => d.state === 'active')
        .reduce((sum, d) => sum + (d.speedBps || 0), 0);
    },
    activeCount(s): number {
      return s.downloads.filter((d) => d.state === 'active' || d.state === 'connecting').length;
    },
    queuedCount(s): number {
      return s.downloads.filter((d) => d.state === 'queued').length;
    },
    completedCount(s): number {
      return s.downloads.filter((d) => d.state === 'completed').length;
    },

    // per-category counts for the sidebar (unfinished only, IDM-style)
    categoryCounts(s): Record<string, number> {
      const counts: Record<string, number> = {};
      for (const d of s.downloads) {
        counts[d.category] = (counts[d.category] ?? 0) + 1;
      }
      return counts;
    },
    unfinishedCount(s): number {
      return s.downloads.filter((d) => UNFINISHED.includes(d.state)).length;
    },
    finishedCount(s): number {
      return s.downloads.filter((d) => FINISHED.includes(d.state)).length;
    },

    // selection-driven toolbar enablement
    canResume(): boolean {
      return this.selectedDownloads.some((d: Download) =>
        ['paused', 'queued', 'error', 'canceled'].includes(d.state),
      );
    },
    canPause(): boolean {
      return this.selectedDownloads.some((d: Download) =>
        ['active', 'connecting', 'queued'].includes(d.state),
      );
    },
    hasSelection(s): boolean {
      return s.selectedIds.length > 0;
    },
  },

  actions: {
    // -- lifecycle ----------------------------------------------------------
    async init() {
      this.downloads = await downloadService.listDownloads();
      this.settings = await downloadService.getSettings();
      this.ready = true;

      downloadService.onProgress((updates) => this.applyProgress(updates));
      downloadService.onStateChange((d) => this.applyOne(d));
      downloadService.onAdded((d) => this.applyAdded(d));
      downloadService.onRemoved((id) => { this.downloads=this.downloads.filter((d)=>d.id!==id);this.selectedIds=this.selectedIds.filter((x)=>x!==id); });
      downloadService.onCompletionRequested((d) => { this.completionPrompt=d; });
      downloadService.onCapturePrompt((req) => {
        this.capturePrompt = req;
      });
    },

    applyProgress(updates: Download[]) {
      const idx = new Map(this.downloads.map((d, i) => [d.id, i]));
      for (const u of updates) {
        const i = idx.get(u.id);
        if (i != null) this.downloads[i] = u;
      }
    },

    applyOne(d: Download) {
      const i = this.downloads.findIndex((x) => x.id === d.id);
      if (i >= 0) this.downloads[i] = d;
      else this.downloads.push(d);
    },

    applyAdded(d: Download) {
      if (!this.downloads.some((x) => x.id === d.id)) this.downloads.unshift(d);
    },

    // -- selection ----------------------------------------------------------
    selectSingle(id: string) {
      this.selectedIds = [id];
      this.lastAnchorId = id;
    },
    toggleSelect(id: string) {
      const i = this.selectedIds.indexOf(id);
      if (i >= 0) this.selectedIds.splice(i, 1);
      else this.selectedIds.push(id);
      this.lastAnchorId = id;
    },
    selectRange(id: string) {
      const rows = this.visibleDownloads;
      const anchor = this.lastAnchorId ?? id;
      const a = rows.findIndex((d) => d.id === anchor);
      const b = rows.findIndex((d) => d.id === id);
      if (a < 0 || b < 0) return this.selectSingle(id);
      const [lo, hi] = a < b ? [a, b] : [b, a];
      this.selectedIds = rows.slice(lo, hi + 1).map((d) => d.id);
    },
    selectAll() {
      this.selectedIds = this.visibleDownloads.map((d) => d.id);
    },
    clearSelection() {
      this.selectedIds = [];
      this.lastAnchorId = null;
    },

    // -- filters / sort -----------------------------------------------------
    setCategory(cat: string) {
      this.activeCategory = cat;
      // drop selections that are no longer visible
      const visible = new Set(this.visibleDownloads.map((d) => d.id));
      this.selectedIds = this.selectedIds.filter((id) => visible.has(id));
    },
    setSearch(q: string) {
      this.searchQuery = q;
    },
    setFileTypeFilter(value: 'all' | FileType) { this.fileTypeFilter=value;this.clearSelection(); },
    setSort(key: SortKey) {
      // clicking a column header returns to sorted mode
      if (this.manualOrder) {
        this.manualOrder = false;
        this.sortKey = key;
        this.sortDir = key === 'filename' || key === 'state' ? 'asc' : 'desc';
        return;
      }
      if (this.sortKey === key) {
        this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        this.sortKey = key;
        this.sortDir = key === 'filename' || key === 'state' ? 'asc' : 'desc';
      }
    },

    // Drag-reorder: slot the visible rows into the master array in the given
    // order (keeping hidden rows in place), then push the full order through
    // the service contract's reorder().
    async reorderRows(orderedVisibleIds: string[]) {
      this.manualOrder = true;
      const idMap = this.byId;
      const visSet = new Set(orderedVisibleIds);
      let vi = 0;
      const next: Download[] = this.downloads.map((d) => {
        if (visSet.has(d.id)) {
          const picked = idMap.get(orderedVisibleIds[vi]);
          vi += 1;
          return picked ?? d;
        }
        return d;
      });
      this.downloads = next;
      await downloadService.reorder(next.map((d) => d.id));
    },

    // -- service passthroughs ----------------------------------------------
    async add(req: AddDownloadRequest) {
      return downloadService.add(req);
    },
    async addTorrent(magnetOrPath: string) {
      return downloadService.addTorrent(magnetOrPath);
    },
    async addTorrentFile() {
      return downloadService.addTorrentFile();
    },
    async pause(id: string) {
      await downloadService.pause(id);
    },
    async resume(id: string) {
      await downloadService.resume(id);
    },
    async pauseAll() {
      await downloadService.pauseAll();
    },
    async resumeAll() {
      await downloadService.resumeAll();
    },
    async cancel(id: string) {
      await downloadService.cancel(id);
    },
    async remove(id: string, deleteFile: boolean) {
      await downloadService.remove(id, deleteFile);
      this.downloads = this.downloads.filter((d) => d.id !== id);
      this.selectedIds = this.selectedIds.filter((x) => x !== id);
    },
    async retry(id: string) {
      await downloadService.retry(id);
    },
    async reorder(orderedIds: string[]) {
      await downloadService.reorder(orderedIds);
    },
    async moveSelectedToQueue(queueId: string) { await downloadService.moveToQueue([...this.selectedIds], queueId); for (const d of this.downloads) if (this.selectedIds.includes(d.id)) d.queueId = queueId; },
    async setQueueRunning(queueId: string, running: boolean) { await downloadService.setQueueRunning(queueId, running); const q=this.settings?.queues.find((x)=>x.id===queueId);if(q)q.running=running; },

    // batch helpers that operate on the current selection
    async pauseSelected() {
      for (const d of this.selectedDownloads) await this.pause(d.id);
    },
    async resumeSelected() {
      for (const d of this.selectedDownloads) await this.resume(d.id);
    },
    async removeSelected(deleteFile: boolean) {
      for (const id of [...this.selectedIds]) await this.remove(id, deleteFile);
    },

    async setGlobalSpeedLimit(bps: number | null) {
      await downloadService.setGlobalSpeedLimit(bps);
      if (this.settings) this.settings.globalSpeedLimitBps = bps;
    },
    async setDownloadSpeedLimit(id: string, bps: number | null) {
      await downloadService.setDownloadSpeedLimit(id, bps);
    },

    async probeVideo(url: string, browser?: 'chrome' | 'edge', browserProfile?: string) {
      return downloadService.probeVideo(url, browser, browserProfile);
    },
    async selectVideoFormat(id: string, formatId: string) {
      await downloadService.selectVideoFormat(id, formatId);
    },

    async openFile(id: string) {
      await downloadService.openFile(id);
    },
    async openFolder(id: string) {
      await downloadService.openFolder(id);
    },
    async copyUrl(id: string) {
      await downloadService.copyUrl(id);
    },

    async updateSettings(settings: Settings) {
      await downloadService.updateSettings(settings);
      this.settings = JSON.parse(JSON.stringify(settings));
    },
    async resetSettings(){const settings=await downloadService.resetSettings();this.settings=JSON.parse(JSON.stringify(settings));return settings},

    dismissCapture() {
      this.capturePrompt = null;
    },
    dismissCompletion(){this.completionPrompt=null},
    async acceptCapture(req: AddDownloadRequest) {
      await this.add(req);
      this.capturePrompt = null;
    },

    // dev-only capture trigger
    triggerCapture() {
      (downloadService as { triggerCapture?: () => void }).triggerCapture?.();
    },
  },
});
