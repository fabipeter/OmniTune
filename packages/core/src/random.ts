/**
 * Cryptographically strong random helpers using Web Crypto (`globalThis.crypto`),
 * available in Node >= 19 and all modern browsers.
 */
export function secureRandom(): number {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return buf[0] / 4294967296;
}

export function secureId(prefix = ''): string {
  const raw =
    typeof globalThis.crypto.randomUUID === 'function'
      ? globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 16)
      : Array.from(globalThis.crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');
  return `${prefix}${raw}`;
}
