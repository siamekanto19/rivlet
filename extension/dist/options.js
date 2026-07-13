"use strict";
(() => {
  // src/options.ts
  var $ = (id) => document.getElementById(id);
  var statusEl = $("status");
  var video = $("video-enabled");
  var sites = $("disabled-sites");
  var captureDownloads = $("capture-downloads");
  var captureTorrents = $("capture-torrents");
  async function refresh() {
    const saved = await chrome.storage.local.get(["videoEnabled", "disabledSites", "captureDownloads", "captureTorrents"]);
    video.checked = Boolean(saved.videoEnabled);
    captureDownloads.checked = saved.captureDownloads !== false;
    captureTorrents.checked = saved.captureTorrents !== false;
    sites.value = (saved.disabledSites || []).join("\n");
  }
  async function test() {
    statusEl.className = "status";
    statusEl.textContent = "Checking native host\u2026";
    try {
      const r = await chrome.runtime.sendMessage({ type: "health" });
      statusEl.textContent = r?.ok ? "Rivlet is connected." : r?.error || "Not connected";
      statusEl.classList.add(r?.ok ? "ok" : "error");
    } catch (e) {
      statusEl.textContent = String(e);
      statusEl.classList.add("error");
    }
  }
  $("test").onclick = test;
  $("grant").onclick = async () => {
    await chrome.permissions.request({ permissions: ["webRequest"] });
    video.checked = true;
    await chrome.storage.local.set({ videoEnabled: true });
  };
  $("revoke").onclick = async () => {
    await chrome.permissions.remove({ permissions: ["webRequest"] });
    video.checked = false;
    await chrome.storage.local.set({ videoEnabled: false });
  };
  $("save").onclick = async () => {
    await chrome.storage.local.set({ videoEnabled: video.checked, captureDownloads: captureDownloads.checked, captureTorrents: captureTorrents.checked, disabledSites: sites.value.split(/\r?\n/).map((x) => x.trim().toLowerCase()).filter(Boolean) });
  };
  void refresh();
  void test();
})();
