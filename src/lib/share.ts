import { detectCaps } from './caps';

/** Hands a text file to the share sheet when available (iOS: Save to Files, AirDrop, Mail…), else downloads it. */
export async function shareOrDownload(filename: string, text: string, mime = 'application/json'): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const caps = detectCaps();
  if (caps.shareFiles) {
    try {
      const file = new File([text], filename, { type: mime });
      await navigator.share({ files: [file], title: filename });
      return 'shared';
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return 'cancelled';
      // fall through to download
    }
  }
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return 'downloaded';
}

/** Copies text; falls back to a hidden textarea + execCommand for non-secure contexts. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* fall back */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0'; ta.style.fontSize = '16px';
    document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy'); ta.remove();
    return ok;
  } catch { return false; }
}
