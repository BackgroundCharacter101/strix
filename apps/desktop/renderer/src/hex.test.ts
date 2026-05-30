import { describe, it, expect } from 'vitest';
import { hexDump, bytesFromBase64, formatSize } from './hex';

describe('hexDump', () => {
  it('formats offset, hex bytes and ascii', () => {
    const bytes = new Uint8Array([0x48, 0x69, 0x00, 0x7f]); // "Hi", NUL, DEL
    const out = hexDump(bytes);
    expect(out.startsWith('00000000  48 69 00 7f')).toBe(true);
    // ascii column: printable kept, non-printable → '.', trailing padded.
    expect(out).toContain('|Hi..');
    expect(out.trimEnd().endsWith('|')).toBe(true);
  });

  it('wraps at 16 bytes per row with a second offset', () => {
    const bytes = new Uint8Array(20).fill(0x41); // 20 × 'A'
    const rows = hexDump(bytes).split('\n');
    expect(rows).toHaveLength(2);
    expect(rows[0].startsWith('00000000')).toBe(true);
    expect(rows[1].startsWith('00000010')).toBe(true);
  });

  it('caps output at maxRows', () => {
    const bytes = new Uint8Array(16 * 10).fill(1);
    expect(hexDump(bytes, 3).split('\n')).toHaveLength(3);
  });
});

describe('bytesFromBase64', () => {
  it('round-trips bytes', () => {
    // base64 of [1,2,255]
    const b = bytesFromBase64('AQL/');
    expect([...b]).toEqual([1, 2, 255]);
  });
});

describe('formatSize', () => {
  it('formats bytes, KB, MB', () => {
    expect(formatSize(512)).toBe('512 B');
    expect(formatSize(2048)).toBe('2.0 KB');
    expect(formatSize(3 * 1024 * 1024)).toBe('3.00 MB');
  });
});
