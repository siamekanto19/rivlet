import { defineStore } from 'pinia';
import { windowControls } from '../services/window';
import { alpha, darken, lighten, mix, readableText } from '../utils/color';

// Mini-player dimensions and the full-window size to restore to.
const MINI_W = 360;
const MINI_H = 158;
const FULL_W = 1180;
const FULL_H = 720;

const THEME_KEY = 'grabby-theme';

type Mode = 'full' | 'mini';
type View = 'downloads' | 'settings';
type ThemePref = 'light' | 'dark' | 'system';

// The Windows accent ramp, as returned by the Go side (App.GetSystemAccent).
interface AccentPalette {
  accent: string;
  light1: string;
  light2: string;
  light3: string;
  dark1: string;
  dark2: string;
  dark3: string;
}

// The accent-derived CSS variables we override at runtime.
const ACCENT_VARS = [
  '--accent',
  '--accent-hover',
  '--accent-pressed',
  '--accent-text',
  '--accent-soft',
  '--accent-soft-border',
  '--accent-glow',
  '--text-on-accent',
  '--bg-selected',
  '--bg-selected-hover',
] as const;

function readSystemAccent(): Promise<AccentPalette | null> {
  const app = (window as unknown as { go?: { main?: { App?: { GetSystemAccent?: () => Promise<AccentPalette | null> } } } })
    .go?.main?.App;
  if (!app?.GetSystemAccent) return Promise.resolve(null);
  return app.GetSystemAccent().catch(() => null);
}

// Derive the whole accent ramp for a theme from a single fill colour.
function accentVars(pal: AccentPalette, theme: 'light' | 'dark'): Record<string, string> {
  if (theme === 'dark') {
    const fill = pal.light2 || pal.accent;
    const base = '#202022';
    return {
      '--accent': fill,
      '--accent-hover': lighten(fill, 0.12),
      '--accent-pressed': darken(fill, 0.1),
      '--accent-text': fill,
      '--accent-soft': mix(fill, base, 0.82),
      '--accent-soft-border': mix(fill, base, 0.6),
      '--accent-glow': alpha(fill, 0.3),
      '--text-on-accent': readableText(fill),
      '--bg-selected': mix(fill, base, 0.8),
      '--bg-selected-hover': mix(fill, base, 0.72),
    };
  }
  // light — use a darkened variant so the accent reads on white surfaces
  const fill = pal.dark1 || pal.accent;
  return {
    '--accent': fill,
    '--accent-hover': lighten(fill, 0.1),
    '--accent-pressed': lighten(fill, 0.22),
    '--accent-text': fill,
    '--accent-soft': lighten(fill, 0.9),
    '--accent-soft-border': lighten(fill, 0.62),
    '--accent-glow': alpha(fill, 0.28),
    '--text-on-accent': readableText(fill),
    '--bg-selected': lighten(fill, 0.88),
    '--bg-selected-hover': lighten(fill, 0.82),
  };
}

function prefersDark(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!window.matchMedia &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
}

function readThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY) ?? localStorage.getItem('idm-theme');
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    /* ignore */
  }
  return 'light';
}

/**
 * App-shell UI state: the full ⇄ mini window mode, the downloads ⇄ settings
 * page routing, and the theme preference (owned here so both the settings
 * page and the boot sequence agree on it).
 */
export const useUiStore = defineStore('ui', {
  state: () => ({
    mode: 'full' as Mode,
    view: 'downloads' as View,
    themePref: 'light' as ThemePref,
    accent: null as AccentPalette | null,
  }),
  getters: {
    // The concrete theme in effect (resolves 'system' to light/dark).
    resolvedTheme(s): 'light' | 'dark' {
      if (s.themePref === 'system') return prefersDark() ? 'dark' : 'light';
      return s.themePref;
    },
  },
  actions: {
    // -- window mode --------------------------------------------------------
    enterMini() {
      if (this.mode === 'mini') return;
      this.view = 'downloads';
      this.mode = 'mini';
      windowControls.enterMini(MINI_W, MINI_H);
    },
    exitMini() {
      if (this.mode === 'full') return;
      this.mode = 'full';
      windowControls.exitMini(FULL_W, FULL_H);
    },

    // -- page routing -------------------------------------------------------
    openSettings() {
      this.view = 'settings';
    },
    closeSettings() {
      this.view = 'downloads';
    },

    // -- theme --------------------------------------------------------------
    applyTheme() {
      const t = this.resolvedTheme;
      document.documentElement.setAttribute('data-theme', t);
      // Keep the native WebView backing surface in sync so there is no grey
      // flash around the frameless window on theme change.
      if (t === 'dark') windowControls.setBackgroundColour(31, 31, 31);
      else windowControls.setBackgroundColour(238, 241, 245);
      this.applyAccent();
    },

    // Paint the accent CSS variables from the Windows system accent (if we
    // have it); otherwise clear the overrides so the built-in accent applies.
    applyAccent() {
      const root = document.documentElement.style;
      if (!this.accent) {
        for (const v of ACCENT_VARS) root.removeProperty(v);
        return;
      }
      const vars = accentVars(this.accent, this.resolvedTheme);
      for (const v of ACCENT_VARS) root.setProperty(v, vars[v]);
    },

    async initAccent() {
      this.accent = await readSystemAccent();
      this.applyAccent();
      // Re-read when the window regains focus, so changing the Windows accent
      // while the app is open is picked up without a restart.
      if (typeof window !== 'undefined') {
        window.addEventListener('focus', () => {
          readSystemAccent().then((p) => {
            if (p) {
              this.accent = p;
              this.applyAccent();
            }
          });
        });
      }
    },
    setTheme(pref: ThemePref) {
      this.themePref = pref;
      try {
        localStorage.setItem(THEME_KEY, pref);
      } catch {
        /* ignore */
      }
      this.applyTheme();
    },
    initTheme() {
      this.themePref = readThemePref();
      this.applyTheme();
      // React to OS theme changes while the preference is "system".
      if (typeof window !== 'undefined' && window.matchMedia) {
        window
          .matchMedia('(prefers-color-scheme: dark)')
          .addEventListener('change', () => {
            if (this.themePref === 'system') this.applyTheme();
          });
      }
    },
  },
});
