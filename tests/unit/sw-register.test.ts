import { describe, expect, it } from 'vitest';
import { onUpdateReady, watchRegistration } from '../../src/lib/sw-register';

class Worker extends EventTarget { state = 'installing'; set(s: string) { this.state = s; this.dispatchEvent(new Event('statechange')); } }
class Reg extends EventTarget { active: Worker | null = null; waiting: Worker | null = null; installing: Worker | null = null; found(w: Worker) { this.installing = w; this.dispatchEvent(new Event('updatefound')); } }
const watch = (r: Reg) => watchRegistration(r as unknown as ServiceWorkerRegistration);

describe('update detection', () => {
  it('stays quiet on a first install, even if the worker is already active when "installed" is delivered', () => {
    let ready = false; const off = onUpdateReady((r) => { ready = r; });
    const r = new Reg(), w = new Worker();
    watch(r); r.found(w);
    r.active = w; // activated and claimed the page before the event below reached it
    w.set('installed'); w.set('activated');
    expect(ready).toBe(false); off();
  });
  it('reports a real update and clears it once activated', () => {
    let ready = false; const off = onUpdateReady((r) => { ready = r; });
    const r = new Reg(), w = new Worker(); r.active = new Worker();
    watch(r); r.found(w);
    expect(ready).toBe(false);
    w.set('installed'); expect(ready).toBe(true);
    w.set('activated'); expect(ready).toBe(false); off();
  });
  it('sees updates already waiting, or already installing, when it starts', () => {
    let ready = false; const off = onUpdateReady((r) => { ready = r; });
    const a = new Reg(); a.active = new Worker(); a.waiting = new Worker(); watch(a);
    expect(ready).toBe(true);
    const b = new Reg(), w = new Worker(); b.active = new Worker(); b.installing = w; watch(b);
    w.set('installed'); expect(ready).toBe(true);
    w.set('activated'); expect(ready).toBe(false); off();
  });
});
