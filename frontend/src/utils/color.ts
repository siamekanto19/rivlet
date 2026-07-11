// Tiny colour helpers for deriving the accent palette from a single system
// colour. Everything works in "#rrggbb" hex.

interface RGB {
  r: number;
  g: number;
  b: number;
}

function toRgb(hex: string): RGB {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function toHex({ r, g, b }: RGB): string {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Blend a→b by t (0 → a, 1 → b). */
export function mix(a: string, b: string, t: number): string {
  const x = toRgb(a);
  const y = toRgb(b);
  return toHex({
    r: x.r + (y.r - x.r) * t,
    g: x.g + (y.g - x.g) * t,
    b: x.b + (y.b - x.b) * t,
  });
}

export function lighten(hex: string, t: number): string {
  return mix(hex, '#ffffff', t);
}
export function darken(hex: string, t: number): string {
  return mix(hex, '#000000', t);
}

/** rgba() string for glows/shadows. */
export function alpha(hex: string, a: number): string {
  const { r, g, b } = toRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/** WCAG relative luminance (0 = black, 1 = white). */
export function luminance(hex: string): number {
  const { r, g, b } = toRgb(hex);
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** Black or white text that reads on top of the given fill. */
export function readableText(hex: string): string {
  return luminance(hex) > 0.45 ? 'rgba(0, 0, 0, 0.92)' : '#ffffff';
}
