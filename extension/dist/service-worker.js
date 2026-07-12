"use strict";
(() => {
  // src/protocol.ts
  var NATIVE_HOST = "com.grabby.download_manager";
  function browserName() {
    return navigator.userAgent.includes("Edg/") ? "edge" : "chrome";
  }
  function envelope(action, payload) {
    return { version: 1, id: crypto.randomUUID(), action, source: { browser: browserName(), extensionVersion: chrome.runtime.getManifest().version }, payload };
  }

  // src/media.ts
  var MEDIA_TTL_MS = 2 * 6e4;
  function isMediaURL(raw) {
    try {
      const u = new URL(raw);
      return (u.protocol === "http:" || u.protocol === "https:") && /\.(m3u8|mpd|mp4|webm|m4v)(?:$|[?#])/i.test(u.href);
    } catch {
      return false;
    }
  }
  function isSiteDisabled(host, disabled) {
    const normalized = host.toLowerCase();
    return disabled.some((site) => normalized === site.toLowerCase() || normalized.endsWith("." + site.toLowerCase()));
  }
  function currentCandidates(values, now = Date.now()) {
    return [...values].filter((item) => now - item.seenAt < MEDIA_TTL_MS).map(({ url, kind }) => ({ url, kind }));
  }

  // src/service-worker.ts
  var MENU_ID = "grabby-download-link";
  var candidates = /* @__PURE__ */ new Map();
  chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.removeAll(() => chrome.contextMenus.create({ id: MENU_ID, title: "Download with Grabify", contexts: ["link"] }));
    chrome.storage.local.get(["captureDownloads", "videoEnabled"], (v) => {
      const defaults = {};
      if (v.captureDownloads === void 0) defaults.captureDownloads = true;
      if (v.videoEnabled === void 0) defaults.videoEnabled = true;
      if (Object.keys(defaults).length) chrome.storage.local.set(defaults);
    });
  });
  async function native(action, payload) {
    const message = envelope(action, payload);
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await chrome.runtime.sendNativeMessage(NATIVE_HOST, message);
      } catch (error) {
        if (attempt === 1) throw error;
      }
    }
    throw new Error("Native host unavailable");
  }
  async function notifyFailure(message) {
    await chrome.notifications.create({ type: "basic", iconUrl: "icons/icon-128.png", title: "Grabify could not receive the download", message });
  }
  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId !== MENU_ID || !info.linkUrl) return;
    try {
      const response = await native("capture.link", { url: info.linkUrl, pageUrl: info.pageUrl, referrer: info.pageUrl, suggestedFilename: "", userAgent: navigator.userAgent });
      if (!response.ok) throw new Error(response.error || "Grabify rejected the link");
    } catch (error) {
      await notifyFailure(error instanceof Error ? error.message : String(error));
    }
  });
  chrome.downloads?.onCreated?.addListener((item) => {
    void grabDownload(item);
  });
  async function resolvedDownload(id, initial) {
    let current = initial;
    for (let attempt = 0; attempt < 4; attempt++) {
      if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 250));
      const matches = await chrome.downloads.search({ id }).catch(() => []);
      if (matches[0]) current = matches[0];
      if (current.finalUrl && current.finalUrl !== initial.url && current.filename) break;
    }
    return current;
  }
  async function grabDownload(item) {
    if (item.byExtensionId === chrome.runtime.id) return;
    const cfg = await chrome.storage.local.get(["captureDownloads", "disabledSites"]);
    if (cfg.captureDownloads === false) return;
    let pausedByGrabby = false;
    try {
      await chrome.downloads.pause(item.id);
      pausedByGrabby = true;
    } catch {
    }
    item = await resolvedDownload(item.id, item);
    const url = item.finalUrl || item.url;
    if (!/^https?:\/\//i.test(url)) {
      if (pausedByGrabby) await chrome.downloads.resume(item.id).catch(() => {
      });
      return;
    }
    try {
      const host = new URL(item.referrer || url).hostname;
      if (host && isSiteDisabled(host, cfg.disabledSites || [])) {
        if (pausedByGrabby) await chrome.downloads.resume(item.id).catch(() => {
        });
        return;
      }
    } catch {
    }
    const suggested = item.filename ? item.filename.split(/[\\/]/).pop() || "" : "";
    try {
      const response = await native("capture.download", { url, pageUrl: item.referrer, referrer: item.referrer, suggestedFilename: suggested, userAgent: navigator.userAgent });
      if (!response.ok) throw new Error(response.error || "Grabify rejected the download");
      try {
        await chrome.downloads.cancel(item.id);
      } catch {
      }
      try {
        await chrome.downloads.erase({ id: item.id });
      } catch {
      }
    } catch (error) {
      if (pausedByGrabby) await chrome.downloads.resume(item.id).catch(() => {
      });
      await notifyFailure(error instanceof Error ? error.message : String(error));
    }
  }
  function registerMediaSniffer() {
    if (!chrome.webRequest?.onBeforeRequest) return;
    if (chrome.webRequest.onBeforeRequest.hasListener(onMediaRequest)) return;
    chrome.webRequest.onBeforeRequest.addListener(onMediaRequest, { urls: ["<all_urls>"], types: ["media", "xmlhttprequest", "other"] });
  }
  function onMediaRequest(details) {
    if (details.tabId < 0 || !isMediaURL(details.url)) return;
    let tab = candidates.get(details.tabId);
    if (!tab) {
      tab = /* @__PURE__ */ new Map();
      candidates.set(details.tabId, tab);
    }
    tab.set(details.url, { url: details.url, kind: details.url.match(/\.(m3u8|mpd|mp4|webm)/i)?.[1]?.toLowerCase(), seenAt: Date.now() });
  }
  registerMediaSniffer();
  chrome.permissions?.onAdded?.addListener(registerMediaSniffer);
  async function ensureContentScript() {
    try {
      if (!chrome.scripting) return;
      const granted = await chrome.permissions.contains({ permissions: ["scripting"], origins: ["<all_urls>"] });
      if (!granted) return;
      const existing = await chrome.scripting.getRegisteredContentScripts({ ids: ["grabby-video-detection"] }).catch(() => []);
      if (existing.length) return;
      await chrome.scripting.registerContentScripts([{ id: "grabby-video-detection", js: ["content-script.js"], matches: ["<all_urls>"], persistAcrossSessions: true, runAt: "document_idle" }]).catch(() => {
      });
    } catch {
    }
  }
  void ensureContentScript();
  chrome.permissions?.onAdded?.addListener(() => {
    void ensureContentScript();
  });
  chrome.tabs.onRemoved.addListener((tabId) => candidates.delete(tabId));
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    void (async () => {
      if (message?.type === "video.playing") {
        const settings = await chrome.storage.local.get(["videoEnabled", "disabledSites"]);
        if (settings.videoEnabled === false) {
          sendResponse({ show: false });
          return;
        }
        const disabled = settings.disabledSites || [];
        const host = new URL(message.pageUrl).hostname;
        if (isSiteDisabled(host, disabled)) {
          sendResponse({ show: false });
          return;
        }
        const list = currentCandidates(candidates.get(sender.tab?.id ?? -1)?.values() || []);
        sendResponse({ show: true, candidates: list });
        return;
      }
      if (message?.type === "capture.video") {
        const response = await native("capture.video", message.payload);
        if (!response.ok) throw new Error(response.error || "Video capture failed");
        sendResponse(response);
        return;
      }
      if (message?.type === "site.disable") {
        const current = (await chrome.storage.local.get("disabledSites")).disabledSites || [];
        const next = [.../* @__PURE__ */ new Set([...current, message.host])];
        await chrome.storage.local.set({ disabledSites: next });
        sendResponse({ ok: true });
        return;
      }
      if (message?.type === "health") {
        const response = await native("health", {});
        const cfg = response.data;
        if (response.ok && cfg) {
          await chrome.storage.local.set({ videoEnabled: cfg.videoEnabled, disabledSites: cfg.disabledVideoSites || [], desktopCaptureFileTypes: cfg.captureFileTypes || [], desktopExcludedSites: cfg.excludedSites || [] });
        }
        sendResponse(response);
        return;
      }
    })().catch(async (error) => {
      await notifyFailure(error instanceof Error ? error.message : String(error));
      sendResponse({ ok: false, error: String(error) });
    });
    return true;
  });
})();
