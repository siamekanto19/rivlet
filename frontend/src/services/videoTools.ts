// Bridge to Grabby's video-tools (yt-dlp) auto-installer on the Go side.
// No-ops gracefully in the browser/dev preview.

interface AppBridge {
  VideoToolsReady?: () => Promise<boolean>;
  InstallVideoTools?: () => Promise<void>;
}
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
  onProgress(cb: (received: number, total: number) => void): void {
    rt()?.EventsOn?.('videoToolsProgress', (p) => {
      const d = (p ?? {}) as { received?: number; total?: number };
      cb(d.received ?? 0, d.total ?? 0);
    });
  },
};
