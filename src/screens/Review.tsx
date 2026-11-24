import { useEffect } from 'preact/hooks';
import type { Session } from '../types';
import { ctx } from '../ctx';
import { back, historyIndex, navigate } from '../router';
import { finishReview, leftReviewItem, markOpened, missedPositions, openedMisses } from '../lib/actions';
import { inPlay } from '../lib/scoring';
import { plural } from '../lib/dates';
import { Meter, Page } from '../ui/bits';
import { ItemMeta, ItemReview, StemFold, Verdict } from '../ui/question';
import { IcCheckCircle, IcChevron, IcCircle, IcMinusCircle, IcXCircle } from '../ui/icons';

type F = 'all' | 'incorrect' | 'flagged' | 'unscored';

/** Last item opened per session, so returning to the list lands where you left it. */
const lastOpened = new Map<string, number>();
/** History position of the review list a question was opened from, per session. Back returns there only if it is directly below. */
const listAt = new Map<string, number>();

function filterPositions(s: Session, q: URLSearchParams, f: F = (q.get('f') as F) || 'all'): number[] {
  const d = q.get('d'), k = q.get('k');
  const flags = new Set(s.flags);
  return s.items.map((_, i) => i).filter((i) => {
    const si = s.items[i]; const it = ctx.items.get(si.id);
    if (!it || !inPlay(s, i)) return false;
    if (d && it.domain !== d) return false;
    if (k && it.kg !== k) return false;
    if (q.get('s') && !si.scored && f !== 'unscored') return false;
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
    requestAnimationFrame(() => {
      const fin = document.getElementById('rv-finish'); // every miss read: the step left is finishing, so that's where you land
      if (fin) { fin.scrollIntoView({ block: 'center' }); fin.focus({ preventScroll: true }); return; }
      const row = document.getElementById(`rv-${pos}`); row?.scrollIntoView({ block: 'center' }); row?.focus({ preventScroll: true });
    });
  }, [s.id]);
  const positions = filterPositions(s, query);
  const f = (query.get('f') as F) || 'all';
  const isExam = ['formA', 'formB', 'mixed'].includes(s.kind);
  const bp = ctx.bank.blueprint;
  const flags = new Set(s.flags);
  const opened = new Set(s.opened);
  const checklist = s.timed && f === 'incorrect'; // every row is a miss here, so the icon shows read or not yet
  // every miss read, but the review not finished yet (e.g. Back from the last one): finish it from here too
  const canFinish = checklist && !query.get('d') && !query.get('k') && !query.get('s') && !s.reviewedRead && missedPositions(s).length > 0 && openedMisses(s) === missedPositions(s).length;
  const filters: F[] = isExam ? ['all', 'incorrect', 'flagged', 'unscored'] : ['all', 'incorrect', 'flagged'];
  return (
    <Page title={`Review · ${s.title}`} backTo={`results/${s.id}`}>
      <div class="chips wrap" role="group" aria-label="Filter">
        {filters.map((x) => <button class="chip" aria-pressed={f === x} onClick={() => navigate(`review/${s.id}${qs(query, { f: x === 'all' ? null : x, ...(x === 'unscored' ? { s: null } : {}) })}`, true)}>{x[0].toUpperCase() + x.slice(1)} {filterPositions(s, query, x).length}</button>)}
      </div>
      {isExam && query.get('s') && f !== 'unscored' && (
        <p class="small scored-note"><span>Scored questions only, matching the score breakdown.</span><button class="btn small" onClick={() => navigate(`review/${s.id}${qs(query, { s: null })}`, true)}>Include trial questions</button></p>
      )}
      <details class="filter-fold" open={!!(query.get('d') || query.get('k'))}>
      <summary>Filter by domain or group{query.get('d') || query.get('k') ? ' · on' : ''}</summary>
      <div class="filters">
        <label><span class="sr-only">Domain</span>
          <select class="input" value={query.get('d') ?? ''} onChange={(e) => navigate(`review/${s.id}${qs(query, { d: (e.target as HTMLSelectElement).value })}`, true)}>
            <option value="">All domains</option>
            {bp.domains.map((d) => <option value={d.id}>{d.id}. {d.name}</option>)}
          </select>
        </label>
        <label><span class="sr-only">Knowledge group</span>
          <select class="input" value={query.get('k') ?? ''} onChange={(e) => navigate(`review/${s.id}${qs(query, { k: (e.target as HTMLSelectElement).value })}`, true)}>
            <option value="">All groups</option>
            {bp.kgs.map((k) => <option value={k.id}>{k.name}</option>)}
          </select>
        </label>
      </div>
      </details>
      <p class="small muted" aria-live="polite">{checklist ? plural(positions.length, 'miss', 'misses') : plural(positions.length, 'question')}{opened.size ? ` · ${positions.filter((i) => opened.has(i)).length} read` : ''}{isExam && f === 'incorrect' ? ` · ${positions.filter((i) => s.items[i].scored).length} scored, ${positions.filter((i) => !s.items[i].scored).length} unscored` : ''}</p>
      {canFinish && <button id="rv-finish" class="btn primary block mb" onClick={() => { finishReview(s.id); navigate(`results/${s.id}`, true); }}>Finish review</button>}
      {positions.length === 0 && (
        <div class="card"><p>No questions match these filters.</p><button class="btn small" onClick={() => navigate(`review/${s.id}`, true)}>Clear filters</button></div>
      )}
      {positions.length > 0 && (
        <div class="list">
          {positions.map((i) => {
            const si = s.items[i]; const it = ctx.items.get(si.id)!;
            const resp = s.responses[i]; const ok = resp === it.answer; const skipped = resp === undefined;
            const status = ok ? 'Correct' : skipped ? 'Unanswered' : 'Incorrect';
            const group = bp.kgs.find((x) => x.id === it.kg)?.name;
            const tags = [(f !== 'incorrect' || skipped) && status, !si.scored && isExam && f !== 'unscored' && 'Unscored', flags.has(i) && f !== 'flagged' && 'Flagged'].filter(Boolean);
            return (
              <a class="list-item" id={`rv-${i}`} href={`#/review/${s.id}/${i}${qs(query, {})}`} onClick={() => listAt.set(s.id, historyIndex())}>
                {checklist ? (opened.has(i) ? <IcCheckCircle class="status-ic read" /> : <IcCircle class="status-ic skip" />) /* the misses fill in like a checklist as they're read */
                  : ok ? <IcCheckCircle class="status-ic ok" /> : skipped ? <IcMinusCircle class="status-ic skip" /> : <IcXCircle class="status-ic bad" />}
                <span class="li-main">
                  <span class="li-title">{i + 1}. {it.topic}</span>
                  <span class="li-sub clip">{it.stem}</span>
                  <span class="li-sub" style={{ display: 'block' }}>{group}{tags.map((t) => <>{'\u00a0· '}<span class="keep">{t}</span></>)}{opened.has(i) ? <span class="opened read">{'\u00a0· Read'}</span> : checklist && <span class="sr-only">, not read yet</span>}</span>
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
  useEffect(() => {
    lastOpened.set(s.id, pos); markOpened(s.id, pos); window.scrollTo(0, 0); document.getElementById('rv-stem')?.focus({ preventScroll: true });
    return () => leftReviewItem(s.id); // left however it was left (in-app Back, Next, or Safari's back swipe); an app closed mid-read never gets here, so it still reopens
  }, [s.id, pos]);
  if (!it) return <Page title="Review" backTo={`review/${s.id}`}><p>This question is no longer in the bank.</p></Page>;
  const resp = s.responses[pos];
  const prev = idx > 0 ? positions[idx - 1] : null, next = idx >= 0 && idx < positions.length - 1 ? positions[idx + 1] : null;
  const q = query.toString() ? `?${query}` : '';
  const isExam = ['formA', 'formB', 'mixed'].includes(s.kind);
  const toList = () => { leftReviewItem(s.id); if (listAt.get(s.id) === historyIndex() - 1) back(); else navigate(`review/${s.id}${q}`, true); };
  // the reading count and "Finish review" belong to the whole set of misses, not a filtered slice of it
  const misses = s.timed && query.get('f') === 'incorrect' && !query.get('d') && !query.get('k') && !query.get('s') ? missedPositions(s).length : 0;
  const read = misses ? openedMisses(s) : 0;
  // every miss is open now (in whatever order): name the step, and finish on the result it belongs to (exams only)
  const finishing = s.timed && misses > 0 && !s.reviewedRead && read === misses; // timed sessions (tutor modes already showed every rationale)
  const finish = () => { finishReview(s.id); navigate(`results/${s.id}`, true); };
  // while misses are still unread, the main button goes on to the next unread one (wrapping), not through ones already read
  const left = misses && !finishing ? missedPositions(s).filter((i) => i !== pos && !s.opened?.includes(i)) : [];
  const unread = left.find((i) => i > pos) ?? left[0];
  return (
    <Page title={`Question ${pos + 1}`} onBack={toList} tabs={false}>
      {misses > 0 && <div class="session-progress"><Meter value={(100 * read) / misses} label={`${read} of ${misses} misses read`} /></div>}
      <div class="row between small muted" style={{ marginBottom: '.5rem' }}>
        <span>{misses ? `${read} of ${misses} read` : `${idx + 1} of ${positions.length} in this view`}</span>
        <span>{[!si.scored && isExam && 'Unscored trial question', s.flags.includes(pos) && 'Flagged'].filter(Boolean).join(' · ')}</span>
      </div>
      <StemFold key={pos} id="rv-stem" text={it.stem} />{/* like tutor: folded on phones so the explanation is in reach; open on iPad; your choice carries over */}
      <Verdict item={it} si={si} response={resp} />
      <ItemReview item={it} si={si} response={resp} />
      <ItemMeta item={it} />
      <div class="actionbar">
        {prev !== null && <button class="btn" onClick={() => navigate(`review/${s.id}/${prev}${q}`, true)}>Previous</button>}
        <button class="btn primary" onClick={() => { if (finishing) finish(); else if (unread !== undefined) { leftReviewItem(s.id); navigate(`review/${s.id}/${unread}${q}`, true); } else if (next === null) toList(); else { leftReviewItem(s.id); navigate(`review/${s.id}/${next}${q}`, true); } }}>{finishing ? 'Finish review' : unread !== undefined ? (unread === next ? 'Next' : 'Next unread miss') : next === null ? 'Back to list' : 'Next'}</button>
      </div>
    </Page>
  );
}
