import { ctx } from '../ctx';

/** Confetti and motion run only when Celebrations is on and the device doesn't ask for reduced motion. */
export function motionOn(): boolean {
  if (ctx.store?.state.settings.celebrations === false) return false;
  try { return !matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return true; }
}

interface P { x: number; y: number; vx: number; vy: number; r: number; vr: number; w: number; h: number; c: string; round: boolean; end: number }
interface Rect { x: number; y: number; w: number; h: number }
/**
 * Two ways to draw, and neither ever covers words or controls:
 * - behind: under cards, text and bars; it shows in the open space of summary screens.
 * - pocket: in front, but clipped to an empty part of one card (the right side of the verdict).
 */
type Layer = { kind: 'behind' } | { kind: 'pocket'; clip: Rect };
let canvas: HTMLCanvasElement | null = null;
let layer: Layer = { kind: 'behind' };
let parts: P[] = [];
let raf = 0;
let last = 0;

function palette(): string[] {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string) => cs.getPropertyValue(n).trim();
  return [v('--accent'), v('--ok'), v('--warn-bar'), '#f06292', '#9575cd', '#4fc3f7', '#ffd54f'].filter(Boolean);
}

function sizeCanvas(c: HTMLCanvasElement) {
  const dpr = Math.min(2, devicePixelRatio || 1);
  const w = Math.round(innerWidth * dpr), h = Math.round(innerHeight * dpr);
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; } // also after a rotation mid-burst
  return dpr;
}

function frame(t: number) {
  const c = canvas!; const g = c.getContext('2d')!;
  const k = Math.min(3, (t - (last || t)) / 16.7 || 1); // frames' worth of motion since the last paint
  last = t;
  const now = performance.now();
  const dpr = sizeCanvas(c);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, innerWidth, innerHeight);
  parts = parts.filter((p) => now < p.end && p.y < innerHeight + 40);
  const drag = Math.pow(0.985, k);
  g.save();
  if (layer.kind === 'pocket') { const r = layer.clip; g.beginPath(); g.rect(r.x, r.y, r.w, r.h); g.clip(); }
  for (const p of parts) {
    p.vy += 0.32 * k; p.vx *= drag; p.vy *= drag;
    p.x += p.vx * k; p.y += p.vy * k; p.r += p.vr * k;
    g.save();
    g.globalAlpha = Math.min(1, (p.end - now) / 400);
    g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c;
    if (p.round) { g.beginPath(); g.arc(0, 0, p.w / 2, 0, Math.PI * 2); g.fill(); }
    else g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2)) + 1); // flutter
    g.restore();
  }
  g.restore();
  if (parts.length) raf = requestAnimationFrame(frame);
  else clearConfetti();
}

/** Removes any confetti still falling (a new question or screen shouldn't be read through it). */
export function clearConfetti() {
  parts = [];
  if (raf) cancelAnimationFrame(raf);
  canvas?.remove(); canvas = null; raf = 0; last = 0;
}

/**
 * Throws `count` pieces from (x, y), aimed `angle` degrees (−90 is straight up) within `spread`.
 * Time-based (`life` in ms), so a slow device doesn't play it in slow motion.
 */
export function confetti({ count = 40, x = innerWidth / 2, y = innerHeight / 3, angle = -90, spread = 70, power = 11, life = 2200, size = 1, into = { kind: 'behind' } as Layer }: { count?: number; x?: number; y?: number; angle?: number; spread?: number; power?: number; life?: number; size?: number; into?: Layer } = {}) {
  if (!motionOn()) return;
  if (canvas && into.kind !== layer.kind) clearConfetti(); // one layer at a time
  layer = into;
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.className = `confetti ${into.kind}`;
    canvas.setAttribute('aria-hidden', 'true');
    sizeCanvas(canvas);
    document.body.appendChild(canvas);
  }
  const colors = palette();
  for (let i = 0; i < count; i++) {
    const a = ((angle + (Math.random() - 0.5) * spread) * Math.PI) / 180;
    const v = power * (0.55 + Math.random() * 0.6);
    const w = (6 + Math.random() * 6) * size;
    parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3, w, h: w * (0.4 + Math.random() * 0.4), c: colors[i % colors.length], round: Math.random() < 0.25, end: performance.now() + life * (0.75 + Math.random() * 0.25) });
  }
  if (!raf) raf = requestAnimationFrame(frame);
}

