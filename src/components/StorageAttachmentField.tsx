import { useState } from 'react'
import type { User } from 'firebase/auth'
import {
  newFileAttachmentItem,
  newLinkAttachmentItem,
  type StorageAttachmentItem,
} from '../lib/attachmentItems'
import {
  deleteStorageAttachment,
  downloadStorageAttachmentToDevice,
  isUploadSizeAllowed,
  uploadAreaAttachment,
  type UploadStorageArea,
} from '../lib/proactiveAttachmentStorage'
import { isProfilesSupabaseConfigured } from '../lib/profilesSupabase'

export type StorageAttachmentFieldProps = {
  user: User
  canUpload: boolean
  uploadDisabledHint: string
  attachments: StorageAttachmentItem[]
  setAttachments: React.Dispatch<
    React.SetStateAction<StorageAttachmentItem[]>
  >
  attachmentsRef: React.MutableRefObject<StorageAttachmentItem[]>
  uploadArea: UploadStorageArea
  pathSegment: string
  /** e.g. `/proactive/new` */
  isNewEntityRoute: boolean
  /** Saved row exists (false only proactive new before first insert-from-upload). */
  hasPersistedRow: boolean
  /** `immediate`: persist on remove / upload when applicable. `deferred`: local state only until parent saves (activity report new). */
  persistMode: 'immediate' | 'deferred'
  setFeedback: React.Dispatch<
    React.SetStateAction<{ type: 'success' | 'error'; text: string } | null>
  >
  persistAttachments?: (
    next: StorageAttachmentItem[],
  ) => Promise<{ ok: boolean; message?: string }>
  insertEntityWithAttachments?: (
    next: StorageAttachmentItem[],
  ) => Promise<{ ok: boolean; id?: string; message?: string }>
  onCreatedNavigate?: (id: string) => void
  onAttachmentsPersisted?: (next: StorageAttachmentItem[]) => void
}

