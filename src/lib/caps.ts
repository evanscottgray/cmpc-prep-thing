// Feature detection. Plain-HTTP LAN addresses aren't secure contexts, so service workers,
// the share sheet, wake lock, async clipboard and storage persistence may be missing — every
// caller checks these and falls back gracefully.
export interface Caps {
  secure: boolean; serviceWorker: boolean; shareFiles: boolean; share: boolean; wakeLock: boolean;
  clipboard: boolean; persist: boolean; standalone: boolean; ios: boolean;
}
export function detectCaps(): Caps {
  const n = navigator as Navigator & { standalone?: boolean };
  const secure = window.isSecureContext === true;
  let shareFiles = false;
  try { shareFiles = !!n.canShare && !!n.share && n.canShare({ files: [new File(['x'], 'x.txt', { type: 'text/plain' })] }); } catch { shareFiles = false; }
  const ios = /iP(hone|ad|od)/.test(n.userAgent) || (n.platform === 'MacIntel' && n.maxTouchPoints > 1);
  return {
    secure,
    serviceWorker: secure && 'serviceWorker' in n,
    shareFiles,
    share: typeof n.share === 'function',
    wakeLock: 'wakeLock' in n,
    clipboard: !!n.clipboard?.writeText,
    persist: !!n.storage?.persist,
    standalone: n.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches === true,
    ios,
  };
}