/**
 * The empty part of the verdict card to the right of its words: confetti there is fully visible
 * and can't cross any text or control. Null when the words fill the card.
 */
function verdictPocket(verdict: Element): Rect | null {
  const box = verdict.getBoundingClientRect();
  // The right edge of the words themselves: each text node's line boxes (block lines like the milestone are full width as elements).
  let right = box.left + 40;
  const walk = document.createTreeWalker(verdict, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    if (!n.textContent?.trim() || (n.parentElement && n.parentElement.closest('.sr-only'))) continue;
    range.selectNodeContents(n);
    for (const r of range.getClientRects()) right = Math.max(right, r.right);
  }
  const x = right + 10, w = box.right - 3 - x;
  return w >= 56 ? { x, y: box.top + 2, w, h: box.height - 4 } : null;
}

/** A correct answer: a small fountain in the verdict card's empty corner. A run of 3/5/10 or the daily goal: a bigger one. */
export function verdictBurst(verdict: Element | null | undefined, big: boolean) {
  if (!verdict || !motionOn()) return;
  // after the verdict's pop settles, so the card is measured at its real size; skipped if the question moved on
  setTimeout(() => { if (verdict.isConnected) burstNow(verdict, big); }, 300);
}
function burstNow(verdict: Element, big: boolean) {
  const clip = verdictPocket(verdict);
  if (!clip) { // the words fill the card: a few pieces from its top edge, behind the content
    const b = verdict.getBoundingClientRect();
    confetti({ count: big ? 30 : 16, x: b.right - 40, y: b.top + 8, angle: -90, spread: 70, power: 7, life: 1100 });
    return;
  }
  const h = clip.h, cx = clip.x + clip.w / 2;
  const power = Math.sqrt(2 * 0.32 * h) * (big ? 1.15 : 0.95); // apex near the top of the card
  confetti({ count: big ? 46 : 22, x: cx, y: clip.y + h, angle: -90, spread: big ? 70 : 50, power, life: big ? 1500 : 1100, size: 0.85, into: { kind: 'pocket', clip } });
  if (big) setTimeout(() => confetti({ count: 24, x: cx, y: clip.y + h, angle: -90, spread: 90, power: power * 0.9, life: 1200, size: 0.85, into: { kind: 'pocket', clip } }), 260);
}

/** Two cannons, behind the content, that peak around the middle of the screen; or from just under a card when one is given. */
export function bigCelebration(below?: Element | null) {
  const b = below?.getBoundingClientRect();
  if (b) {
    // small arcs out of the card's lower corners that fall into the open space beneath it
    confetti({ count: 36, x: b.left + 24, y: b.bottom + 12, angle: -125, spread: 60, power: 7, life: 1900 });
    confetti({ count: 36, x: b.right - 24, y: b.bottom + 12, angle: -55, spread: 60, power: 7, life: 1900 });
    confetti({ count: 24, x: b.left + b.width / 2, y: b.bottom + 12, angle: -90, spread: 120, power: 6, life: 1700 });
    return;
  }
  const p = Math.sqrt(innerHeight) * 0.55;
  confetti({ count: 40, x: 0, y: innerHeight * 0.95, angle: -68, spread: 30, power: p, life: 1600 });
  confetti({ count: 40, x: innerWidth, y: innerHeight * 0.95, angle: -112, spread: 30, power: p, life: 1600 });
}
/** Schedules the cannons for a screen that just opened; returns the cleanup so leaving the screen cancels them. */
export function celebrateSoon(ms = 250, below?: () => Element | null) {
  const t = setTimeout(() => bigCelebration(below?.()), ms);
  return () => clearTimeout(t);
}

/** Results and summaries celebrate once, when they first open, not when revisited later. */
export const fresh = (at: number | null | undefined) => !!at && Date.now() - at < 15000;
const celebrated = new Set<string>();
/** True the first time it's asked about `key` (so Back from review doesn't replay a summary's cannons). */
export function firstTime(key: string) { if (celebrated.has(key)) return false; celebrated.add(key); return true; }
