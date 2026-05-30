// Build a classic hex dump string: `offset  hex bytes  |ascii|`, 16 bytes/row.
// Pure + lightweight (produces one string rendered in a <pre>, not per-byte DOM).
export function hexDump(bytes: Uint8Array, maxRows = 4096): string {
  const rows: string[] = [];
  const total = Math.min(bytes.length, maxRows * 16);
  for (let off = 0; off < total; off += 16) {
    const slice = bytes.subarray(off, off + 16);
    const hexParts: string[] = [];
    let ascii = '';
    for (let i = 0; i < 16; i++) {
      if (i < slice.length) {
        const b = slice[i];
        hexParts.push(b.toString(16).padStart(2, '0'));
        ascii += b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.';
      } else {
        hexParts.push('  ');
        ascii += ' ';
      }
      if (i === 7) hexParts.push(''); // gap between the two 8-byte groups
    }
    const offset = off.toString(16).padStart(8, '0');
    rows.push(`${offset}  ${hexParts.join(' ')}  |${ascii}|`);
  }
  return rows.join('\n');
}

export function bytesFromBase64(base64: string): Uint8Array {
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
