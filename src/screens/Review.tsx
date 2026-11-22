import { useEffect } from 'preact/hooks';
import type { Session } from '../types';
import { ctx } from '../ctx';
import { navigate } from '../router';
import { markReviewed } from '../lib/actions';
import { Page } from '../ui/bits';
import { ItemMeta, ItemReview } from '../ui/question';
import { IcCheckCircle, IcChevron, IcFlagFill, IcMinusCircle, IcXCircle } from '../ui/icons';

type F = 'all' | 'incorrect' | 'flagged' | 'unscored';

function filterPositions(s: Session, q: URLSearchParams): number[] {
  const f = (q.get('f') as F) || 'all';
  const d = q.get('d'), k = q.get('k');
  const flags = new Set(s.flags);
  return s.items.map((_, i) => i).filter((i) => {
    const si = s.items[i]; const it = ctx.items.get(si.id);
    if (!it) return false;
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
  useEffect(() => { markReviewed(s.id); }, [s.id]);
  const positions = filterPositions(s, query);
  const f = (query.get('f') as F) || 'all';
  const isExam = ['formA', 'formB', 'mixed'].includes(s.kind);
  const bp = ctx.bank.blueprint;
  const flags = new Set(s.flags);
  const filters: F[] = isExam ? ['all', 'incorrect', 'flagged', 'unscored'] : ['all', 'incorrect', 'flagged'];
  return (
    <Page title={`Review · ${s.title}`} backTo={`results/${s.id}`}>
      <div class="chips" role="group" aria-label="Filter">
        {filters.map((x) => <a class="chip" style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }} role="button" aria-pressed={f === x} href={`#/review/${s.id}${qs(query, { f: x === 'all' ? null : x })}`}>{x[0].toUpperCase() + x.slice(1)}</a>)}
      </div>
      <div class="row" style={{ gap: '.5rem', marginBottom: '.75rem' }}>
        <label class="grow"><span class="sr-only">Domain</span>
          <select class="input" value={query.get('d') ?? ''} onChange={(e) => navigate(`review/${s.id}${qs(query, { d: (e.target as HTMLSelectElement).value })}`, true)}>
            <option value="">All domains</option>
            {bp.domains.map((d) => <option value={d.id}>Domain {d.id}: {d.name}</option>)}
          </select>
        </label>
        <label class="grow"><span class="sr-only">Knowledge group</span>
          <select class="input" value={query.get('k') ?? ''} onChange={(e) => navigate(`review/${s.id}${qs(query, { k: (e.target as HTMLSelectElement).value })}`, true)}>
            <option value="">All knowledge groups</option>
            {bp.kgs.map((k) => <option value={k.id}>KG {k.id}: {k.name}</option>)}
          </select>
        </label>
      </div>
      <p class="small muted" aria-live="polite">{positions.length} item{positions.length === 1 ? '' : 's'}</p>
      {positions.length > 0 && (
        <div class="list">
          {positions.map((i) => {
            const si = s.items[i]; const it = ctx.items.get(si.id)!;
            const resp = s.responses[i]; const ok = resp === it.answer; const skipped = resp === undefined;
            const status = ok ? 'Correct' : skipped ? 'Unanswered' : 'Incorrect';
            return (
              <a class="list-item" href={`#/review/${s.id}/${i}${qs(query, {})}`}>
                {ok ? <IcCheckCircle class="status-ic ok" /> : skipped ? <IcMinusCircle class="status-ic skip" /> : <IcXCircle class="status-ic bad" />}
                <span class="li-main">
                  <span class="li-title">{i + 1}. {it.topic}</span>
                  <span class="li-sub" style={{ display: 'block' }}>
                    {status} · Domain {it.domain} · KG {it.kg}{!si.scored && isExam ? ' · unscored' : ''}{flags.has(i) ? ' · flagged' : ''}
                  </span>
                </span>
                {flags.has(i) && <IcFlagFill class="status-ic" title="Flagged" />}
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
  useEffect(() => { window.scrollTo(0, 0); document.getElementById('rv-stem')?.focus({ preventScroll: true }); }, [pos]);
  if (!it) return <Page title="Review" backTo={`review/${s.id}`}><p>This item is no longer in the bank.</p></Page>;
  const resp = s.responses[pos];
  const ok = resp === it.answer;
  const prev = idx > 0 ? positions[idx - 1] : null, next = idx >= 0 && idx < positions.length - 1 ? positions[idx + 1] : null;
  const q = query.toString() ? `?${query}` : '';
  const isExam = ['formA', 'formB', 'mixed'].includes(s.kind);
  return (
    <Page title={`Item ${pos + 1}`} backTo={`review/${s.id}${q}`} tabs={false}>
      <div class="row between small muted" style={{ marginBottom: '.5rem' }}>
        <span>{idx + 1} of {positions.length} in this view</span>
        <span>{!si.scored && isExam ? 'Unscored trial item · ' : ''}{s.flags.includes(pos) ? 'Flagged' : ''}</span>
      </div>
      <ItemMeta item={it} />
      <p class="stem" id="rv-stem" tabIndex={-1}>{it.stem}</p>
      <div class={`verdict ${ok ? 'ok' : 'bad'}`}>
        {ok ? <IcCheckCircle /> : resp === undefined ? <IcMinusCircle /> : <IcXCircle />}
        {ok ? 'You answered correctly' : resp === undefined ? 'Not answered (counts as incorrect)' : 'You answered incorrectly'}
      </div>
      <ItemReview item={it} si={si} response={resp} />
      <div class="actionbar">
        <button class="btn" disabled={prev === null} onClick={() => prev !== null && navigate(`review/${s.id}/${prev}${q}`, true)}>Previous</button>
        <button class="btn primary" disabled={next === null} onClick={() => next !== null && navigate(`review/${s.id}/${next}${q}`, true)}>Next</button>
      </div>
    </Page>
  );
}
