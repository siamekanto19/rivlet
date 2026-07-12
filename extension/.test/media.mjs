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
export {
  MEDIA_TTL_MS,
  currentCandidates,
  isMediaURL,
  isSiteDisabled
};
