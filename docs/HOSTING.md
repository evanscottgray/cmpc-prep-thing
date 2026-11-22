# Hosting guide

CMPC Prep is a static site: the `dist/` folder (or `release/cmpc-prep-v1.0.0-dist.zip`) is the whole app. It uses relative paths and hash routing, so it runs from any static host and any subpath (for example `https://example.com/` or `https://example.com/tools/cmpc/`). Nothing is deployed for you — choosing a host is your call.

## 1. Local preview

```sh
npm run build
npm run preview          # http://localhost:4173/ — secure context: offline + install work
npm run preview:lan      # http://<LAN-IP>:4173/ — for iPhone/iPad on the same Wi-Fi
```

The LAN preview is plain HTTP, which browsers don't treat as secure. There, offline mode (service worker), the share sheet, keep-screen-awake, async clipboard, and persistent-storage requests are unavailable; the app detects this and still works fully while the computer is serving it. Use it to try the app on a device, not as the long-term home.

## 2. Static HTTPS hosting options

Any host that serves files over HTTPS works. Requirements: serve `index.html`, `sw.js`, `manifest.webmanifest`, `data/bank.json`, `assets/`, `icons/` as-is. Recommended (not required) headers: `Cache-Control: no-cache` for `index.html`, `sw.js`, `manifest.webmanifest`, and `data/bank.json`; long-lived caching for `assets/*` (file names are content-hashed). No server-side routing is needed.

| Option | How | Notes |
|---|---|---|
| **GitHub Pages** | Push `dist/` contents to a `gh-pages` branch or use a Pages workflow | Free; public URL unless on a paid plan with private Pages. Subpath hosting works. |
| **Netlify** | Drag-and-drop the `dist/` folder (or the zip's contents) in the Netlify dashboard | Free tier; instant HTTPS; can add password protection on paid tiers. |
| **Cloudflare Pages** | Upload `dist/` with "Direct upload" | Free; fast; Cloudflare Access can restrict who can open it. |
| **Vercel** | `vercel deploy dist` or drag-and-drop | Free tier; HTTPS automatic. |
| **Your own server** | Copy `dist/` under any HTTPS virtual host (nginx, Caddy, Apache) | Caddy gets certificates automatically. |
| **Home network with HTTPS** | e.g. Tailscale Serve / Funnel or a reverse proxy with a real certificate in front of `npm run preview` | Keeps it private; needs the computer to be on. |

Privacy: the app makes no network requests after loading and stores everything on the device. Anyone who knows the URL can load the app shell and the question bank, but not your progress.

**Updating:** replace the files and reload. A new version downloads in the background and the app shows "Update ready"; it is applied only when you tap it, and never during a running exam.

## 3. Add to the Home Screen (iPhone / iPad)

1. Open the HTTPS address in **Safari**.
2. Tap **Share** (bottom bar on iPhone, top-right on iPad) → **Add to Home Screen** → **Add**.
3. Open **CMPC Prep** from the Home Screen. It runs full-screen and works offline after this first visit.

Why it matters: Safari can delete website data for sites that aren't installed and haven't been used for about seven days. Installed web apps are treated much more favorably, and the app also asks the browser to make its storage persistent. Keep weekly backups anyway (the app reminds you).

## 4. Moving progress between addresses

Each address — `http://192.168.1.20:4173`, `http://localhost:4173`, `https://your-host.example`, and the Home Screen app — has **its own separate storage**. Progress does not follow you automatically.

To move it:

1. On the old address: **More → Backup and restore → Back up now**. On iPhone/iPad with HTTPS this opens the share sheet (choose *Save to Files*, AirDrop, or Mail); otherwise the file downloads.
2. On the new address (or the Home Screen app): open the app — on first run tap **Restore from a backup instead** on the welcome screen, or go to **More → Backup and restore → Choose backup file…** — and pick the file.
3. Confirm **Replace and restore**. Everything (answers, exams in progress, review schedules, reports, settings) is restored exactly.

Tip: install from the final HTTPS address first, then restore your latest backup there, and keep studying from the Home Screen icon.
