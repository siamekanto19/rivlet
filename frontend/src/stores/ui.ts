import { defineStore } from 'pinia';
import { windowControls } from '../services/window';

// Mini-player dimensions and the full-window size to restore to.
const MINI_W = 360;
const MINI_H = 158;
const FULL_W = 1180;
const FULL_H = 720;

const THEME_KEY = 'grabby-theme';

type Mode = 'full' | 'mini';
type View = 'downloads' | 'settings';
type ThemePref = 'light' | 'dark' | 'system';

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
