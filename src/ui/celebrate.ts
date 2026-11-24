import { ctx } from '../ctx';

/** Confetti and motion run only when Celebrations is on and the device doesn't ask for reduced motion. */
export function motionOn(): boolean {
  if (ctx.store?.state.settings.celebrations === false) return false;
  try { return !matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return true; }
}

interface P { x: number; y: number; vx: number; vy: number; r: number; vr: number; w: number; h: number; c: string; round: boolean; end: number }
let canvas: HTMLCanvasElement | null = null;
let parts: P[] = [];
let raf = 0;
let last = 0;

function palette(): string[] {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string) => cs.getPropertyValue(n).trim();
  return [v('--accent'), v('--ok'), v('--warn-bar'), '#f06292', '#9575cd', '#4fc3f7', '#ffd54f'].filter(Boolean);
}

function frame(t: number) {
  const c = canvas!; const g = c.getContext('2d')!;
  const k = Math.min(3, (t - (last || t)) / 16.7 || 1); // frames' worth of motion since the last paint
  last = t;
  const now = performance.now();
  const dpr = c.width / innerWidth;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, innerWidth, innerHeight);
  parts = parts.filter((p) => now < p.end && p.y < innerHeight + 40);
  const drag = Math.pow(0.985, k);
  for (const p of parts) {
    p.vy += 0.32 * k; p.vx *= drag; p.vy *= drag;
    p.x += p.vx * k; p.y += p.vy * k; p.r += p.vr * k;
    g.save();
    g.globalAlpha = Math.min(1, (p.end - now) / 500);
    g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c;
    if (p.round) { g.beginPath(); g.arc(0, 0, p.w / 2, 0, Math.PI * 2); g.fill(); }
    else g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2)) + 1); // flutter
    g.restore();
  }
  if (parts.length) raf = requestAnimationFrame(frame);
  else { c.remove(); canvas = null; raf = 0; last = 0; }
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
export function confetti({ count = 40, x = innerWidth / 2, y = innerHeight / 3, angle = -90, spread = 70, power = 11, life = 2200 }: { count?: number; x?: number; y?: number; angle?: number; spread?: number; power?: number; life?: number } = {}) {
  if (!motionOn()) return;
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.className = 'confetti';
    canvas.setAttribute('aria-hidden', 'true');
    const dpr = Math.min(2, devicePixelRatio || 1);
    canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr;
    document.body.appendChild(canvas);
  }
  const colors = palette();
  for (let i = 0; i < count; i++) {
    const a = ((angle + (Math.random() - 0.5) * spread) * Math.PI) / 180;
    const v = power * (0.55 + Math.random() * 0.6);
    const w = 6 + Math.random() * 6;
    parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3, w, h: w * (0.4 + Math.random() * 0.4), c: colors[i % colors.length], round: Math.random() < 0.25, end: performance.now() + life * (0.75 + Math.random() * 0.25) });
  }
  if (!raf) raf = requestAnimationFrame(frame);
}

/**
 * A correct answer: a small, quick pop from the verdict's check mark, thrown up and outward
 * so it clears the text below within about a second.
 */
export function correctPop(verdict: Element | null | undefined) {
  const icon = verdict?.querySelector('svg') ?? verdict;
  const r = icon?.getBoundingClientRect();
  if (!r) return;
  confetti({ count: 20, x: r.left + r.width / 2, y: r.top + r.height / 2, angle: -70, spread: 120, power: 7, life: 1300 });
}

/** A bigger moment inside a session (a run of 3, 5, 10…, or the daily goal): bursts from both screen edges, not over the text. */
export function edgeBursts(y: number) {
  const p = 5 + Math.sqrt(innerWidth) / 6; // stays in the outer band of the screen
  confetti({ count: 26, x: 0, y, angle: -55, spread: 40, power: p, life: 1500 });
  confetti({ count: 26, x: innerWidth, y, angle: -125, spread: 40, power: p, life: 1500 });
}

/** Two cannons from the lower corners, strong enough to frame the top of the screen on any height. */
export function bigCelebration() {
  const p = Math.sqrt(innerHeight) * 0.75;
  confetti({ count: 70, x: 0, y: innerHeight * 0.9, angle: -62, spread: 36, power: p });
  confetti({ count: 70, x: innerWidth, y: innerHeight * 0.9, angle: -118, spread: 36, power: p });
}

/** Results and summaries celebrate once, when they first open, not when revisited later. */
export const fresh = (at: number | null | undefined) => !!at && Date.now() - at < 15000;
