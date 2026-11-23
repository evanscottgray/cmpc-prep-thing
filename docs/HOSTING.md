# Hosting guide

CMPC Prep is a static site: the `dist/` folder (or the zip in `release/`) is the whole app. It uses relative paths and hash routing, so it runs from any static host and any subpath (for example `https://example.com/` or `https://example.com/tools/cmpc/`). Nothing is deployed for you — choosing a host is your call.

## 1. Local preview

```sh
npm run build
npm run preview          # http://localhost:4173/ — secure context: offline + install work
npm run preview:lan      # http://<LAN-IP>:4173/ — for iPhone/iPad on the same Wi-Fi
```

The LAN preview is plain HTTP, which browsers don't treat as secure. There, offline mode (service worker), the share sheet, keep-screen-awake, async clipboard, and persistent-storage requests are unavailable; the app detects this and still works fully while the computer is serving it. Use it to try the app on a device, not as the long-term home.

## 2. GitHub Pages

The repo is ready for it: `.github/workflows/pages.yml` checks the app and publishes `dist/` on every push to `main`. The app runs from a project subpath (`https://<account>.github.io/<repo>/`); an end-to-end test covers that, including offline use.

1. Create an empty GitHub repository. On a free account it must be **public** to use Pages; private repositories need a paid plan.
2. Push this repository (`cmpc-prep`, so `.github/` is at the top level) to its `main` branch.
3. In the repository: **Settings → Pages → Build and deployment → Source: GitHub Actions**. If the first run failed because Pages wasn't on yet, re-run it from the **Actions** tab.
4. Open the address in Safari and add it to the Home Screen (section 4).

What becomes public: the site, and on a public repository all source, including every question and key. Even with a private repository, a Pages site is readable by anyone with its address (access control needs GitHub Enterprise Cloud). The page asks search engines not to index it, which is a request, not protection. Your progress stays on your device either way.

Git history is published too, including the author name and email on each commit. To hide the email, set GitHub's `noreply` address before the first push and rewrite the existing commits.

GitHub Pages doesn't allow custom cache headers (files are cached for about ten minutes). That's fine here: the service worker always checks for a new version and downloads it bypassing that cache.

## 3. Other static HTTPS hosts

Any host that serves files over HTTPS works. Requirements: serve `index.html`, `sw.js`, `manifest.webmanifest`, `data/bank.json`, `assets/`, `icons/` as-is. Recommended (not required) headers: `Cache-Control: no-cache` for `index.html`, `sw.js`, `manifest.webmanifest`, and `data/bank.json`; long-lived caching for `assets/*` (file names are content-hashed). No server-side routing is needed.

| Option | How | Notes |
|---|---|---|
| **Netlify** | Drag-and-drop the `dist/` folder (or the zip's contents) in the Netlify dashboard | Free tier; instant HTTPS; can add password protection on paid tiers. |
| **Cloudflare Pages** | Upload `dist/` with "Direct upload" | Free; fast; Cloudflare Access can restrict who can open it. |
| **Vercel** | `vercel deploy dist` or drag-and-drop | Free tier; HTTPS automatic. |
| **Your own server** | Copy `dist/` under any HTTPS virtual host (nginx, Caddy, Apache) | Caddy gets certificates automatically. |
| **Home network with HTTPS** | e.g. Tailscale Serve / Funnel or a reverse proxy with a real certificate in front of `npm run preview` | Keeps it private; needs the computer to be on. |

Privacy: the app makes no network requests after loading and stores everything on the device. Anyone who knows the URL can load the app shell and the question bank, but not your progress.

**Updating:** replace the files and reload. A new version downloads in the background and the app shows "Update ready"; it is applied only when you tap it, and never during a running exam.

## 4. Add to the Home Screen (iPhone / iPad)

1. Open the HTTPS address in **Safari**.
2. Tap **Share** (bottom bar on iPhone, top-right on iPad) → **Add to Home Screen** → **Add**.
3. Open **CMPC Prep** from the Home Screen. It runs full-screen and works offline after this first visit.

Why it matters: Safari can delete website data for sites that aren't installed and haven't been used for about seven days. Installed web apps are treated much more favorably, and the app also asks the browser to make its storage persistent. Keep weekly backups anyway (the app reminds you).

## 5. Moving progress between addresses

Each address — `http://192.168.1.20:4173`, `http://localhost:4173`, `https://your-host.example`, and the Home Screen app — has **its own separate storage**. Progress does not follow you automatically.

To move it:

1. On the old address: **More → Backup and restore → Back up now**. On iPhone/iPad with HTTPS this opens the share sheet (choose *Save to Files*, AirDrop, or Mail); otherwise the file downloads.
2. On the new address (or the Home Screen app): open the app — on first run tap **Restore from a backup instead** on the welcome screen, or go to **More → Backup and restore → Choose backup file…** — and pick the file.
3. Confirm **Replace and restore**. Everything (answers, exams in progress, review schedules, reports, settings) is restored exactly.

Tip: install from the final HTTPS address first, then restore your latest backup there, and keep studying from the Home Screen icon.
