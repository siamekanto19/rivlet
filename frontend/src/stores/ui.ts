import { defineStore } from 'pinia';
import { windowControls } from '../services/window';

// Mini-player dimensions and the full-window size to restore to.
const MINI_W = 360;
const MINI_H = 158;
const FULL_W = 1180;
const FULL_H = 720;

type Mode = 'full' | 'mini';

/**
 * App-shell UI state. Owns the full ⇄ mini window mode so the title bar,
 * App shell and mini-player all agree on what to render and can trigger the
 * matching OS-window transition.
 */
export const useUiStore = defineStore('ui', {
  state: () => ({ mode: 'full' as Mode }),
  actions: {
    enterMini() {
      if (this.mode === 'mini') return;
      this.mode = 'mini';
      windowControls.enterMini(MINI_W, MINI_H);
    },
    exitMini() {
      if (this.mode === 'full') return;
      this.mode = 'full';
      windowControls.exitMini(FULL_W, FULL_H);
    },
  },
});
