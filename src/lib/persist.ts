import { ctx } from '../ctx';
/** Ask the browser to keep our storage (granted automatically for installed apps on some platforms). */
export async function requestPersistence() {
  try {
    if (!window.isSecureContext || !navigator.storage?.persist) { ctx.store.updateSettings({ persisted: false }); return; }
    const already = await navigator.storage.persisted?.();
    const ok = already || (await navigator.storage.persist());
    ctx.store.updateSettings({ persisted: !!ok });
  } catch { /* unsupported */ }
}
