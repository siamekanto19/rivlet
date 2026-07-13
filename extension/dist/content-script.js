"use strict";
(() => {
  // src/content-script.ts
  var drm = /* @__PURE__ */ new WeakSet();
  var prompted = /* @__PURE__ */ new Set();
  var cleanup = null;
  var takeoverHost = null;
  var takeoverTimer;
  function showTakeoverNotice(filename) {
    takeoverHost?.remove();
    if (takeoverTimer) window.clearTimeout(takeoverTimer);
    const host = document.createElement("div");
    takeoverHost = host;
    host.style.all = "initial";
    document.documentElement.append(host);
    const shadow = host.attachShadow({ mode: "closed" });
    shadow.innerHTML = `<style>:host{all:initial}.notice{position:fixed;right:26px;bottom:26px;z-index:2147483647;display:flex;align-items:center;gap:12px;padding:11px 15px 11px 11px;border:1px solid rgba(255,255,255,.18);border-radius:16px;background:rgba(18,18,19,.96);box-shadow:0 18px 52px rgba(0,0,0,.38);color:#fff;font:13px "Segoe UI",sans-serif;animation:in .38s cubic-bezier(.16,1,.3,1) both}.orb{display:grid;width:36px;height:36px;place-items:center;border-radius:50%;background:#fff;color:#111;animation:travel 1.45s cubic-bezier(.16,.8,.28,1) .18s both}.orb svg{width:18px;height:18px}.copy{min-width:0}.eyebrow{margin-bottom:2px;color:#aeb4b9;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}.name{max-width:min(280px,calc(100vw - 156px));overflow:hidden;font-weight:600;text-overflow:ellipsis;white-space:nowrap}@keyframes in{from{opacity:0;transform:translateY(14px) scale(.96)}to{opacity:1;transform:none}}@keyframes travel{0%{transform:translate(-14px,-44px) scale(.62);opacity:0}28%{opacity:1}74%{transform:translate(0,0) scale(1)}100%{transform:translate(0,0) scale(.94);opacity:1}}</style><div class="notice" role="status" aria-live="polite"><div class="orb"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/></svg></div><div class="copy"><div class="eyebrow">Rivlet is downloading</div><div class="name"></div></div></div>`;
    shadow.querySelector(".name").textContent = filename;
    takeoverTimer = window.setTimeout(() => {
      host.remove();
      if (takeoverHost === host) takeoverHost = null;
    }, 4200);
  }
  function usableSource(video) {
    const raw = video.currentSrc || video.src;
    return raw && !raw.startsWith("blob:") && !raw.startsWith("data:") ? raw : "";
  }
  function key(video) {
    return `${location.href}|${usableSource(video) || video.poster || video.duration}`;
  }
  async function onPlaying(event) {
    const video = event.currentTarget;
    if (drm.has(video) || prompted.has(key(video))) return;
    const result = await chrome.runtime.sendMessage({ type: "video.playing", pageUrl: location.href });
    if (!result?.show) return;
    prompted.add(key(video));
    showPrompt(video, result.candidates || []);
  }
  function observe(video) {
    if (video.dataset.rivletObserved) return;
    video.dataset.rivletObserved = "1";
    video.addEventListener("encrypted", () => {
      drm.add(video);
      cleanup?.();
    }, { once: true });
    video.addEventListener("playing", onPlaying);
    if (!video.paused && video.readyState >= 2) queueMicrotask(() => void onPlaying({ currentTarget: video }));
  }
  function scan(root = document) {
    root.querySelectorAll("video").forEach((v) => observe(v));
  }
  function showPrompt(video, candidates) {
    cleanup?.();
    const host = document.createElement("div");
    host.style.all = "initial";
    document.documentElement.append(host);
    const shadow = host.attachShadow({ mode: "closed" });
    shadow.innerHTML = `<style>:host{all:initial}.bar{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483647;display:flex;align-items:center;gap:12px;min-width:390px;max-width:calc(100vw - 32px);padding:12px 14px;border:1px solid rgba(255,255,255,.18);border-radius:12px;background:#111;color:#fff;box-shadow:0 14px 40px rgba(0,0,0,.42);font:13px "Segoe UI",sans-serif}.text{flex:1;min-width:0}.title{font-weight:650}.sub{margin-top:2px;color:#aaa;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}button{border:0;border-radius:7px;padding:7px 11px;font:600 12px "Segoe UI",sans-serif;cursor:pointer}.download{background:#0f6cbd;color:#fff}.dismiss,.never{background:#292929;color:#eee}.never{padding:7px 8px}</style><div class="bar" role="dialog" aria-label="Rivlet video download"><div class="text"><div class="title">Download this video with Rivlet?</div><div class="sub"></div></div><button class="never" title="Never show on this site">Never here</button><button class="dismiss">Dismiss</button><button class="download">Download</button></div>`;
    const bar = shadow.querySelector(".bar");
    const sub = bar.querySelector(".sub");
    sub.textContent = document.title;
    cleanup = () => {
      host.remove();
      cleanup = null;
    };
    bar.querySelector(".dismiss").addEventListener("click", () => cleanup?.());
    bar.querySelector(".never").addEventListener("click", async () => {
      await chrome.runtime.sendMessage({ type: "site.disable", host: location.hostname });
      cleanup?.();
    });
    bar.querySelector(".download").addEventListener("click", async () => {
      const direct = usableSource(video);
      const all = direct ? [{ url: direct, kind: "direct" }, ...candidates] : candidates;
      const payload = { pageUrl: location.href, title: document.title, posterUrl: video.poster || "", duration: Number.isFinite(video.duration) ? video.duration : 0, drmDetected: drm.has(video), userAgent: navigator.userAgent, candidates: all };
      await chrome.runtime.sendMessage({ type: "capture.video", payload });
      cleanup?.();
    });
  }
  scan();
  new MutationObserver((records) => records.forEach((r) => r.addedNodes.forEach((n) => {
    if (n instanceof HTMLVideoElement) observe(n);
    else if (n instanceof Element) scan(n);
  }))).observe(document.documentElement, { subtree: true, childList: true });
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "rivlet.download.captured") showTakeoverNotice(String(message.filename || "this file"));
  });
  if (!window.__rivletMagnet) {
    window.__rivletMagnet = true;
    let captureTorrents = true;
    chrome.storage?.local?.get?.(["captureTorrents"], (v) => {
      captureTorrents = v.captureTorrents !== false;
    });
    chrome.storage?.onChanged?.addListener((changes, area) => {
      if (area === "local" && changes.captureTorrents) captureTorrents = changes.captureTorrents.newValue !== false;
    });
    document.addEventListener("click", (event) => {
      if (!captureTorrents || event.defaultPrevented || event.button !== 0) return;
      const anchor = event.target?.closest?.('a[href^="magnet:"]');
      if (!anchor) return;
      const href = anchor.href || anchor.getAttribute("href") || "";
      if (!/^magnet:\?/i.test(href)) return;
      event.preventDefault();
      event.stopPropagation();
      void chrome.runtime.sendMessage({ type: "capture.torrent", url: href, pageUrl: location.href });
    }, true);
  }
})();
