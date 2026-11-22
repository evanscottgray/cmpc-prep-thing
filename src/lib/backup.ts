import type { DbState } from '../types';
import { SCHEMA, emptyState, DEFAULT_SETTINGS } from './store';

export interface BackupFile { app: 'cmpc-prep'; kind: 'backup'; schema: number; exportedAt: string; appVersion: string; contentVersion: string; state: DbState }

export function makeBackup(state: DbState, appVersion: string, contentVersion: string, now = Date.now()): BackupFile {
  return { app: 'cmpc-prep', kind: 'backup', schema: SCHEMA, exportedAt: new Date(now).toISOString(), appVersion, contentVersion, state: JSON.parse(JSON.stringify(state)) };
}
export function backupFilename(now = Date.now()): string {
  const d = new Date(now);
  const p = (n: number) => String(n).padStart(2, '0');
  return `cmpc-prep-backup-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
}

/** Parses and validates a backup file. Throws with a readable message when it isn't usable. */
export function parseBackup(text: string): BackupFile {
  let data: any;
  try { data = JSON.parse(text); } catch { throw new Error('This file is not valid JSON.'); }
  if (!data || data.app !== 'cmpc-prep' || data.kind !== 'backup') throw new Error('This is not a CMPC Prep backup file.');
  if (typeof data.schema !== 'number' || data.schema > SCHEMA) throw new Error('This backup was made by a newer version of the app. Update the app, then restore.');
  const s = data.state;
  if (!s || typeof s !== 'object' || !Array.isArray(s.attempts) || typeof s.sessions !== 'object' || typeof s.settings !== 'object') throw new Error('The backup is missing required data.');
  const base = emptyState();
  data.state = {
    ...base, ...s,
    settings: { ...DEFAULT_SETTINGS, ...s.settings },
    srs: s.srs ?? {}, cardSrs: s.cardSrs ?? {}, reports: s.reports ?? [], hidden: s.hidden ?? [], meta: s.meta ?? base.meta,
  };
  return data as BackupFile;
}

export function summarize(state: DbState) {
  const sessions = Object.values(state.sessions);
  return {
    attempts: state.attempts.length,
    exams: sessions.filter((s) => s.status === 'submitted' && ['formA', 'formB', 'mixed'].includes(s.kind)).length,
    sessions: sessions.length,
    reviews: Object.keys(state.srs).length + Object.keys(state.cardSrs).length,
    reports: state.reports.length,
  };
}
