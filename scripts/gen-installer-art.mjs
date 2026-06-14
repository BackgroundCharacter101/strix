#!/usr/bin/env node
// Generate the Inno Setup wizard artwork — a dark-purple "liquid glass" look —
// as 24-bit BMPs (the format Inno wants). No image deps: we compute each pixel
// (gradient + soft glow blobs + diagonal sheen + vignette + faint dither) and
// write the BMP bytes directly. Deterministic, so reruns are reproducible.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const buildDir = path.join(root, 'apps', 'desktop', 'build');

const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
const lerp = (a, b, t) => a + (b - a) * t;
// Cheap deterministic value-noise in [-1,1].
const noise = (x, y) => {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return (n - Math.floor(n)) * 2 - 1;
};

// Soft radial glow contribution (0..1) from a blob centred at (cx,cy).
function glow(x, y, cx, cy, r) {
  const dx = x - cx;
  const dy = y - cy;
  const d = Math.sqrt(dx * dx + dy * dy) / r;
  return Math.max(0, 1 - d) ** 2;
}

// Compute the RGB for a pixel of a w×h panel in the glass palette.
function pixel(x, y, w, h) {
  const u = x / w;
  const v = y / h;
  // Base diagonal gradient: deep purple (top-left) → near-black (bottom-right).
  const t = (u * 0.45 + v * 0.85) / 1.3;
  let r = lerp(30, 6, t);
  let g = lerp(12, 3, t);
  let b = lerp(58, 14, t);
  // Vivid purple/magenta/blue glow pools (matches the IDE Liquid Glass theme).
  const blobs = [
    [w * 0.18, h * 0.16, w * 0.75, [124, 58, 237], 0.85], // purple #7c3aed
    [w * 0.9, h * 0.55, w * 0.85, [217, 70, 239], 0.7], // magenta #d946ef
    [w * 0.45, h * 0.92, w * 0.7, [59, 130, 246], 0.6], // blue #3b82f6
  ];
  for (const [cx, cy, rad, [br, bg, bb], amt] of blobs) {
    const k = glow(x, y, cx, cy, rad) * amt;
    r = lerp(r, br, k);
    g = lerp(g, bg, k);
    b = lerp(b, bb, k);
  }
  // Diagonal glass sheen — a soft bright band.
  const band = Math.exp(-(((u - v) * 1.4) ** 2) * 6) * 22;
  r += band;
  g += band * 0.8;
  b += band * 1.3;
  // Vignette: darken toward edges for depth.
  const vign = 1 - (Math.abs(u - 0.5) + Math.abs(v - 0.5)) * 0.55;
  r *= vign;
  g *= vign;
  b *= vign;
  // Faint frosted dither to kill banding.
  const d = noise(x, y) * 3;
  return [clamp(r + d), clamp(g + d), clamp(b + d)];
}

function writeBmp(file, w, h) {
  const rowSize = Math.ceil((w * 3) / 4) * 4;
  const dataSize = rowSize * h;
  const buf = Buffer.alloc(54 + dataSize);
  // BITMAPFILEHEADER
  buf.write('BM', 0);
  buf.writeUInt32LE(54 + dataSize, 2);
  buf.writeUInt32LE(54, 10);
  // BITMAPINFOHEADER
  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(w, 18);
  buf.writeInt32LE(h, 22); // positive → bottom-up
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(dataSize, 34);
  buf.writeInt32LE(2835, 38);
  buf.writeInt32LE(2835, 42);
  for (let y = 0; y < h; y++) {
    // BMP rows are bottom-up: row 0 in the file is the bottom image row.
    const srcY = h - 1 - y;
    let off = 54 + y * rowSize;
    for (let x = 0; x < w; x++) {
      const [r, g, b] = pixel(x, srcY, w, h);
      buf[off++] = b;
      buf[off++] = g;
      buf[off++] = r;
    }
  }
  writeFileSync(file, buf);
  console.log(`[art] wrote ${path.relative(root, file)} (${w}x${h})`);
}

// Inno modern wizard: the large left panel is 164x314 at classic scale but the
// modern style fills 164x410 — use that so the welcome/finish art isn't cropped.
writeBmp(path.join(buildDir, 'installerSidebar.bmp'), 164, 410);
writeBmp(path.join(buildDir, 'installerHeader.bmp'), 150, 57);
