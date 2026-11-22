// Inline SVG icons (original, simple strokes). All decorative unless given a title.
import type { JSX } from 'preact';
type P = { title?: string; class?: string };
const S = (d: JSX.Element, { title, class: c }: P, fill = false) => (
  <svg viewBox="0 0 24 24" class={c} fill={fill ? 'currentColor' : 'none'} stroke={fill ? 'none' : 'currentColor'} stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden={title ? undefined : 'true'} role={title ? 'img' : undefined} focusable="false">
    {title ? <title>{title}</title> : null}{d}
  </svg>
);
export const IcToday = (p: P) => S(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>, p);
export const IcStudy = (p: P) => S(<><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" /><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5" /></>, p);
export const IcCards = (p: P) => S(<><rect x="3" y="6" width="14" height="14" rx="2" /><path d="M7 3h12a2 2 0 0 1 2 2v12" /></>, p);
export const IcProgress = (p: P) => S(<><path d="M4 20V10" /><path d="M10 20V4" /><path d="M16 20v-7" /><path d="M22 20H2" /></>, p);
export const IcMore = (p: P) => S(<><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></>, p);
export const IcChevron = (p: P) => S(<path d="M9 6l6 6-6 6" />, p);
export const IcBack = (p: P) => S(<path d="M15 6l-6 6 6 6" />, p);
export const IcFlag = (p: P) => S(<><path d="M5 21V4" /><path d="M5 4h11l-2 4 2 4H5" /></>, p);
export const IcFlagFill = (p: P) => S(<path d="M5 21V3h1v1h11l-2.2 4.2L17 12.5H6V21z" />, p, true);
export const IcStrike = (p: P) => S(<><path d="M16.5 6.5A4 4 0 0 0 13 5h-2.5a3.5 3.5 0 0 0 0 7" /><path d="M14 12a3.5 3.5 0 0 1 0 7h-3a4 4 0 0 1-3.5-1.5" /><path d="M3.5 12h17" /></>, p);
export const IcCheck = (p: P) => S(<path d="M5 12.5l4.5 4.5L19 7" />, p);
export const IcX = (p: P) => S(<><path d="M6 6l12 12" /><path d="M18 6L6 18" /></>, p);
export const IcCheckCircle = (p: P) => S(<><circle cx="12" cy="12" r="9.5" /><path d="M7.5 12.5l3 3 6-6.5" /></>, p);
export const IcXCircle = (p: P) => S(<><circle cx="12" cy="12" r="9.5" /><path d="M9 9l6 6" /><path d="M15 9l-6 6" /></>, p);
export const IcMinusCircle = (p: P) => S(<><circle cx="12" cy="12" r="9.5" /><path d="M8 12h8" /></>, p);
export const IcClock = (p: P) => S(<><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2" /><path d="M9 2h6" /></>, p);
export const IcGrid = (p: P) => S(<><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>, p);
export const IcPause = (p: P) => S(<><path d="M9 5v14" /><path d="M15 5v14" /></>, p);
export const IcPlay = (p: P) => S(<path d="M7 4.5v15l12-7.5z" />, p);
export const IcAlert = (p: P) => S(<><path d="M12 3l10 18H2z" /><path d="M12 10v4" /><path d="M12 17.5v.5" /></>, p);
export const IcInfo = (p: P) => S(<><circle cx="12" cy="12" r="9.5" /><path d="M12 11v6" /><path d="M12 7.5v.5" /></>, p);
export const IcShare = (p: P) => S(<><path d="M12 3v13" /><path d="M7.5 7.5L12 3l4.5 4.5" /><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" /></>, p);
export const IcDownload = (p: P) => S(<><path d="M12 3v13" /><path d="M7.5 11.5L12 16l4.5-4.5" /><path d="M4 21h16" /></>, p);
export const IcMenu = (p: P) => S(<><circle cx="12" cy="5" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="12" cy="19" r="1.6" /></>, p);
export const IcEye = (p: P) => S(<><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>, p);
export const IcEyeOff = (p: P) => S(<><path d="M3 3l18 18" /><path d="M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1" /><path d="M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.8 9.8 0 0 0 4.4-1" /></>, p);
export const IcBug = (p: P) => S(<><path d="M4 22l1-5" /><path d="M20 22l-1-5" /><circle cx="12" cy="13" r="6" /><path d="M12 7V3" /><path d="M3 13h3" /><path d="M18 13h3" /></>, p);
export const IcPhone = (p: P) => S(<><rect x="6" y="2" width="12" height="20" rx="2.5" /><path d="M11 18.5h2" /></>, p);
