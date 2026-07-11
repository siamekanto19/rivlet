import type { AddDownloadRequest, Download, DownloadService, Settings, VideoInfo } from '../types';
import * as App from '../../wailsjs/go/main/App';
import { EventsOn } from '../../wailsjs/runtime/runtime';
import { MockDownloadService } from './MockDownloadService';

export class WailsDownloadService implements DownloadService {
  listDownloads = () => App.ListDownloads() as Promise<Download[]>;
  getSettings = () => App.GetSettings() as Promise<Settings>;
  add = (req: AddDownloadRequest) => App.Add(req as never) as Promise<Download>;
  pause = (id: string) => App.Pause(id);
  resume = (id: string) => App.Resume(id);
  pauseAll = () => App.PauseAll();
  resumeAll = () => App.ResumeAll();
  cancel = (id: string) => App.Cancel(id);
  remove = (id: string, del: boolean) => App.Remove(id, del);
  retry = (id: string) => App.Retry(id);
  reorder = (ids: string[]) => App.Reorder(ids);
  setGlobalSpeedLimit = (bps: number | null) => App.SetGlobalSpeedLimit(bps as never);
  setDownloadSpeedLimit = (id: string, bps: number | null) => App.SetDownloadSpeedLimit(id, bps as never);
  probeVideo = (url: string) => App.ProbeVideo(url) as Promise<VideoInfo>;
  selectVideoFormat = (id: string, formatId: string) => App.SelectVideoFormat(id, formatId);
  addTorrent = (value: string) => App.AddTorrent(value) as Promise<Download>;
  openFile = (id: string) => App.OpenFile(id);
  openFolder = (id: string) => App.OpenFolder(id);
  copyUrl = (id: string) => App.CopyUrl(id);
  updateSettings = (settings: Settings) => App.UpdateSettings(settings as never);
  onProgress(cb: (updates: Download[]) => void) { return EventsOn('progress', cb); }
  onStateChange(cb: (d: Download) => void) { return EventsOn('stateChange', cb); }
  onAdded(cb: (d: Download) => void) { return EventsOn('added', cb); }
  onCapturePrompt(cb: (r: AddDownloadRequest) => void) { return EventsOn('capturePrompt', cb); }
}

const hasWailsBackend =
  typeof window !== 'undefined' &&
  Boolean((window as unknown as { go?: { main?: { App?: unknown } } }).go?.main?.App);

// Keep browser/HMR previews functional while the packaged desktop app uses Go.
export const downloadService: DownloadService = hasWailsBackend
  ? new WailsDownloadService()
  : new MockDownloadService();
