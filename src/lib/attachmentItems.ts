export type StorageLinkAttachment = {
  kind: 'link'
  description: string
  url: string
}

export type StorageFileAttachment = {
  kind: 'file'
  description: string
  storagePath: string
  fileName: string
}

export type StorageAttachmentItem =
  | StorageLinkAttachment
  | StorageFileAttachment

export function newLinkAttachmentItem(): StorageAttachmentItem {
  return { kind: 'link', description: '', url: '' }
}

export function newFileAttachmentItem(): StorageAttachmentItem {
  return { kind: 'file', description: '', storagePath: '', fileName: '' }
}

export function parseJsonAttachmentItems(
  raw: unknown,
): StorageAttachmentItem[] | undefined {
  if (raw == null) return undefined
  let v: unknown = raw
  if (typeof raw === 'string') {
    try {
      v = JSON.parse(raw) as unknown
    } catch {
      return undefined
    }
  }
  if (!Array.isArray(v)) return undefined
  const out: StorageAttachmentItem[] = []
  for (const it of v) {
    if (!it || typeof it !== 'object') continue
    const o = it as Record<string, unknown>
    if (o.kind === 'link' && typeof o.url === 'string') {
      out.push({
        kind: 'link',
        description: typeof o.description === 'string' ? o.description : '',
        url: o.url,
      })
    } else if (o.kind === 'file' && typeof o.storagePath === 'string') {
      out.push({
        kind: 'file',
        description: typeof o.description === 'string' ? o.description : '',
        storagePath: o.storagePath,
        fileName: typeof o.fileName === 'string' ? o.fileName : 'file',
      })
    }
  }
  return out
}

export function serializeAttachmentForDb(
  items: StorageAttachmentItem[],
): StorageAttachmentItem[] {
  const out: StorageAttachmentItem[] = []
  for (const it of items) {
    if (it.kind === 'link' && it.url.trim()) {
      out.push({
        kind: 'link',
        description: it.description.trim(),
        url: it.url.trim(),
      })
    } else if (it.kind === 'file' && it.storagePath.trim()) {
      out.push({
        kind: 'file',
        description: it.description.trim(),
        storagePath: it.storagePath.trim(),
        fileName: it.fileName.trim() || 'file',
      })
    }
  }
  return out
}

export function listStoragePathsFromItems(
  items: StorageAttachmentItem[],
): string[] {
  return items
    .filter((x): x is StorageFileAttachment => x.kind === 'file')
    .map((x) => x.storagePath)
    .filter(Boolean)
}
