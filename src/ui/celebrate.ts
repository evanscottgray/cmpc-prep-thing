import { ctx } from '../ctx';

/** Confetti and motion run only when Celebrations is on and the device doesn't ask for reduced motion. */
export function motionOn(): boolean {
  if (ctx.store?.state.settings.celebrations === false) return false;
  try { return !matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return true; }
}

interface P { x: number; y: number; vx: number; vy: number; r: number; vr: number; w: number; h: number; c: string; round: boolean; end: number }
interface Rect { x: number; y: number; w: number; h: number }

function palette(): string[] {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string) => cs.getPropertyValue(n).trim();
  return [v('--accent'), v('--ok'), v('--warn-bar'), '#f06292', '#ffd54f'].filter(Boolean); // the app's colours plus two warm accents
}

/**
 * One canvas of falling confetti. Two kinds, and neither ever covers words or controls:
 * - the screen layer sits behind cards, text and bars (summary and card-set celebrations);
 * - a card layer lives inside one card and draws only in a clipped empty corner of it, so it
 *   scrolls with the card and disappears with it (the verdict's celebration in a session).
 */
class Layer {
  canvas: HTMLCanvasElement;
  parts: P[] = [];
  raf = 0;
  last = 0;
  hostSize: { w: number; h: number } | null = null;
  constructor(public host: HTMLElement | null, public clip: Rect | null) {
    if (host) {
      this.hostSize = { w: host.clientWidth, h: host.clientHeight };
      if (getComputedStyle(host).position === 'static') host.style.position = 'relative'; // the canvas fills the card it celebrates
    }
    this.canvas = document.createElement('canvas');
    this.canvas.className = host ? 'confetti card-layer' : 'confetti';
    this.canvas.setAttribute('aria-hidden', 'true');
    (host ?? document.body).appendChild(this.canvas);
  }
  size() { return this.host ? { w: this.host.clientWidth, h: this.host.clientHeight } : { w: innerWidth, h: innerHeight }; }
  add(o: { count: number; x: number; y: number; angle: number; spread: number; power: number; life: number; size: number }) {
    const colors = palette();
    for (let i = 0; i < o.count; i++) {
      const a = ((o.angle + (Math.random() - 0.5) * o.spread) * Math.PI) / 180;
      const v = o.power * (0.55 + Math.random() * 0.6);
      const w = (6 + Math.random() * 6) * o.size;
      this.parts.push({ x: o.x, y: o.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3, w, h: w * (0.4 + Math.random() * 0.4), c: colors[i % colors.length], round: Math.random() < 0.25, end: performance.now() + o.life * (0.75 + Math.random() * 0.25) });
    }
    if (!this.raf) this.raf = requestAnimationFrame((t) => this.frame(t));
  }
  frame(t: number) {
    if (this.host && !this.host.isConnected) return this.stop();
    const { w, h } = this.size();
    if (this.hostSize && (w !== this.hostSize.w || h !== this.hostSize.h)) return this.stop(); // the card reflowed (rotation): its empty corner may have moved
    const dpr = Math.min(2, devicePixelRatio || 1);
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) { this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr); } // also after a rotation
    const g = this.canvas.getContext('2d')!;
    const k = Math.min(3, (t - (this.last || t)) / 16.7 || 1); // frames' worth of motion since the last paint (time-based)
    this.last = t;
    const now = performance.now();
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    this.parts = this.parts.filter((p) => now < p.end && p.y < h + 40);
    const drag = Math.pow(0.985, k);
    g.save();
    if (this.clip) { g.beginPath(); g.rect(this.clip.x, this.clip.y, this.clip.w, this.clip.h); g.clip(); }
    for (const p of this.parts) {
      p.vy += 0.32 * k; p.vx *= drag; p.vy *= drag;
      p.x += p.vx * k; p.y += p.vy * k; p.r += p.vr * k;
      g.save();
      const edge = this.clip ? Math.max(0, Math.min(1, (this.clip.y + this.clip.h - p.y) / 16)) : 1; // fade out before the pocket's edge, so nothing looks sliced
      g.globalAlpha = Math.min(1, (p.end - now) / 400) * edge;
      g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c;
      if (p.round) { g.beginPath(); g.arc(0, 0, p.w / 2, 0, Math.PI * 2); g.fill(); }
      else g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2)) + 1); // flutter
      g.restore();
    }
    g.restore();
    if (this.parts.length) this.raf = requestAnimationFrame((tt) => this.frame(tt));
    else this.stop();
  }
  stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0; this.parts = []; this.canvas.remove();
    layers.delete(this);
  }
}

const layers = new Set<Layer>();
const timers = new Set<ReturnType<typeof setTimeout>>();
/** A delayed step that clearConfetti() cancels, so nothing fires after the learner has moved on. */
function later(fn: () => void, ms: number) {
  const t = setTimeout(() => { timers.delete(t); fn(); }, ms);
  timers.add(t);
  return () => { clearTimeout(t); timers.delete(t); };
}

/** Removes all confetti and cancels any still to come (a new question or screen shouldn't be read through it). */
export function clearConfetti() {
  for (const t of timers) clearTimeout(t);
  timers.clear();
  for (const l of [...layers]) l.stop();
}

let screen: Layer | null = null;
/**
 * Throws `count` pieces from (x, y) on the screen layer (behind the content), aimed `angle` degrees
 * (−90 is straight up) within `spread`. `life` is in ms.
 */
export function confetti({ count = 40, x = innerWidth / 2, y = innerHeight / 3, angle = -90, spread = 70, power = 11, life = 2200, size = 1 }: { count?: number; x?: number; y?: number; angle?: number; spread?: number; power?: number; life?: number; size?: number } = {}) {
  if (!motionOn()) return;
  if (!screen || !layers.has(screen)) { screen = new Layer(null, null); layers.add(screen); }
  screen.add({ count, x, y, angle, spread, power, life, size });
}

