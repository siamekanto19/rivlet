// Thin wrapper over the Wails window runtime so the custom title bar can drive
// the OS window. In a plain browser (dev/preview) `window.runtime` is absent,
// so every call degrades gracefully and `isWails` reports false.

interface WailsRuntime {
  WindowMinimise?: () => void;
  WindowToggleMaximise?: () => void;
  WindowIsMaximised?: () => Promise<boolean>;
  Quit?: () => void;
}

function rt(): WailsRuntime | null {
  return (window as unknown as { runtime?: WailsRuntime }).runtime ?? null;
}

export const windowControls = {
  isWails(): boolean {
    return rt() !== null;
  },
  minimise(): void {
    rt()?.WindowMinimise?.();
  },
  toggleMaximise(): void {
    rt()?.WindowToggleMaximise?.();
  },
  async isMaximised(): Promise<boolean> {
    try {
      return (await rt()?.WindowIsMaximised?.()) ?? false;
    } catch {
      return false;
    }
  },
  quit(): void {
    const r = rt();
    if (r?.Quit) r.Quit();
    else window.close();
  },
};
