/**
 * Apple artwork URLs end in `/100x100bb.jpg`; swapping the size gives any resolution.
 */
export function artworkAt(url: string | undefined, size = 300): string {
  if (!url || url.length > 2048) return '';
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return '';
    const safeSize = Number.isFinite(size) && size > 0 ? Math.min(2000, Math.round(size)) : 300;
    parsed.pathname = parsed.pathname.replace(/\/\d{1,4}x\d{1,4}(?:bb|cc|sr)?\.(?:jpg|png|webp)$/i, `/${safeSize}x${safeSize}bb.jpg`);
    return encodeURI(decodeURI(parsed.toString()));
  } catch {
    return '';
  }
}

/** Deterministic pleasant colour from a string — used for placeholders and mix backgrounds. */
export function colorFromString(input: string, s = 55, l = 38): string {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) % 360;
  return `hsl(${h} ${s}% ${l}%)`;
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '0:00';
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

export function formatLongDuration(ms: number): string {
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h} hr ${m} min` : `${m} min`;
}

export function releaseYear(date?: string): string {
  return date ? date.slice(0, 4) : '';
}
