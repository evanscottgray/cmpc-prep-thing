import { useEffect } from 'preact/hooks';
import type { Session } from '../types';
import { ctx } from '../ctx';
import { back, navigate } from '../router';
import { markOpened } from '../lib/actions';
import { inPlay } from '../lib/scoring';
import { plural } from '../lib/dates';
import { Page } from '../ui/bits';
import { ItemMeta, ItemReview, Verdict } from '../ui/question';
import { IcCheckCircle, IcChevron, IcMinusCircle, IcXCircle } from '../ui/icons';

type F = 'all' | 'incorrect' | 'flagged' | 'unscored';

/** Last item opened per session, so returning to the list lands where you left it. */
const lastOpened = new Map<string, number>();

function filterPositions(s: Session, q: URLSearchParams, f: F = (q.get('f') as F) || 'all'): number[] {
  const d = q.get('d'), k = q.get('k');
  const flags = new Set(s.flags);
  return s.items.map((_, i) => i).filter((i) => {
    const si = s.items[i]; const it = ctx.items.get(si.id);
    if (!it || !inPlay(s, i)) return false;
    if (d && it.domain !== d) return false;
    if (k && it.kg !== k) return false;
    if (f === 'incorrect') return s.responses[i] !== it.answer;
    if (f === 'flagged') return flags.has(i);
    if (f === 'unscored') return !si.scored;
    return true;
  });
}
const qs = (q: URLSearchParams, patch: Record<string, string | null>) => {
  const n = new URLSearchParams(q);
  for (const [k, v] of Object.entries(patch)) { if (v === null || v === '') n.delete(k); else n.set(k, v); }
  const s = n.toString(); return s ? `?${s}` : '';
};

export function ReviewList({ session: s, query }: { session: Session; query: URLSearchParams }) {
  useEffect(() => {
    const pos = lastOpened.get(s.id);
    if (pos === undefined) return;
    lastOpened.delete(s.id);
    requestAnimationFrame(() => { const row = document.getElementById(`rv-${pos}`); row?.scrollIntoView({ block: 'center' }); row?.focus({ preventScroll: true }); });
  }, [s.id]);
  const positions = filterPositions(s, query);
  const f = (query.get('f') as F) || 'all';
  const isExam = ['formA', 'formB', 'mixed'].includes(s.kind);
  const bp = ctx.bank.blueprint;
  const flags = new Set(s.flags);
  const opened = new Set(s.opened);
  const filters: F[] = isExam ? ['all', 'incorrect', 'flagged', 'unscored'] : ['all', 'incorrect', 'flagged'];
  return (
    <Page title={`Review · ${s.title}`} backTo={`results/${s.id}`}>
      <div class="chips" role="group" aria-label="Filter">
        {filters.map((x) => <a class="chip" style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }} role="button" aria-pressed={f === x} href={`#/review/${s.id}${qs(query, { f: x === 'all' ? null : x })}`}>{x[0].toUpperCase() + x.slice(1)} {filterPositions(s, query, x).length}</a>)}
      </div>
      <div class="filters">
        <label><span class="sr-only">Domain</span>
          <select class="input" value={query.get('d') ?? ''} onChange={(e) => navigate(`review/${s.id}${qs(query, { d: (e.target as HTMLSelectElement).value })}`, true)}>
            <option value="">All domains</option>
            {bp.domains.map((d) => <option value={d.id}>{d.id}. {d.name}</option>)}
          </select>
        </label>
        <label><span class="sr-only">Knowledge group</span>
          <select class="input" value={query.get('k') ?? ''} onChange={(e) => navigate(`review/${s.id}${qs(query, { k: (e.target as HTMLSelectElement).value })}`, true)}>
            <option value="">All knowledge groups</option>
            {bp.kgs.map((k) => <option value={k.id}>{k.id}. {k.name}</option>)}
          </select>
        </label>
      </div>
      <p class="small muted" aria-live="polite">{plural(positions.length, 'item')}{isExam && f === 'incorrect' ? ` · ${positions.filter((i) => s.items[i].scored).length} scored, ${positions.filter((i) => !s.items[i].scored).length} unscored` : ''}</p>
      {positions.length > 0 && (
        <div class="list">
          {positions.map((i) => {
            const si = s.items[i]; const it = ctx.items.get(si.id)!;
            const resp = s.responses[i]; const ok = resp === it.answer; const skipped = resp === undefined;
            const status = ok ? 'Correct' : skipped ? 'Unanswered' : 'Incorrect';
            return (
              <a class="list-item" id={`rv-${i}`} href={`#/review/${s.id}/${i}${qs(query, {})}`}>
                {ok ? <IcCheckCircle class="status-ic ok" /> : skipped ? <IcMinusCircle class="status-ic skip" /> : <IcXCircle class="status-ic bad" />}
                <span class="li-main">
                  <span class="li-title">{i + 1}. {it.topic}</span>
                  <span class="li-sub clip">{it.stem}</span>
                  <span class="li-sub" style={{ display: 'block' }}>{status}{!si.scored && isExam ? ' · unscored' : ''}{flags.has(i) ? ' · flagged' : ''}{opened.has(i) ? ' · reviewed' : ''}</span>
                </span>
                <IcChevron class="chev" />
              </a>
            );
          })}
        </div>
      )}
    </Page>
  );
}

export function ReviewItem({ session: s, pos, query }: { session: Session; pos: number; query: URLSearchParams }) {
  const positions = filterPositions(s, query);
  const idx = positions.indexOf(pos);
  const si = s.items[pos]; const it = si && ctx.items.get(si.id);
  useEffect(() => { lastOpened.set(s.id, pos); markOpened(s.id, pos); window.scrollTo(0, 0); document.getElementById('rv-stem')?.focus({ preventScroll: true }); }, [pos]);
  if (!it) return <Page title="Review" backTo={`review/${s.id}`}><p>This item is no longer in the bank.</p></Page>;
  const resp = s.responses[pos];
  const prev = idx > 0 ? positions[idx - 1] : null, next = idx >= 0 && idx < positions.length - 1 ? positions[idx + 1] : null;
  const q = query.toString() ? `?${query}` : '';
  const isExam = ['formA', 'formB', 'mixed'].includes(s.kind);
  return (
    <Page title={`Question ${pos + 1}`} backTo={`review/${s.id}${q}`} tabs={false}>
      <div class="row between small muted" style={{ marginBottom: '.5rem' }}>
        <span>{idx + 1} of {positions.length} in this view</span>
        <span>{!si.scored && isExam ? 'Unscored trial item · ' : ''}{s.flags.includes(pos) ? 'Flagged' : ''}</span>
      </div>
      <p class="stem" id="rv-stem" tabIndex={-1}>{it.stem}</p>
      <Verdict item={it} si={si} response={resp} />
      <ItemReview item={it} si={si} response={resp} />
      <ItemMeta item={it} />
      <div class="actionbar">
        <button class="btn" disabled={prev === null} onClick={() => prev !== null && navigate(`review/${s.id}/${prev}${q}`, true)}>Previous</button>
        <button class="btn primary" onClick={() => (next === null ? back(`review/${s.id}${q}`) : navigate(`review/${s.id}/${next}${q}`, true))}>{next === null ? 'Done' : 'Next'}</button>
      </div>
    </Page>
  );
}