/**
 * The largest empty area along a card's right edge, in the card's own coordinates, found from the
 * line boxes of its words (and icons). Confetti drawn there is fully visible and can't touch any text
 * or control. Null when the words leave too little room.
 */
function cardPocket(card: HTMLElement): Rect | null {
  const box = card.getBoundingClientRect();
  const lines: { top: number; bottom: number; right: number }[] = [];
  const add = (r: DOMRect, right = r.right) => { if (r.width && r.height) lines.push({ top: r.top - box.top, bottom: r.bottom - box.top, right: right - box.left }); };
  const walk = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    if (!n.textContent?.trim() || n.parentElement?.closest('.sr-only, canvas')) continue;
    range.selectNodeContents(n);
    for (const r of range.getClientRects()) add(r);
  }
  for (const el of card.querySelectorAll('svg, .meter, .btn, img')) add(el.getBoundingClientRect());
  // dividers (a rule above a row) are full-width obstacles at their top edge
  for (const el of card.querySelectorAll('.today-row, hr')) { const r = el.getBoundingClientRect(); lines.push({ top: r.top - box.top - 1, bottom: r.top - box.top + 1, right: box.width }); }
  lines.sort((a, b) => a.top - b.top);
  const W = box.width - 6, H = box.height - 8, gap = 10, MIN_W = 48, MIN_H = 52;
  let best: Rect | null = null;
  // bands of consecutive lines: the free width is set by the widest line reaching into the band
  for (let i = 0; i <= lines.length; i++) {
    const top = i === 0 ? 10 : lines[i - 1].bottom + 4; // clear of the card's top edge, or just below the line above
    let right = 0;
    for (let k = 0; k < i; k++) if (lines[k].bottom + 4 > top) right = Math.max(right, lines[k].right); // taller things that started earlier
    if (W - right - gap < MIN_W) continue;
    for (let j = i; j <= lines.length; j++) {
      const bottom = j === lines.length ? H : lines[j].top - 4; // just above the first line that doesn't fit
      const r = { x: right + gap, y: top, w: W - right - gap, h: bottom - top };
      if (r.w >= MIN_W && r.h >= MIN_H && (!best || r.w * r.h > best.w * best.h)) best = r;
      if (j === lines.length) break;
      right = Math.max(right, lines[j].right);
      if (W - right - gap < MIN_W) break;
    }
  }
  return best;
}

/**
 * A card's celebration: a fountain in its empty corner, bigger (and twice) for a bigger moment
 * (a run of 3/5/10, the daily goal, a strong summary). With no room in the card, nothing is thrown:
 * the glow and the words carry it.
 */
export function cardBurst(card: HTMLElement | null | undefined, big: boolean, delay = 450) {
  if (!card || !motionOn()) return () => {};
  return later(() => { // after the card's pop has settled, so it is measured at its real size
    if (!card.isConnected) return;
    const clip = cardPocket(card);
    if (!clip) return;
    const layer = new Layer(card, clip); layers.add(layer);
    const cx = clip.x + clip.w / 2, base = clip.y + clip.h - 6; // a little above the bottom, so it doesn't sit on the next line
    const power = Math.sqrt(2 * 0.32 * clip.h) * (big ? 1.1 : 0.9); // apex near the top of the pocket
    layer.add({ count: big ? 46 : 22, x: cx, y: base, angle: -90, spread: big ? 70 : 50, power, life: big ? 1500 : 1100, size: 0.85 });
    if (big) later(() => { if (card.isConnected && layers.has(layer)) layer.add({ count: 24, x: cx, y: base, angle: -90, spread: 90, power: power * 0.9, life: 1200, size: 0.85 }); }, 260);
  }, delay);
}
/** The verdict in a session. */
export const verdictBurst = (verdict: HTMLElement | null | undefined, big: boolean) => { cardBurst(verdict, big); };

/** Celebrates a card that just opened: arcs out of its lower corners into the open space beneath it, behind the content. */
export function bigCelebration(below?: Element | null) {
  const b = below?.getBoundingClientRect();
  if (b && b.bottom < innerHeight - 80) {
    confetti({ count: 36, x: b.left + 24, y: b.bottom + 12, angle: -125, spread: 60, power: 7, life: 1900 });
    confetti({ count: 36, x: b.right - 24, y: b.bottom + 12, angle: -55, spread: 60, power: 7, life: 1900 });
    confetti({ count: 24, x: b.left + b.width / 2, y: b.bottom + 12, angle: -90, spread: 120, power: 6, life: 1700 });
    return;
  }
  const p = Math.sqrt(innerHeight) * 0.55; // no card, or it fills the screen: two cannons from the lower corners
  confetti({ count: 40, x: 0, y: innerHeight * 0.95, angle: -68, spread: 30, power: p, life: 1600 });
  confetti({ count: 40, x: innerWidth, y: innerHeight * 0.95, angle: -112, spread: 30, power: p, life: 1600 });
}
/** Schedules a screen's celebration; returns the cleanup so leaving the screen cancels it. */
export function celebrateSoon(ms = 250, below?: () => Element | null) {
  return later(() => bigCelebration(below?.()), ms);
}

/** Results and summaries celebrate once, when they first open, not when revisited later. */
export const fresh = (at: number | null | undefined) => !!at && Date.now() - at < 15000;
const celebrated = new Set<string>();
/** True the first time it's asked about `key` (so Back from review doesn't replay a summary's cannons). */
export function firstTime(key: string) { if (celebrated.has(key)) return false; celebrated.add(key); return true; }
