import sharp from 'sharp';
import { readFileSync } from 'fs';

const svg = readFileSync('apps/desktop/build/icon.svg');
await sharp(svg, { density: 300 })
  .resize(512, 512)
  .png()
  .toFile('apps/desktop/build/icon.png');

console.log('Generated apps/desktop/build/icon.png (512x512)');