export function StorageAttachmentField(props: StorageAttachmentFieldProps) {
  const {
    user,
    canUpload,
    uploadDisabledHint,
    attachments,
    setAttachments,
    attachmentsRef,
    uploadArea,
    pathSegment,
    isNewEntityRoute,
    hasPersistedRow,
    persistMode,
    setFeedback,
    persistAttachments,
    insertEntityWithAttachments,
    onCreatedNavigate,
    onAttachmentsPersisted,
  } = props

  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null)
  const [downloadingPath, setDownloadingPath] = useState<string | null>(null)

  async function persistImmediate(next: StorageAttachmentItem[]): Promise<boolean> {
    if (!persistAttachments) return false
    if (!isProfilesSupabaseConfigured()) {
      setFeedback({
        type: 'error',
        text: 'Profiles Supabase is not configured.',
      })
      return false
    }
    const res = await persistAttachments(next)
    if (!res.ok) {
      setFeedback({
        type: 'error',
        text: res.message ?? 'Could not save.',
      })
      return false
    }
    onAttachmentsPersisted?.(next)
    attachmentsRef.current = next
    setAttachments(next)
    setFeedback(null)
    return true
  }

  function removeLinkAt(i: number) {
    const next = attachmentsRef.current.filter((_, j) => j !== i)

    if (
      persistMode === 'immediate' &&
      hasPersistedRow &&
      persistAttachments
    ) {
      void persistImmediate(next)
      return
    }

    attachmentsRef.current = next
    setAttachments(next)
  }

  async function removeFileAt(i: number) {
    const item = attachmentsRef.current[i]
    const next = attachmentsRef.current.filter((_, j) => j !== i)
    const storageToRemove =
      item?.kind === 'file' && item.storagePath ? item.storagePath : null

    if (
      persistMode === 'immediate' &&
      hasPersistedRow &&
      persistAttachments
    ) {
      const ok = await persistImmediate(next)
      if (ok && storageToRemove) {
        void deleteStorageAttachment(storageToRemove)
      }
      return
    }

    if (persistMode === 'deferred' && storageToRemove) {
      void deleteStorageAttachment(storageToRemove)
    }
    attachmentsRef.current = next
    setAttachments(next)
  }

  return (
    <div className="activity-field">
      <span className="activity-label">Attachment links and files</span>
      {!canUpload ? (
        <p className="activity-muted activity-field--hint">
          {uploadDisabledHint} You can still add web links.{' '}
          <a
            href="https://firebase.google.com/docs/storage/web/start"
            target="_blank"
            rel="noreferrer"
          >
            Storage setup
          </a>
        </p>
      ) : null}
      {attachments.map((item, i) =>
        item.kind === 'link' ? (
          <div key={i} className="activity-attachment-block">
            <label className="activity-field activity-field--stacked">
              <span className="activity-label">Link — description</span>
              <input
                type="text"
                className="activity-input"
                placeholder="e.g. shared folder"
                value={item.description}
                onChange={(e) => {
                  const v = e.target.value
                  setAttachments((prev) => {
                    const nx = [...prev]
                    const it = nx[i]
                    if (!it || it.kind !== 'link') return prev
                    nx[i] = { ...it, description: v }
                    attachmentsRef.current = nx
                    return nx
                  })
                }}
              />
            </label>
            <div className="activity-multi-row">
              <input
                type="url"
                className="activity-input"
                autoComplete="off"
                placeholder="https://…"
                value={item.url}
                onChange={(e) => {
                  const v = e.target.value
                  setAttachments((prev) => {
                    const nx = [...prev]
                    const it = nx[i]
                    if (!it || it.kind !== 'link') return prev
                    nx[i] = { ...it, url: v }
                    attachmentsRef.current = nx
                    return nx
                  })
                }}
              />
              <button
                type="button"
                className="activity-icon-btn"
                disabled={!item.url.trim()}
                onClick={() => {
                  const href = item.url.trim()
                  if (!href) return
                  window.open(href, '_blank', 'noopener,noreferrer')
                }}
              >
                Open link
              </button>
              <button
                type="button"
                className="activity-icon-btn"
                onClick={() => removeLinkAt(i)}
              >
                Remove
              </button>
            </div>
          </div>
        ) : (
          <div key={i} className="activity-attachment-block">
            <label className="activity-field activity-field--stacked">
              <span className="activity-label">File — description</span>
              <input
                type="text"
                className="activity-input"
                placeholder="e.g. scanned signed form"
                value={item.description}
                onChange={(e) => {
                  const v = e.target.value
                  setAttachments((prev) => {
                    const nx = [...prev]
                    const it = nx[i]
                    if (!it || it.kind !== 'file') return prev
                    nx[i] = { ...it, description: v }
                    attachmentsRef.current = nx
                    return nx
                  })
                }}
              />
            </label>
            <div className="proactive-file-row activity-multi-row">
              {item.storagePath ? (
                <p
                  className="proactive-file-saved"
                  title="Storage path is hidden; use Download to access the file."
                >
                  <span className="proactive-file-name">
                    {item.fileName || 'File attached'}
                  </span>
                  <span className="proactive-file-secure" aria-hidden>
                    (stored securely)
                  </span>
                </p>
              ) : (
                <p className="activity-muted">No file selected yet.</p>
              )}
              {canUpload ? (
                <label className="activity-icon-btn activity-file-pick">
                  {uploadingIndex === i
                    ? 'Uploading…'
                    : item.storagePath
                      ? 'Replace file'
                      : 'Choose file'}
                  <input
                    type="file"
                    className="sr-only"
                    disabled={uploadingIndex !== null}
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      e.target.value = ''
                      if (!f || !canUpload) return
                      if (!isUploadSizeAllowed(f)) {
                        setFeedback({
                          type: 'error',
                          text: 'File is too large (max 32 MB).',
                        })
                        return
                      }
                      const oldPath = item.storagePath
                      setUploadingIndex(i)
                      void (async () => {
                        const list = attachmentsRef.current
                        const baseItem = list[i]
                        if (!baseItem || baseItem.kind !== 'file') {
                          setUploadingIndex(null)
                          return
                        }
                        let newPath: string
                        let fn: string
                        try {
                          const u = await uploadAreaAttachment(
                            user.uid,
                            f,
                            pathSegment,
                            uploadArea,
                          )
                          newPath = u.storagePath
                          fn = u.fileName
                        } catch (err) {
                          setFeedback({
                            type: 'error',
                            text:
                              err instanceof Error
                                ? err.message
                                : 'Upload failed.',
                          })
                          setUploadingIndex(null)
                          return
                        }

                        const next = list.map((x, j) => {
                          if (j !== i) return x
                          if (x.kind !== 'file') return x
                          return {
                            ...x,
                            storagePath: newPath,
                            fileName: fn,
                          }
                        })

                        if (persistMode === 'deferred') {
                          if (oldPath) void deleteStorageAttachment(oldPath)
                          attachmentsRef.current = next
                          setAttachments(next)
                          setFeedback(null)
                          setUploadingIndex(null)
                          return
                        }

                        if (
                          persistMode === 'immediate' &&
                          hasPersistedRow &&
                          persistAttachments
                        ) {
                          if (!isProfilesSupabaseConfigured()) {
                            setFeedback({
                              type: 'error',
                              text: 'Profiles Supabase is not configured.',
                            })
                            void deleteStorageAttachment(newPath)
                            setUploadingIndex(null)
                            return
                          }
                          const res = await persistAttachments(next)
                          if (!res.ok) {
                            setFeedback({
                              type: 'error',
                              text: res.message ?? 'Could not save.',
                            })
                            void deleteStorageAttachment(newPath)
                            setUploadingIndex(null)
                            return
                          }
                          onAttachmentsPersisted?.(next)
                          if (oldPath) void deleteStorageAttachment(oldPath)
                          attachmentsRef.current = next
                          setAttachments(next)
                          setFeedback(null)
                          setUploadingIndex(null)
                          return
                        }

                        if (
                          isNewEntityRoute &&
                          !hasPersistedRow &&
                          insertEntityWithAttachments
                        ) {
                          if (!isProfilesSupabaseConfigured()) {
                            setFeedback({
                              type: 'error',
                              text: 'Profiles Supabase is not configured.',
                            })
                            void deleteStorageAttachment(newPath)
                            setUploadingIndex(null)
                            return
                          }
                          const ins =
                            await insertEntityWithAttachments(next)
                          if (!ins.ok || !ins.id) {
                            setFeedback({
                              type: 'error',
                              text: ins.message ?? 'Could not save.',
                            })
                            void deleteStorageAttachment(newPath)
                            setUploadingIndex(null)
                            return
                          }
                          if (oldPath) void deleteStorageAttachment(oldPath)
                          attachmentsRef.current = next
                          setAttachments(next)
                          setFeedback(null)
                          setUploadingIndex(null)
                          onCreatedNavigate?.(ins.id)
                          return
                        }

                        if (oldPath) void deleteStorageAttachment(oldPath)
                        attachmentsRef.current = next
                        setAttachments(next)
                        setFeedback(null)
                        setUploadingIndex(null)
                      })()
                    }}
                  />
                </label>
              ) : null}
              {item.storagePath ? (
                <button
                  type="button"
                  className="activity-icon-btn"
                  disabled={downloadingPath === item.storagePath}
                  onClick={() => {
                    if (!item.storagePath) return
                    setDownloadingPath(item.storagePath)
                    void (async () => {
                      try {
                        await downloadStorageAttachmentToDevice(
                          item.storagePath,
                          item.fileName || 'download',
                        )
                      } catch (err) {
                        setFeedback({
                          type: 'error',
                          text:
                            err instanceof Error
                              ? err.message
                              : 'Download failed.',
                        })
                      } finally {
                        setDownloadingPath(null)
                      }
                    })()
                  }}
                >
                  {downloadingPath === item.storagePath ? '…' : 'Download'}
                </button>
              ) : null}
              <button
                type="button"
                className="activity-icon-btn"
                onClick={() => void removeFileAt(i)}
              >
                Remove
              </button>
            </div>
          </div>
        ),
      )}

      <div className="proactive-attach-actions">
        <button
          type="button"
          className="activity-add-btn"
          onClick={() => {
            setAttachments((a) => {
              const n = [...a, newLinkAttachmentItem()]
              attachmentsRef.current = n
              return n
            })
          }}
        >
          Add link
        </button>
        {canUpload ? (
          <button
            type="button"
            className="activity-add-btn"
            onClick={() => {
              setAttachments((a) => {
                const n = [...a, newFileAttachmentItem()]
                attachmentsRef.current = n
                return n
              })
            }}
          >
            Add file (upload)
          </button>
        ) : null}
      </div>
    </div>
  )
}
