import { ctx } from '../ctx';
import { ymd } from '../lib/dates';
import { todayCount } from '../lib/stats';
import { toast } from './dialog';

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
const LIFE = 2600; // ms; time-based so a slow device doesn't play it in slow motion

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

/** Throws `count` pieces from (x, y), aimed `angle` degrees (−90 is straight up) within `spread`. */
export function confetti({ count = 40, x = innerWidth / 2, y = innerHeight / 3, angle = -90, spread = 70, power = 11 }: { count?: number; x?: number; y?: number; angle?: number; spread?: number; power?: number } = {}) {
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
    parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3, w, h: w * (0.4 + Math.random() * 0.4), c: colors[i % colors.length], round: Math.random() < 0.25, end: performance.now() + LIFE * (0.75 + Math.random() * 0.25) });
  }
  if (!raf) raf = requestAnimationFrame(frame);
}

/** A burst from the middle of an element (the verdict, a button), or from the top third of the screen. */
export function burstFrom(el: Element | null | undefined, count = 36) {
  const r = el?.getBoundingClientRect();
  confetti({ count, x: r ? r.left + r.width / 2 : innerWidth / 2, y: r ? r.top + r.height / 2 : innerHeight / 3, spread: 80, power: 9 });
}

/** Two cannons from the bottom corners: daily goal, session complete, an estimated pass. */
export function bigCelebration() {
  confetti({ count: 70, x: 0, y: innerHeight, angle: -60, spread: 40, power: 20 });
  confetti({ count: 70, x: innerWidth, y: innerHeight, angle: -120, spread: 40, power: 20 });
}

/** Results and summaries celebrate once, when they first open, not when revisited later. */
export const fresh = (at: number | null | undefined) => !!at && Date.now() - at < 15000;

const GOAL_KEY = 'cmpc-prep:goal-celebrated';
/**
 * Celebrates the first time today's count reaches the daily target. Already past it when the app
 * opens? Remember that quietly so reopening the app doesn't celebrate again.
 */
export function watchDailyGoal() {
  let first = true;
  const check = () => {
    const st = ctx.store.state;
    if (!st.settings.onboarded) return;
    const today = ymd();
    let seen: string | null = null;
    try { seen = localStorage.getItem(GOAL_KEY); } catch { /* */ }
    if (seen === today) { first = false; return; }
    const n = todayCount(st);
    if (n < st.settings.dailyTarget) { first = false; return; }
    try { localStorage.setItem(GOAL_KEY, today); } catch { /* */ }
    if (first) { first = false; return; }
    setTimeout(() => { bigCelebration(); toast(`Daily goal reached: ${n} questions today. 🎉`); }, 350);
  };
  check();
  ctx.store.subscribe(check);
}
