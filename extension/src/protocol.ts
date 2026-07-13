export const NATIVE_HOST = 'com.rivlet.download_manager';
export type BrowserName = 'chrome' | 'edge';
export interface NativeResponse { version: 1; id: string; ok: boolean; error?: string; data?: unknown }
export function browserName(): BrowserName { return navigator.userAgent.includes('Edg/') ? 'edge' : 'chrome'; }
export function envelope(action: string, payload: unknown) { return { version: 1, id: crypto.randomUUID(), action, source: { browser: browserName(), extensionVersion: chrome.runtime.getManifest().version }, payload }; }
