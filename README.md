# CMPC Prep

A mobile-first, offline study and exam-simulation app for one person preparing for the Certified Mental Performance Consultant (CMPC®) exam. Built for Safari on iPhone and iPad.

> Unofficial study tool. Not affiliated with or endorsed by AASP. CMPC® is a registered trademark of the Association for Applied Sport Psychology. All questions are original practice items, not actual exam questions. Scores are estimates.

**Live:** https://evanscottgray.github.io/cmpc-prep-thing/ (open in Safari, then Share → Add to Home Screen).

## What's inside

- **Question bank** — 364 original four-option items (Form A, Form B, drill pool), each with a rationale for every option, a takeaway, and 1–2 citations from a single reference registry. Both forms match the 100-item blueprint grid exactly, plus 15 hidden unscored items.
- **Exam simulation** — 115 items / 90 minutes on a wall-clock timer, hidden unscored items, flag, strike-out, navigator, no feedback until submit, auto-submit at zero, strict or coached mode, exact resume. Full exams can also be taken with double time (counted like a standard sitting) or untimed (scored, with a note that the score may run high).
- **Study** — weak-area drills (blueprint × accuracy), domain / knowledge-group / missed / flagged / unseen drills in tutor or timed mode, 23-item exam-pace blocks, 10-item quick quizzes, spaced review timed to the exam date, 121 concept cards with spaced review, and a **flash drill**: short rounds of multiple-choice and true/false recall facts (each grounded in a concept card) with the reason after every answer, kept apart from exam scores.
- **Today and Progress** — one recommended session a day based on the exam date; mastery, score history, pacing, coverage, and a labelled readiness estimate.
- **Data safety** — IndexedDB with a synchronous mirror of the running exam, persistence request, backup/restore to a file, weekly backup reminder.

Stack: Vite + Preact + TypeScript, no runtime dependencies beyond Preact, system fonts, hand-written service worker. JS ≈ 42 KB gzipped; the question bank is a separate JSON file (~1 MB uncompressed) cached for offline use.

## Requirements

- Node 20+ (developed on Node 22) and npm.
- Docker, only for the browser tests (Playwright's WebKit needs Ubuntu libraries; tests run in the official `mcr.microsoft.com/playwright:v1.65.1-noble` image).

## Run, test, build

```sh
npm ci                 # install exact dependency versions
npm run dev            # dev server at http://127.0.0.1:5173 (no service worker in dev)
npm run validate       # bank validation: structure, grid, overlap, drill depth, near-dupes, cueing, refs
npm test               # unit tests (Vitest)
npm run typecheck      # TypeScript
npm run build          # validate → compile content → vite build → dist/ + release/cmpc-prep-v<version>-dist.zip
npm run e2e            # build, then WebKit end-to-end tests at 4 device sizes (Docker)
```

The build is deterministic: the same commit produces byte-identical `dist/` (asset hashes, `sw.js` version and the zip are content-derived).

## Preview the production build

On this computer (localhost is a secure context, so offline mode and installation work):

```sh
npm run build
npm run preview        # http://localhost:4173/
```

On iPhone/iPad over Wi-Fi:

```sh
npm run preview:lan    # prints http://<this-computer's-LAN-IP>:4173/
```

Open the printed address in Safari on a device on the same network. Notes:

- The port is fixed at **4173** (override with `PORT=5000 npm run preview:lan`). The IP comes from your router; give this computer a DHCP reservation if you want the address to stay the same across days. The script also prints a `<hostname>.local` address that works on networks with mDNS.
- A plain-HTTP LAN address is **not a secure context**: service worker (offline mode), the share sheet, screen wake lock, async clipboard, and storage persistence are unavailable there. The app detects each one and falls back (backups download instead of opening the share sheet, copying uses a fallback, etc.). Everything else works, but it won't work offline. For the full experience host it over HTTPS — see [docs/HOSTING.md](docs/HOSTING.md).
- Each address keeps its own separate storage. Move progress between addresses with **More → Backup and restore**.
- The firewall on this computer must allow inbound TCP 4173.

## Repository layout

```
content/            question bank (items/*.json), concept cards (cards/*.json),
                    references.json (citation registry), blueprint.json, allocation.json
src/                app (Preact): lib/ = pure logic, screens/, ui/
scripts/            validate-bank, build-content, serve (LAN/local preview), zip-dist,
                    blind-check, make-icons, pw-docker.sh
tests/unit          Vitest logic tests
tests/e2e           Playwright WebKit end-to-end + accessibility
docs/               HOSTING, ITEM_WRITING_GUIDE, QA_REPORT, DECISIONS, content-stats.json
dist/               committed production build (reproducible from the tag)
```

## Docs

- [docs/HOSTING.md](docs/HOSTING.md) — local preview, GitHub Pages (workflow included), other static HTTPS hosts, Home Screen install, moving progress between addresses.
- [docs/ITEM_WRITING_GUIDE.md](docs/ITEM_WRITING_GUIDE.md) — how to write items that match the bank.
- [docs/FLASH_WRITING_GUIDE.md](docs/FLASH_WRITING_GUIDE.md) and [docs/FLASH_PLAN.md](docs/FLASH_PLAN.md) — flash facts: writing rules, and the plan the council reviewed.
- [docs/QA_REPORT.md](docs/QA_REPORT.md) — content stats, validation, blind-check results, device/accessibility checks, known limitations.
- [docs/DECISIONS.md](docs/DECISIONS.md) — decisions made where the brief was ambiguous, and notes for resuming work.

## Fixing a reported item

In the app, **Report a problem** on any question, then **More → Problem reports → Export**. The exported Markdown includes instructions and the full item JSON. Edit the item in `content/items/`, run `npm run validate`, blind-check it, and commit content separately from code.
