// Thin wrapper over the Wails window runtime so the custom title bar and the
// mini-player can drive the OS window. In a plain browser (dev/preview)
// `window.runtime` is absent, so every call degrades gracefully and `isWails`
// reports false.

interface WailsRuntime {
  WindowMinimise?: () => void;
  WindowToggleMaximise?: () => void;
  WindowIsMaximised?: () => Promise<boolean>;
  WindowSetBackgroundColour?: (r: number, g: number, b: number, a: number) => void;
  WindowSetSize?: (w: number, h: number) => void;
  WindowSetMinSize?: (w: number, h: number) => void;
  WindowSetAlwaysOnTop?: (b: boolean) => void;
  WindowCenter?: () => void;
  WindowShow?: () => void;
  WindowHide?: () => void;
  WindowUnminimise?: () => void;
  Quit?: () => void;
}

function rt(): WailsRuntime | null {
  return (window as unknown as { runtime?: WailsRuntime }).runtime ?? null;
}

// Full-window minimum, mirrors main.go's MinWidth/MinHeight.
const FULL_MIN_W = 900;
const FULL_MIN_H = 520;

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
  setBackgroundColour(r: number, g: number, b: number, a = 255): void {
    rt()?.WindowSetBackgroundColour?.(r, g, b, a);
  },
  quit(): void {
    const r = rt();
    if (r?.Quit) r.Quit();
    else window.close();
  },

  /** Hide the window to the system tray (keeps the app + downloads running). */
  hide(): void {
    rt()?.WindowHide?.();
  },
  show(): void {
    const r = rt();
    r?.WindowShow?.();
    r?.WindowUnminimise?.();
  },

  /**
   * Shrink into a compact, always-on-top floating widget. The min-size floor
   * has to be lowered first, otherwise WindowSetSize is clamped to the full
   * minimum. The window keeps its current top-left corner — it is meant to be
   * dragged wherever the user wants.
   */
  enterMini(w: number, h: number): void {
    const r = rt();
    if (!r) return;
    r.WindowSetMinSize?.(w, h);
    r.WindowSetSize?.(w, h);
    r.WindowSetAlwaysOnTop?.(true);
  },

  /** Restore the full window: drop always-on-top, resize back, re-centre. */
  exitMini(w: number, h: number): void {
    const r = rt();
    if (!r) return;
    r.WindowSetAlwaysOnTop?.(false);
    r.WindowSetMinSize?.(FULL_MIN_W, FULL_MIN_H);
    r.WindowSetSize?.(w, h);
    r.WindowCenter?.();
  },

  /**
   * Show a small, centred, always-on-top capture popup (for browser grabs).
   * Sizes the window down before showing so the full app never flashes.
   */
  enterCapture(w: number, h: number): void {
    const r = rt();
    if (!r) return;
    r.WindowSetMinSize?.(w, h);
    r.WindowSetSize?.(w, h);
    r.WindowSetAlwaysOnTop?.(true);
    r.WindowCenter?.();
    r.WindowShow?.();
    r.WindowUnminimise?.();
  },

  /** Reset window to full dimensions without showing it (used before hiding). */
  resetFull(w: number, h: number): void {
    const r = rt();
    if (!r) return;
    r.WindowSetAlwaysOnTop?.(false);
    r.WindowSetMinSize?.(FULL_MIN_W, FULL_MIN_H);
    r.WindowSetSize?.(w, h);
    r.WindowCenter?.();
  },
};
