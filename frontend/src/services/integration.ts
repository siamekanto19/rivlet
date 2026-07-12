// Bridge to the Go browser-integration methods. Falls back to sensible values
// in the browser/dev preview (where `window.go` is absent) so the setup UI can
// still be designed and viewed.

export interface BrowserInfo {
  id: string;
  name: string;
}
export interface BrowserIntegration {
  extensionDir: string;
  extensionId: string;
  connected: boolean;
  browsers: BrowserInfo[];
}

interface AppBridge {
  GetBrowserIntegration?: () => Promise<BrowserIntegration>;
  OpenBrowserExtensions?: (id: string) => Promise<void>;
  OpenExtensionFolder?: () => Promise<void>;
  BeginBrowserSetup?: (id: string) => Promise<void>;
  NeedsBrowserOnboarding?: () => Promise<boolean>;
  CompleteBrowserOnboarding?: () => Promise<void>;
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

const FALLBACK: BrowserIntegration = {
  extensionDir: 'C:\\Program Files\\Grabify\\integration\\extension',
  extensionId: 'iimckgccfcifkglbmdcghhfkdkbcbiib',
  connected: false,
  browsers: [
    { id: 'chrome', name: 'Google Chrome' },
    { id: 'edge', name: 'Microsoft Edge' },
  ],
};

export const integration = {
  /** True when running inside the packaged app (Go backend present). */
  available(): boolean {
    return !!app()?.GetBrowserIntegration;
  },
  async get(): Promise<BrowserIntegration> {
    const a = app();
    if (a?.GetBrowserIntegration) {
      try {
        return await a.GetBrowserIntegration();
      } catch {
        /* fall through */
      }
    }
    return FALLBACK;
  },
  openExtensions(id: string): void {
    app()?.OpenBrowserExtensions?.(id);
  },
  openFolder(): void {
    app()?.OpenExtensionFolder?.();
  },
  async beginSetup(id: string): Promise<void> {
    const a = app();
    if (a?.BeginBrowserSetup) return a.BeginBrowserSetup(id);
    await a?.OpenBrowserExtensions?.(id);
  },
  async needsOnboarding(): Promise<boolean> {
    return (await app()?.NeedsBrowserOnboarding?.()) ?? false;
  },
  async completeOnboarding(): Promise<void> {
    await app()?.CompleteBrowserOnboarding?.();
  },
  /** Fires when the extension first connects back to Grabby. */
  onConnected(cb: (browser: string) => void): void {
    rt()?.EventsOn?.('browserConnected', (b) => cb(String(b ?? '')));
  },
};
