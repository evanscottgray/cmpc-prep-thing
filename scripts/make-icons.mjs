#!/usr/bin/env node
// Renders public/icons/icon.svg to the PNG sizes iOS and the manifest need.
// Uses Playwright's Chromium (run inside the Playwright Docker image if host libraries are missing).
import fs from 'node:fs';
import { chromium } from '@playwright/test';
const svg = fs.readFileSync('public/icons/icon.svg', 'utf8');
const out = [
  ['public/icons/apple-touch-icon.png', 180, 1],
  ['public/icons/icon-192.png', 192, 1],
  ['public/icons/icon-512.png', 512, 1],
  ['public/icons/icon-maskable-512.png', 512, 0.82],
];
const b = await chromium.launch();
const p = await b.newPage();
for (const [file, size, scale] of out) {
  await p.setViewportSize({ width: size, height: size });
  const inner = Math.round(size * scale), off = Math.round((size - inner) / 2);
  await p.setContent(`<html><body style="margin:0;background:#0b4a5a;width:${size}px;height:${size}px;overflow:hidden">
    <div style="position:absolute;left:${off}px;top:${off}px;width:${inner}px;height:${inner}px">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div></body></html>`);
  await p.screenshot({ path: file, omitBackground: false });
  console.log('wrote', file);
}
await b.close();
