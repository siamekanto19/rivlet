// Bridge to Grabby's video-tools (yt-dlp) auto-installer on the Go side.
// No-ops gracefully in the browser/dev preview.

interface AppBridge {
  VideoToolsReady?: () => Promise<boolean>;
  InstallVideoTools?: () => Promise<void>;
  GetVideoToolsHealth?:()=>Promise<VideoToolsHealth>;
  UpdateVideoTools?:()=>Promise<void>;
  RollbackVideoTools?:()=>Promise<void>;
}
export interface ToolStatus{name:string;installed:boolean;version?:string;path?:string;lastUpdated?:string;managed:boolean;rollbackAvailable:boolean}export interface VideoToolsHealth{ytDlp:ToolStatus;ffmpeg:ToolStatus;updaterConfigured:boolean;diagnosticOk:boolean;diagnosticMessage:string}
interface Runtime {
  EventsOn?: (name: string, cb: (...args: unknown[]) => void) => void;
}
function app(): AppBridge | undefined {
  return (window as unknown as { go?: { main?: { App?: AppBridge } } }).go?.main?.App;
}
function rt(): Runtime | undefined {
  return (window as unknown as { runtime?: Runtime }).runtime;
}

export const videoTools = {
  async ready(): Promise<boolean> {
    const a = app();
    // In the browser preview there's no backend — assume ready so we don't nag.
    return a?.VideoToolsReady ? a.VideoToolsReady() : true;
  },
  async install(): Promise<void> {
    await app()?.InstallVideoTools?.();
  },
  async health():Promise<VideoToolsHealth>{return await app()?.GetVideoToolsHealth?.()??{ytDlp:{name:'yt-dlp',installed:false,managed:false,rollbackAvailable:false},ffmpeg:{name:'ffmpeg',installed:false,managed:false,rollbackAvailable:false},updaterConfigured:false,diagnosticOk:false,diagnosticMessage:'Desktop health is available in the packaged app'}},
  async update():Promise<void>{await app()?.UpdateVideoTools?.()},async rollback():Promise<void>{await app()?.RollbackVideoTools?.()},
  onProgress(cb: (received: number, total: number) => void): void {
    rt()?.EventsOn?.('videoToolsProgress', (p) => {
      const d = (p ?? {}) as { received?: number; total?: number };
      cb(d.received ?? 0, d.total ?? 0);
    });
  },
};
