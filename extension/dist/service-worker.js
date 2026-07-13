"use strict";
(() => {
  // src/protocol.ts
  var NATIVE_HOST = "com.rivlet.download_manager";
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

  // src/download-capture.ts
  function isTakeoverURL(value) {
    return /^https?:\/\//i.test(value);
  }
  function serializeCookies(cookies) {
    return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
  }

  // src/service-worker.ts
  var MENU_ID = "rivlet-download-link";
  var candidates = /* @__PURE__ */ new Map();
  chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.removeAll(() => chrome.contextMenus.create({ id: MENU_ID, title: "Download with Rivlet", contexts: ["link"] }));
    chrome.storage.local.get(["captureDownloads", "captureTorrents", "videoEnabled"], (v) => {
      const defaults = {};
      if (v.captureDownloads === void 0) defaults.captureDownloads = true;
      if (v.captureTorrents === void 0) defaults.captureTorrents = true;
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
    await chrome.notifications.create({ type: "basic", iconUrl: "icons/icon-128.png", title: "Rivlet could not receive the download", message });
  }
  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId !== MENU_ID || !info.linkUrl) return;
    try {
      const response = await native("capture.link", { url: info.linkUrl, pageUrl: info.pageUrl, referrer: info.pageUrl, suggestedFilename: "", userAgent: navigator.userAgent });
      if (!response.ok) throw new Error(response.error || "Rivlet rejected the link");
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
  async function discardBrowserDownload(id) {
    await chrome.downloads.cancel(id).catch(() => {
    });
    for (let attempt = 0; attempt < 4; attempt++) {
      const matches = await chrome.downloads.search({ id }).catch(() => []);
      const current = matches[0];
      if (!current || current.state === "interrupted") break;
      if (current.state === "complete") {
        await chrome.downloads.removeFile(id).catch(() => {
        });
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
      await chrome.downloads.cancel(id).catch(() => {
      });
    }
    await chrome.downloads.erase({ id }).catch(() => {
    });
  }
  async function restoreBrowserDownload(item) {
    const url = item.finalUrl || item.url;
    if (!isTakeoverURL(url)) return;
    await chrome.downloads.download({
      url,
      filename: item.filename ? item.filename.split(/[\\/]/).pop() || void 0 : void 0,
      conflictAction: "uniquify",
      saveAs: false
    }).catch(() => {
    });
  }
  async function showTakeover(item, suggestedFilename) {
    const filename = suggestedFilename || "this file";
    const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true }).catch(() => []);
    if (active?.id && await chrome.tabs.sendMessage(active.id, { type: "rivlet.download.captured", filename }).then(() => true).catch(() => false)) return;
    await chrome.notifications.create({ type: "basic", iconUrl: "icons/icon-128.png", title: "Downloading with Rivlet", message: `Rivlet is now downloading ${filename}.` });
  }
  async function grabDownload(item) {
    if (item.byExtensionId === chrome.runtime.id) return;
    const cfg = await chrome.storage.local.get(["captureDownloads"]);
    if (cfg.captureDownloads === false) return;
    const original = item;
    const initialURL = item.finalUrl || item.url;
    if (!isTakeoverURL(initialURL)) return;
    await chrome.downloads.cancel(item.id).catch(() => {
    });
    item = await resolvedDownload(item.id, item);
    const url = item.finalUrl || item.url || initialURL;
    if (!isTakeoverURL(url)) {
      await restoreBrowserDownload(original);
      return;
    }
    try {
    } catch {
    }
    const browserCookies = await chrome.cookies.getAll({ url }).catch(() => []);
    const cookieHeader = serializeCookies(browserCookies);
    const suggested = item.filename ? item.filename.split(/[\\/]/).pop() || "" : "";
    try {
      const response = await native("capture.download", { url, pageUrl: item.referrer, referrer: item.referrer, suggestedFilename: suggested, userAgent: navigator.userAgent, cookieHeader });
      if (!response.ok) throw new Error(response.error || "Rivlet rejected the download");
      await discardBrowserDownload(item.id);
      await showTakeover(item, suggested);
    } catch (error) {
      await restoreBrowserDownload(original);
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
      const existing = await chrome.scripting.getRegisteredContentScripts({ ids: ["rivlet-video-detection"] }).catch(() => []);
      if (existing.length) return;
      await chrome.scripting.registerContentScripts([{ id: "rivlet-video-detection", js: ["content-script.js"], matches: ["<all_urls>"], persistAcrossSessions: true, runAt: "document_idle" }]).catch(() => {
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
      if (message?.type === "capture.torrent") {
        const cfg = await chrome.storage.local.get(["captureTorrents"]);
        if (cfg.captureTorrents === false) {
          sendResponse({ ok: false, error: "Torrent capture is disabled" });
          return;
        }
        const response = await native("capture.torrent", { url: message.url, pageUrl: message.pageUrl, referrer: message.pageUrl, suggestedFilename: "", userAgent: navigator.userAgent });
        if (!response.ok) throw new Error(response.error || "Rivlet rejected the torrent");
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
