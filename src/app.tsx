import { useEffect, useState } from 'preact/hooks';
import { ctx, useDb } from './ctx';
import { navigate, useRoute } from './router';
import { autoSubmitExpired } from './lib/actions';
import { applyUpdate, onUpdateReady } from './lib/sw-register';
import { DialogHost, ToastHost } from './ui/dialog';
import { Page, TabBar } from './ui/bits';
import { Today } from './screens/Today';
import { Study } from './screens/Study';
import { CardDetail, CardStudy, CardsHub } from './screens/Cards';
import { Progress } from './screens/Progress';
import { Backup, More, Reports, Settings } from './screens/More';
import { About, BlueprintRef, ExamDay, ExamFacts, Sources } from './screens/Reference';
import { Onboarding } from './screens/Onboarding';
import { ExamIntro } from './screens/ExamIntro';
import { ExamRunner } from './screens/ExamRunner';
import { TutorRunner } from './screens/TutorRunner';
import { Results } from './screens/Results';
import { ReviewItem, ReviewList } from './screens/Review';

const TAB_ROOTS = new Set(['today', 'study', 'cards', 'progress', 'more']);

function NotFound() {
  return <Page title="Not found" backTo="today"><p>That screen doesn't exist.</p><a class="btn" href="#/today">Go to Today</a></Page>;
}

export function App() {
  const db = useDb();
  const route = useRoute();
  const [update, setUpdate] = useState(false);
  const [head, ...rest] = route.path;

  // apply theme + text size
  useEffect(() => {
    const el = document.documentElement;
    if (db.settings.theme === 'system') el.removeAttribute('data-theme'); else el.setAttribute('data-theme', db.settings.theme);
    el.setAttribute('data-size', db.settings.textSize);
    const dark = db.settings.theme === 'dark' || (db.settings.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0e1318' : '#f5f6f8');
  }, [db.settings.theme, db.settings.textSize]);

  // first run → onboarding
  useEffect(() => { if (!db.settings.onboarded && head !== 'onboarding') navigate('onboarding', true); }, [db.settings.onboarded, head]);
  useEffect(() => { if (!head && db.settings.onboarded) navigate('today', true); }, [head]);
  // exams whose time ran out while the app was closed are submitted on return
  useEffect(() => {
    autoSubmitExpired();
    const on = () => { if (document.visibilityState === 'visible') autoSubmitExpired(); };
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);
  useEffect(() => onUpdateReady(setUpdate), []);

  let screen;
  let inExam = false;
  switch (head) {
    case 'today': screen = <Today />; break;
    case 'study': screen = <Study />; break;
    case 'cards': screen = rest[0] === 'study' ? <CardStudy /> : <CardsHub query={route.query} />; break;
    case 'card': screen = <CardDetail id={rest[0]} />; break;
    case 'progress': screen = <Progress />; break;
    case 'more': screen = <More />; break;
    case 'settings': screen = <Settings />; break;
    case 'backup': screen = <Backup />; break;
    case 'reports': screen = <Reports />; break;
    case 'about': screen = <About />; break;
    case 'ref': screen = rest[0] === 'blueprint' ? <BlueprintRef /> : rest[0] === 'examday' ? <ExamDay /> : rest[0] === 'sources' ? <Sources /> : <ExamFacts />; break;
    case 'onboarding': screen = <Onboarding step={Number(rest[0]) || 1} />; break;
    case 'start': screen = ['formA', 'formB', 'mixed', 'block'].includes(rest[0]) ? <ExamIntro kind={rest[0] as any} /> : <NotFound />; break;
    case 's': {
      const s = db.sessions[rest[0]];
      if (!s) screen = <Page title="Session" backTo="today"><p>This session no longer exists.</p></Page>;
      else if (s.status === 'submitted') { screen = <Results session={s} />; }
      else if (s.timed) { inExam = true; screen = <ExamRunner session={s} />; }
      else screen = <TutorRunner session={s} />;
      break;
    }
    case 'results': { const s = db.sessions[rest[0]]; screen = s?.result ? <Results session={s} /> : <NotFound />; break; }
    case 'review': {
      const s = db.sessions[rest[0]];
      if (!s?.result) screen = <NotFound />;
      else screen = rest[1] !== undefined ? <ReviewItem session={s} pos={Number(rest[1])} query={route.query} /> : <ReviewList session={s} query={route.query} />;
      break;
    }
    default: screen = head ? <NotFound /> : null;
  }
  const showTabs = TAB_ROOTS.has(head) && !(head === 'cards' && rest[0] === 'study');
  return (
    <>
      <div id="app-root" class="app">
        <a href="#main" class="sr-only" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>Skip to content</a>
        {update && !inExam && (
          <div class="banner info" style={{ margin: 'calc(var(--safe-t) + .5rem) 1rem 0', borderRadius: 12 }} role="status">
            <div class="grow small"><strong>Update ready.</strong> A new version is downloaded.</div>
            <button class="btn small primary" onClick={applyUpdate}>Update now</button>
          </div>
        )}
        {screen}
        {showTabs && <TabBar current={head} />}
      </div>
      <DialogHost />
      <ToastHost />
    </>
  );
}
export { ctx };
