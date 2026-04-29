/**
 * Base folder for uploaded attachments, relative to the bucket root.
 * Configure with `VITE_FIREBASE_STORAGE_ATTACHMENTS_PREFIX` (no leading/trailing `/`).
 */
export function getAttachmentsStoragePrefix(): string {
  const raw = import.meta.env
    .VITE_FIREBASE_STORAGE_ATTACHMENTS_PREFIX as string | undefined
  const t = (raw && String(raw).trim()) || 'attachments'
  return t.replace(/^\/+|\/+$/g, '')
}
