import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { storage } from './firebase'
import { getAttachmentsStoragePrefix } from './storageConfig'

const MAX_BYTES = 32 * 1024 * 1024

function sanitizeFileSegment(name: string): string {
  const base = name.split(/[/\\]/).pop() || 'file'
  return base.replace(/[^\w.\-()+ ]/g, '_').replace(/\s+/g, ' ').trim() || 'file'
}

/** Folder under `{prefix}/{uid}/…` in Firebase Storage. */
export type UploadStorageArea = 'proactive' | 'journal' | 'activity'

/**
 * @param pathSegment entity id or `pending/{uuid}` for uploads before the row exists
 */
export async function uploadAreaAttachment(
  userId: string,
  file: File,
  pathSegment: string,
  area: UploadStorageArea,
): Promise<{ storagePath: string; fileName: string }> {
  if (!storage) {
    throw new Error('Firebase Storage is not available.')
  }
  if (file.size > MAX_BYTES) {
    throw new Error('File is too large (max 32 MB).')
  }
  const root = getAttachmentsStoragePrefix()
  const safe = `${Date.now()}_${sanitizeFileSegment(file.name)}`
  const rel = [root, userId, area, pathSegment, safe]
    .map((p) => p.replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/')
  const r = ref(storage, rel)
  await uploadBytes(r, file, { contentType: file.type || undefined })
  return { storagePath: rel, fileName: file.name }
}

/** @deprecated Prefer {@link uploadAreaAttachment} with area `'proactive'`. */
export async function uploadProactiveAttachment(
  userId: string,
  file: File,
  pathSegment: string,
): Promise<{ storagePath: string; fileName: string }> {
  return uploadAreaAttachment(userId, file, pathSegment, 'proactive')
}

export async function deleteStorageAttachment(storagePath: string): Promise<void> {
  if (!storage) return
  if (!storagePath.trim()) return
  try {
    await deleteObject(ref(storage, storagePath))
  } catch {
    // Ignore if already removed or rules deny; caller may retry
  }
}

/** @deprecated Prefer {@link deleteStorageAttachment}. */
export async function deleteProactiveAttachment(
  storagePath: string,
): Promise<void> {
  return deleteStorageAttachment(storagePath)
}

function sanitizeDownloadFileName(name: string): string {
  const base = name.split(/[/\\]/).pop() || 'download'
  const t = base.replace(/[<>:"/\\|?*]/g, '_').trim()
  return t || 'download'
}

/**
 * Open the file in a new tab using the Firebase download URL (from `getDownloadURL`).
 * No `fetch` / `getBytes` in your app, so CORS to the GCS media URL is not used.
 * The new tab will download or show the file depending on the browser and file type.
 */
export async function downloadStorageAttachmentToDevice(
  storagePath: string,
  fileName: string,
): Promise<void> {
  if (!storage) {
    throw new Error('Firebase Storage is not available.')
  }
  const r = ref(storage, storagePath)
  const url = await getDownloadURL(r)
  const safeName = sanitizeDownloadFileName(fileName)

  const w = window.open(url, '_blank', 'noopener,noreferrer')
  if (w) {
    try {
      w.opener = null
    } catch {
      // ignore
    }
    return
  }

  // Pop-up may be blocked: use a real link in the current document.
  const a = document.createElement('a')
  a.href = url
  a.download = safeName
  a.target = '_blank'
  a.rel = 'noopener noreferrer'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

export function downloadProactiveAttachmentAsFile(
  storagePath: string,
  fileName: string,
): Promise<void> {
  return downloadStorageAttachmentToDevice(storagePath, fileName)
}

/** @deprecated Prefer {@link downloadStorageAttachmentToDevice}. */
export async function downloadProactiveAttachmentToDevice(
  storagePath: string,
  fileName: string,
): Promise<void> {
  return downloadStorageAttachmentToDevice(storagePath, fileName)
}

export function isUploadSizeAllowed(file: File): boolean {
  return file.size <= MAX_BYTES
}
