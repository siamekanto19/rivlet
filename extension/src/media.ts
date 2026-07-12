export interface MediaCandidate { url: string; kind?: string; seenAt: number }
export const MEDIA_TTL_MS = 2 * 60_000;
export function isMediaURL(raw: string): boolean { try { const u=new URL(raw); return (u.protocol==='http:'||u.protocol==='https:') && /\.(m3u8|mpd|mp4|webm|m4v)(?:$|[?#])/i.test(u.href); } catch { return false; } }
export function isSiteDisabled(host: string, disabled: string[]): boolean { const normalized=host.toLowerCase();return disabled.some(site=>normalized===site.toLowerCase()||normalized.endsWith('.'+site.toLowerCase())); }
export function currentCandidates(values: Iterable<MediaCandidate>, now=Date.now()) { return [...values].filter(item=>now-item.seenAt<MEDIA_TTL_MS).map(({url,kind})=>({url,kind})); }
