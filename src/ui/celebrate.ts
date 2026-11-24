import { ctx } from '../ctx';

/** Confetti and motion run only when Celebrations is on and the device doesn't ask for reduced motion. */
export function motionOn(): boolean {
  if (ctx.store?.state.settings.celebrations === false) return false;
  try { return !matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } // unknown: stay still
}

interface P { x: number; y: number; vx: number; vy: number; r: number; vr: number; w: number; h: number; c: string; round: boolean; end: number }
interface Rect { x: number; y: number; w: number; h: number }

function palette(): string[] {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string) => cs.getPropertyValue(n).trim();
  const dark = cs.colorScheme.trim() === 'dark'; // styles.css sets exactly one scheme per theme
  // the app's colours plus two warm accents, a shade deeper on light cards so none read as pale specks
  return [v('--accent'), v('--ok'), v('--warn-bar'), dark ? '#f06292' : '#e2457c', dark ? '#ffd54f' : '#f2b705'].filter(Boolean);
}

/**
 * One canvas of falling confetti, inside the card it celebrates (a verdict, a summary, a card set, an
 * exam pass), drawing only in a clipped empty corner of it: it never covers words or controls, and it
 * scrolls with the card and disappears with it.
 */
class Layer {
  canvas: HTMLCanvasElement;
  parts: P[] = [];
  raf = 0;
  last = 0;
  hostSize: { w: number; h: number } | null = null;
  constructor(public host: HTMLElement, public clip: Rect) {
    this.hostSize = { w: host.clientWidth, h: host.clientHeight };
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative'; // the canvas fills the card it celebrates
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'confetti';
    this.canvas.setAttribute('aria-hidden', 'true');
    host.appendChild(this.canvas);
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
      // fade out near every edge of the pocket, so nothing ever looks sliced
      const f = this.clip ? Math.min(14, this.clip.w / 6) : 14; // a narrow pocket (larger text) fades over less of its width
      const edge = this.clip ? Math.max(0, Math.min(1, Math.min(p.x - this.clip.x, this.clip.x + this.clip.w - p.x, p.y - this.clip.y) / f, (this.clip.y + this.clip.h - p.y) / 16)) : 1;
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
  const W = box.width - 16, H = box.height - 8, gap = 20, MIN_W = 48, MIN_H = 48; // clear of the border, and far enough from the words not to read as punctuation
  let best: Rect | null = null;
  // bands of consecutive lines: the free width is set by the widest line reaching into the band
  for (let i = 0; i <= lines.length; i++) {
    const top = i === 0 ? 10 : lines[i - 1].bottom + 4; // clear of the card's top edge, or just below the line above
    let right = 0;
    for (let k = 0; k < i; k++) if (lines[k].bottom + 4 > top) right = Math.max(right, lines[k].right); // taller things that started earlier
    if (W - right - gap < MIN_W) continue;
    for (let j = i; j <= lines.length; j++) {
      const bottom = j === lines.length ? H : lines[j].top - 8; // clear air above the first line that doesn't fit
      const r = { x: right + gap, y: top, w: W - right - gap, h: bottom - top };
      // the biggest pocket wins, but one beside the card's heading (its upper half) counts for more
      const score = (q: Rect) => q.w * q.h * (q.y < H / 2 ? 1.6 : 1);
      if (r.w >= MIN_W && r.h >= MIN_H && (!best || score(r) > score(best))) best = r;
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
    const narrow = clip.w < 90;
    const cx = clip.x + clip.w * (narrow ? 0.5 : 0.62);
    const base = clip.y + (clip.h > 110 ? clip.h * 0.78 : clip.h - 6); // a tall pocket launches higher, beside the words it celebrates
    const room = Math.max(14, Math.min(46, Math.round((clip.w * clip.h) / 350))); // as many pieces as the space can show as a fountain, not a heap
    const power = Math.sqrt(2 * 0.32 * clip.h) * (big ? 0.95 : 0.9); // peaks near the top; the edge fade softens any that go further
    const size = clip.w < 90 ? 0.8 : 0.85; // a narrow pocket (larger text): slightly smaller pieces, not a heap
    const spread = clip.w < 80 ? 20 : narrow ? 30 : big ? 70 : 50;
    layer.add({ count: Math.max(18, Math.min(big ? 46 : 22, room)), x: cx, y: base, angle: -90, spread, power, life: big ? 1500 : 1100, size: Math.max(size, 0.8) }); // a floor, so larger text still gets a visible pop
    if (big && clip.w * clip.h >= 15000) later(() => { if (card.isConnected && layers.has(layer)) layer.add({ count: Math.min(24, Math.round(room / 2)), x: cx, y: base, angle: -90, spread: narrow ? 30 : 90, power: power * 0.9, life: 1200, size }); }, 260);
  }, delay);
}
/** The verdict in a session. */
export const verdictBurst = (verdict: HTMLElement | null | undefined, big: boolean) => { cardBurst(verdict, big); };

// While "Time's up" is on screen the result behind it must not spend its one moment unseen: held, then released when the learner opens it.
let held = false, releasedAt = 0;
export function holdCelebrations(on: boolean) { held = on; if (!on) releasedAt = Date.now(); }
export const celebrationsHeld = () => held;
/** The result was opened straight from the "Time's up" dialog (however long that stayed up). */
export const justReleased = () => Date.now() - releasedAt < 3000;
/** Results and summaries celebrate once, when they first open, not when revisited later. */
export const fresh = (at: number | null | undefined) => !!at && Date.now() - at < 15000;
const celebrated = new Set<string>();
/** True the first time it's asked about `key` (so Back from review doesn't replay a summary's cannons). */
export function firstTime(key: string) { if (celebrated.has(key)) return false; celebrated.add(key); return true; }
