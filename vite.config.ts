import { defineConfig, type Plugin } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

// Emits dist/sw.js with a precache list of every built file and a version
// derived from their contents (deterministic: same inputs → same sw.js).
function serviceWorker(): Plugin {
  let outDir = 'dist';
  return {
    name: 'cmpc-sw',
    apply: 'build',
    configResolved(c) { outDir = c.build.outDir; },
    closeBundle() {
      const files: string[] = [];
      const walk = (d: string) => {
        for (const f of fs.readdirSync(d).sort()) {
          const p = path.join(d, f);
          if (fs.statSync(p).isDirectory()) walk(p);
          else files.push(path.relative(outDir, p).split(path.sep).join('/'));
        }
      };
      walk(outDir);
      const precache = files.filter((f) => f !== 'sw.js' && !f.endsWith('.map'));
      const h = crypto.createHash('sha256');
      for (const f of precache) h.update(f).update(fs.readFileSync(path.join(outDir, f)));
      const version = `${pkg.version}-${h.digest('hex').slice(0, 10)}`;
      const urls = ['./', ...precache.filter((f) => f !== 'index.html').map((f) => `./${f}`)];
      const src = fs.readFileSync('src/sw.js', 'utf8')
        .replace('__VERSION__', version)
        .replace('__PRECACHE__', JSON.stringify(urls));
      fs.writeFileSync(path.join(outDir, 'sw.js'), src);
    },
  };
}

export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } },
  resolve: { alias: { react: 'preact/compat', 'react-dom': 'preact/compat' } },
  build: { target: 'safari15', outDir: 'dist', emptyOutDir: true, assetsInlineLimit: 0, sourcemap: false, modulePreload: { polyfill: false } },
  plugins: [serviceWorker()],
  server: { host: '127.0.0.1', port: 5173 },
  test: { include: ['tests/unit/**/*.test.ts'], environment: 'node' },
} as any);
