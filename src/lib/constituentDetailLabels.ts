/**
 * UI labels and display order for `detail` on each constituent search row.
 * Keys come from `search_v_query_constituent` (jsonb).
 */

/** Keys present in RPC detail but hidden in the pick-list UI. */
export const CONSTITUENT_DETAIL_EXCLUDED_KEYS = new Set([
  'id',
  'title2',
  'isgroup',
  'is_inactive',
  'gives_anonymously',
  'dateadded',
  'datechanged',
  'sequence_id',
])

export const CONSTITUENT_DETAIL_ORDER: string[] = [
  'lookup_id',
  'formattedname',
  'name',
  'keyname',
  'firstname',
  'middlename',
  'maidenname',
  'nickname',
  'constituenttype',
  'title',
  'gender',
  'age',
  'birthdate',
  'deceased',
  'deceaseddate',
  'deceased_years',
  'marital_status',
  'deceased_confirmation',
  'deceased_source',
  'webaddress',
  'donotmail',
  'donotemail',
  'donotphone',
  'primary_business_id',
]

const OVERRIDES: Record<string, string> = {
  lookup_id: 'Lookup ID',
  keyname: 'Key name',
  firstname: 'First name',
  middlename: 'Middle name',
  maidenname: 'Maiden name',
  nickname: 'Nickname',
  name: 'Name',
  formattedname: 'Formatted name',
  title: 'Title',
  gender: 'Gender',
  age: 'Age',
  birthdate: 'Birth date',
  deceased: 'Deceased (flag)',
  deceaseddate: 'Deceased date',
  deceased_years: 'Years deceased',
  constituenttype: 'Constituent type',
  marital_status: 'Marital status',
  deceased_confirmation: 'Deceased confirmation',
  deceased_source: 'Deceased source',
  webaddress: 'Web address',
  donotmail: 'Do not mail',
  donotemail: 'Do not email',
  donotphone: 'Do not phone',
  primary_business_id: 'Primary business ID',
}

function titleFromKey(k: string): string {
  return k
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export function labelForConstituentDetailKey(k: string): string {
  return OVERRIDES[k] ?? titleFromKey(k)
}

/** Turns RPC `detail` into sorted entries for a definition list. */
export function entriesForConstituentDetail(
  detail: Record<string, unknown> | null | undefined,
): { key: string; label: string; value: string }[] {
  if (!detail || typeof detail !== 'object') return []
  const orderIndex = (k: string) => {
    const i = CONSTITUENT_DETAIL_ORDER.indexOf(k)
    return i === -1 ? 1000 : i
  }
  const keys = Object.keys(detail as Record<string, unknown>).filter((k) => {
    if (CONSTITUENT_DETAIL_EXCLUDED_KEYS.has(k)) return false
    const v = (detail as Record<string, unknown>)[k]
    return v !== null && v !== undefined && String(v) !== ''
  })
  keys.sort((a, b) => {
    const da = orderIndex(a) - orderIndex(b)
    if (da !== 0) return da
    return a.localeCompare(b, undefined, { sensitivity: 'base' })
  })
  return keys.map((key) => {
    const raw = (detail as Record<string, unknown>)[key]
    return {
      key,
      label: labelForConstituentDetailKey(key),
      value:
        typeof raw === 'number' || typeof raw === 'boolean'
          ? String(raw)
          : String(raw ?? '').trim() || '—',
    }
  })
}
