// Draws the app icons (the purple tile with the spark) as SVG and PNG into apps/web/public.
//   node make-icons.mjs        (run again only if the logo changes; the results are committed)
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'apps', 'web', 'public', 'icons');
mkdirSync(out, { recursive: true });

const BRAND = '#6c4dff';
const SPARK = 'M12 2.8 14.05 9.95 21.2 12l-7.15 2.05L12 21.2l-2.05-7.15L2.8 12l7.15-2.05L12 2.8Z';

/**
 * `inset` is how much of the tile the spark may use. Maskable icons get a big safe zone because the phone
 * cuts them into a circle or a squircle; the "any" icons get a rounded tile.
 */
function svg({ size, rounded, scale }) {
  const radius = rounded ? size * 0.22 : 0;
  const s = (size * scale) / 24;
  const offset = (size - size * scale) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${radius}" fill="${BRAND}"/>
  <g transform="translate(${offset} ${offset}) scale(${s})" fill="#fff">
    <path d="${SPARK}"/>
    <circle cx="19.1" cy="4.9" r="1.1" opacity=".72"/>
  </g>
</svg>`;
}

const files = [
  { name: 'icon-192.png', size: 192, rounded: true, scale: 0.62 },
  { name: 'icon-512.png', size: 512, rounded: true, scale: 0.62 },
  { name: 'maskable-512.png', size: 512, rounded: false, scale: 0.5 },
  { name: 'apple-touch-icon.png', size: 180, rounded: false, scale: 0.62 },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const f of files) {
  await page.setViewportSize({ width: f.size, height: f.size });
  await page.setContent(`<body style="margin:0;background:transparent">${svg(f)}</body>`);
  await page.screenshot({ path: resolve(out, f.name), omitBackground: true, clip: { x: 0, y: 0, width: f.size, height: f.size } });
  console.log('wrote', f.name);
}
await browser.close();

// The same tile as a vector, for the browser tab.
writeFileSync(resolve(root, 'apps', 'web', 'src', 'app', 'icon.svg'), svg({ size: 64, rounded: true, scale: 0.62 }) + '\n');
console.log('wrote src/app/icon.svg');
