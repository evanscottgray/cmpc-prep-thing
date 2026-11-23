import type { ComponentChildren } from 'preact';
import { useEffect, useLayoutEffect, useState } from 'preact/hooks';
import { back, takeRestore } from '../router';
import { IcBack, IcCards, IcChevron, IcMore, IcProgress, IcStudy, IcToday } from './icons';

export function TopBar({ title, backTo, onBack, right, noBack }: { title: string; backTo?: string; onBack?: () => void; right?: ComponentChildren; noBack?: boolean }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 4);
    on(); window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  useEffect(() => { document.title = `${title} · CMPC Prep`; }, [title]);
  return (
    <header class={`topbar${scrolled ? ' scrolled' : ''}`}>
      <div class="side">{!noBack && <button class="icon-btn" onClick={() => (onBack ? onBack() : back(backTo))} aria-label="Back"><IcBack /><span class="small">Back</span></button>}</div>
      <h1 tabIndex={-1}>{title}</h1>
      <div class="side right">{right}</div>
    </header>
  );
}

export function Page({ title, children, backTo, onBack, right, noBack, tabs = true, wide }: { title: string; children: ComponentChildren; backTo?: string; onBack?: () => void; right?: ComponentChildren; noBack?: boolean; tabs?: boolean; wide?: boolean }) {
  useLayoutEffect(() => { window.scrollTo(0, takeRestore() ?? 0); }, [title]); // before paint, so the old position never flashes
  useEffect(() => { document.querySelector<HTMLElement>('.topbar h1')?.focus({ preventScroll: true }); }, [title]);
  return (
    <>
      <TopBar title={title} backTo={backTo} onBack={onBack} right={right} noBack={noBack} />
      <main class={`page${tabs ? '' : ' notabs'}${wide ? ' wide' : ''}`} id="main" tabIndex={-1}>{children}</main>
    </>
  );
}

const TABS = [
  { to: 'today', label: 'Today', Ic: IcToday },
  { to: 'study', label: 'Study', Ic: IcStudy },
  { to: 'cards', label: 'Cards', Ic: IcCards },
  { to: 'progress', label: 'Progress', Ic: IcProgress },
  { to: 'more', label: 'More', Ic: IcMore },
];
export function TabBar({ current }: { current: string }) {
  return (
    <div class="tabbar">
      <nav aria-label="Main">
        {TABS.map(({ to, label, Ic }) => (
          <a href={`#/${to}`} aria-current={current === to ? 'page' : undefined}><Ic /><span>{label}</span></a>
        ))}
      </nav>
    </div>
  );
}

export function Meter({ value, label, tick }: { value: number | null; label: string; tick?: number }) {
  const v = value === null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div class="meter" role="img" aria-label={`${label}: ${value === null ? 'no data' : `${Math.round(v)}%`}`}>
      <span class={tick !== undefined && value !== null && value < tick ? 'below' : undefined} style={{ width: `${v}%` }} />
      {tick !== undefined && <i class="tick" style={{ left: `${tick}%` }} aria-hidden="true" />}
    </div>
  );
}

/** One area of the blueprint: name, percent, count, and a bar against the practice target. Under four answers it shows only the count. */
export function AreaBar({ label, sub, acc, target, verb, href, onClick }: { label: string; sub?: string; verb?: string; acc: { c: number; n: number } | undefined; target: number; href?: string; onClick?: () => void }) {
  const few = !acc || acc.n < 4;
  const p = acc?.n ? Math.round((100 * acc.c) / acc.n) : null;
  const inner = (
    <>
      <span class="bar-label">{label}</span>
      <span class="bar-val">{p === null ? '—' : few ? '' : `${p}%`}</span>
      <span class="bar-sub">{[sub, acc?.n ? `${acc.c}/${acc.n} correct` : 'No answers yet'].filter(Boolean).join(' · ')}{!few && p !== null && p < target && <> · <strong class="below-tag keep">Below target</strong></>}</span>
      {(href || onClick) && <span class="bar-verb">{verb}<IcChevron class="chev" /></span>}
      {!few && <Meter value={p} label={label} tick={target} />}
    </>
  );
  if (href) return <a class="bar-row" href={href}>{inner}</a>;
  return onClick ? <button class="bar-row" onClick={onClick}>{inner}</button> : <div class="bar-row">{inner}</div>;
}

export function Seg<T extends string>({ name, value, options, onChange, label }: { name: string; value: T; options: { v: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div class="seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <label>
          <input type="radio" name={name} value={o.v} checked={value === o.v} onChange={() => onChange(o.v)} />
          <span>{o.label}</span>
        </label>
      ))}
    </div>
  );
}

export function Stepper({ value, min, max, step = 1, onChange, label, suffix = '' }: { value: number; min: number; max: number; step?: number; onChange: (v: number) => void; label: string; suffix?: string }) {
  return (
    <div class="stepper" role="group" aria-label={label}>
      <button class="btn small" onClick={() => onChange(Math.max(min, value - step))} disabled={value <= min} aria-label={`Decrease ${label}`}>−</button>
      <output aria-live="polite">{value}{suffix}</output>
      <button class="btn small" onClick={() => onChange(Math.min(max, value + step))} disabled={value >= max} aria-label={`Increase ${label}`}>+</button>
    </div>
  );
}

export function ListLink({ href, onClick, title, sub, right, icon }: { href?: string; onClick?: () => void; title: ComponentChildren; sub?: ComponentChildren; right?: ComponentChildren; icon?: ComponentChildren }) {
  const inner = (
    <>
      {icon}
      <span class="li-main"><span class="li-title">{title}</span>{sub && <span class="li-sub" style={{ display: 'block' }}>{sub}</span>}</span>
      {right}
      <IcChevron class="chev" />
    </>
  );
  return href ? <a class="list-item" href={href}>{inner}</a> : <button class="list-item" onClick={onClick}>{inner}</button>;
}

export const Verify = () => <p class="verify"><strong>Verify against AASP's current candidate handbook.</strong> These notes summarize publicly described exam facts and may change.</p>;
