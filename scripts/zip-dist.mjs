#!/usr/bin/env node
// Deterministic zip of dist/ → release/cmpc-prep-v<version>-dist.zip (stored entries sorted, fixed timestamps).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const root = 'dist';
const files = [];
(function walk(d) { for (const f of fs.readdirSync(d).sort()) { const p = path.join(d, f); fs.statSync(p).isDirectory() ? walk(p) : files.push(p); } })(root);

const DOS_TIME = 0, DOS_DATE = (2025 - 1980) << 9 | 1 << 5 | 1; // 2025-01-01 00:00
const locals = [], centrals = [];
let offset = 0;
for (const f of files) {
  const name = Buffer.from(path.relative(root, f).split(path.sep).join('/'));
  const data = fs.readFileSync(f);
  const comp = zlib.deflateRawSync(data, { level: 9 });
  const crc = zlib.crc32(data) >>> 0;
  const lh = Buffer.alloc(30);
  lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(8, 8);
  lh.writeUInt16LE(DOS_TIME, 10); lh.writeUInt16LE(DOS_DATE, 12); lh.writeUInt32LE(crc, 14);
  lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(0, 28);
  const ch = Buffer.alloc(46);
  ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(8, 10);
  ch.writeUInt16LE(DOS_TIME, 12); ch.writeUInt16LE(DOS_DATE, 14); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20);
  ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(0, 30); ch.writeUInt16LE(0, 34);
  ch.writeUInt16LE(0, 36); ch.writeUInt32LE(0o100644 << 16 >>> 0, 38); ch.writeUInt32LE(offset, 42);
  locals.push(lh, name, comp); centrals.push(ch, name);
  offset += lh.length + name.length + comp.length;
}
const cd = Buffer.concat(centrals);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
fs.mkdirSync('release', { recursive: true });
const out = `release/cmpc-prep-v${pkg.version}-dist.zip`;
fs.writeFileSync(out, Buffer.concat([...locals, cd, end]));
console.log(`wrote ${out} (${files.length} files, ${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
