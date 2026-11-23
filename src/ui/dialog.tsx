// In-app dialogs (never browser alert/confirm). Promise-based confirm/alert plus a generic modal.
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { createPortal } from 'preact/compat';

let openCount = 0;
import { IcX } from './icons';

export function Modal({ title, onClose, children, wide, sheet, aside, labelledBy, closeLabel = 'Close', dismissable = true }: {
  title: string; onClose: () => void; children: ComponentChildren; wide?: boolean; sheet?: boolean; aside?: ComponentChildren; labelledBy?: string; closeLabel?: string; dismissable?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const id = labelledBy ?? `dlg-${title.replace(/\W+/g, '-').toLowerCase()}`;
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current!;
    const first = el.querySelector<HTMLElement>('[data-autofocus]') ?? el.querySelector<HTMLElement>('h2');
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissable) { e.preventDefault(); onClose(); }
      if (e.key === 'Tab') {
        const f = [...el.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((x) => !x.hasAttribute('disabled'));
        if (!f.length) return;
        const a = f[0], z = f[f.length - 1];
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
        else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    const app = document.getElementById('app-root') as (HTMLElement & { inert?: boolean }) | null;
    openCount++;
    if (app) { app.setAttribute('aria-hidden', 'true'); app.inert = true; }
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      openCount = Math.max(0, openCount - 1);
      if (openCount === 0) {
        if (app) { app.removeAttribute('aria-hidden'); app.inert = false; }
        document.body.style.overflow = '';
      }
      // the opener may be gone (a menu that closed as this opened): fall back to the exam menu button or the page title
      if (prev?.isConnected && prev !== document.body) prev.focus();
      else (document.getElementById('exam-menu') ?? document.querySelector<HTMLElement>('.topbar h1'))?.focus({ preventScroll: true });
    };
  }, []);
  return createPortal(
    <div class="overlay" onClick={(e) => { if (dismissable && e.target === e.currentTarget) onClose(); }}>
      <div class={`dialog${wide ? ' wide' : ''}${sheet ? ' sheet' : ''}`} role="dialog" aria-modal="true" aria-labelledby={id} ref={ref}>
        <div class="dialog-head">
          <h2 id={id} tabIndex={-1}>{title}</h2>
          {aside}
          {dismissable && <button class="icon-btn" onClick={onClose} aria-label={closeLabel}><IcX /></button>}
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

type Req = { kind: 'confirm' | 'alert'; title: string; body?: ComponentChildren; ok?: string; cancel?: string; danger?: boolean; resolve: (v: boolean) => void };
let push: ((r: Req) => void) | null = null;

let clear: (() => void) | null = null;
/** Dismisses any open in-app dialog (as Cancel), e.g. when time runs out behind it. */
export function clearDialogs() { clear?.(); }
export function confirmDialog(o: { title: string; body?: ComponentChildren; ok?: string; cancel?: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => push ? push({ kind: 'confirm', ...o, resolve }) : resolve(false));
}
export function alertDialog(o: { title: string; body?: ComponentChildren; ok?: string }): Promise<boolean> {
  return new Promise((resolve) => push ? push({ kind: 'alert', ...o, resolve }) : resolve(true));
}

export function DialogHost() {
  const [q, setQ] = useState<Req[]>([]);
  useEffect(() => { push = (r) => setQ((x) => [...x, r]); return () => { push = null; }; }, []);
  const all = useRef(q); all.current = q;
  useEffect(() => { clear = () => { for (const r of all.current) r.resolve(false); setQ([]); }; return () => { clear = null; }; }, []);
  const cur = q[0];
  if (!cur) return null;
  const done = (v: boolean) => { cur.resolve(v); setQ((x) => x.slice(1)); };
  return (
    <Modal key={cur.title} title={cur.title} onClose={() => done(false)} dismissable={cur.kind === 'confirm'}>
      {typeof cur.body === 'string' ? <p>{cur.body}</p> : cur.body}
      <div class="btn-row">
        {cur.kind === 'confirm' && <button class="btn" data-autofocus={cur.danger || undefined} onClick={() => done(false)}>{cur.cancel ?? 'Cancel'}</button>}
        <button class={`btn ${cur.danger ? 'danger solid' : 'primary'}`} data-autofocus={!cur.danger || undefined} onClick={() => done(true)}>{cur.ok ?? 'OK'}</button>
      </div>
    </Modal>
  );
}

let toastPush: ((m: string) => void) | null = null;
export function toast(m: string) { toastPush?.(m); }
export function ToastHost() {
  const [m, setM] = useState<string | null>(null);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    toastPush = (x) => { setM(x); clearTimeout(t); t = setTimeout(() => setM(null), 3200); };
    return () => { toastPush = null; clearTimeout(t); };
  }, []);
  return <div aria-live="polite" role="status" class="sr-live">{m && <div class="toast">{m}</div>}</div>;
}
