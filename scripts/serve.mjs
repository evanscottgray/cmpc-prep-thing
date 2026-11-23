#!/usr/bin/env node
// Zero-dependency static server for the production build in dist/.
//   npm run preview       → http://127.0.0.1:4173  (localhost is a secure context: offline mode works)
//   npm run preview:lan   → http://<this-computer's-LAN-IP>:4173 for iPhone/iPad on the same Wi-Fi
// Options: --host <addr> --port <n> --dir <path> --base </subpath/>   (or PORT env var)
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : d; };
const host = arg('--host', '127.0.0.1');
const port = Number(arg('--port', process.env.PORT || 4173));
const base = arg('--base', '/'); // serve under a subpath (as GitHub Pages does), e.g. --base /my-repo/
const root = path.resolve(arg('--dir', 'dist'));
if (!fs.existsSync(path.join(root, 'index.html'))) { console.error(`No build found in ${root}. Run "npm run build" first.`); process.exit(1); }

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8',
};

const server = http.createServer((req, res) => {
  let p;
  try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400).end(); return; }
  if (p + '/' === base) { res.writeHead(301, { location: base }).end(); return; }
  if (!p.startsWith(base)) { res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found'); return; }
  p = `/${p.slice(base.length)}`;
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(root, path.normalize(p).replace(/^([/\\])+/, ''));
  if (p.includes('\0') || (file !== root && !file.startsWith(root + path.sep))) { res.writeHead(403).end(); return; }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found'); return; }
    const ext = path.extname(file);
    const noCache = !p.includes('/assets/'); // only content-hashed files are cached long-term
    res.writeHead(200, {
      'content-type': TYPES[ext] || 'application/octet-stream',
      'cache-control': noCache ? 'no-cache' : 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
    });
    if (req.method === 'HEAD') { res.end(); return; }
    fs.createReadStream(file).pipe(res);
  });
});

server.listen(port, host, () => {
  console.log(`\nCMPC Prep — serving ${path.relative(process.cwd(), root) || '.'}/`);
  if (host === '0.0.0.0' || host === '::') {
    const ips = Object.values(os.networkInterfaces()).flat().filter((n) => n && n.family === 'IPv4' && !n.internal).map((n) => n.address);
    console.log(`  This computer:  http://localhost:${port}/`);
    for (const ip of ips) console.log(`  iPhone / iPad: http://${ip}:${port}/`);
    console.log(`  (or try http://${os.hostname().split('.')[0]}.local:${port}/ if your network supports .local names)`);
    console.log(`\n  Plain-HTTP LAN addresses aren't secure contexts: offline mode, the share sheet, wake lock,`);
    console.log(`  async clipboard and storage persistence are unavailable there. The app detects this and still works.`);
    console.log(`  Progress saved at this address is separate from other addresses — use Backup/Restore to move it.`);
  } else {
    console.log(`  http://${host === '127.0.0.1' ? 'localhost' : host}:${port}/`);
  }
  console.log('\nPress Ctrl+C to stop.\n');
});
