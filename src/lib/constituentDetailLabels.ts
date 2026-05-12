/**
 * UI labels and display order for `detail` in the constituent picker.
 * Keys may come from `get_constituent_detail` (jsonb) or legacy search payloads.
 */

/** Keys present in RPC detail but hidden in the pick-list UI. */
export const CONSTITUENT_DETAIL_EXCLUDED_KEYS = new Set([
  'CID',
  'cid',
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
  'Constituent_ID',
  'Formatted_Name',
  'Chinese_Name',
  'Martial_Status',
  'BIRTHDATE',
  'GENDER',
  'AGE',
  'Constituent_Type',
  'CONSTITUENCY',
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
  Constituent_ID: 'Constituent ID',
  Formatted_Name: 'Formatted name',
  Chinese_Name: 'Chinese name',
  Martial_Status: 'Marital status',
  BIRTHDATE: 'Birth date',
  GENDER: 'Gender',
  AGE: 'Age',
  Constituent_Type: 'Constituent type',
  CONSTITUENCY: 'Constituency',
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

/** HKU Foundation membership row keys from `get_hkuf` (see `003_get_hkuf.sql`). */
export const HKUF_MEMBERSHIP_ORDER: string[] = [
  'RECOGNITIONLEVEL',
  'JOINDATE',
  'TOTALAMOUNT',
  'COMMENTS',
]

const HKUF_LABELS: Record<string, string> = {
  RECOGNITIONLEVEL: 'Recognition level',
  JOINDATE: 'Join date',
  TOTALAMOUNT: 'Total amount',
  COMMENTS: 'Comments',
}

/** Education history row keys from `get_education` (see `004_get_education.sql`). */
export const EDUCATION_HISTORY_ORDER: string[] = [
  'Class_Of',
  'Preffered_Class_Of',
  'Status',
  'Faculty',
  'Department',
  'Curriculum',
  'Curriculum_full_title',
  'Curriculum_exit_full_title',
  'major_minor',
  'Result',
  'Full_Part_time',
  'Admission_Date',
  'Graduate_Date',
]

const EDUCATION_LABELS: Record<string, string> = {
  Class_Of: 'Class of',
  Preffered_Class_Of: 'Preferred class of',
  Status: 'Status',
  Faculty: 'Faculty',
  Department: 'Department',
  Curriculum: 'Curriculum',
  Curriculum_full_title: 'Programme / curriculum (full title)',
  Curriculum_exit_full_title: 'Curriculum exit (full title)',
  major_minor: 'Major / minor',
  Result: 'Result',
  Full_Part_time: 'Full / part-time',
  Admission_Date: 'Admission date',
  Graduate_Date: 'Graduate date',
}

/** One education history row for display (after HKU Foundation membership). */
export function entriesForEducationHistoryRow(
  row: Record<string, unknown>,
): { key: string; label: string; value: string }[] {
  const orderIndex = (k: string) => {
    const i = EDUCATION_HISTORY_ORDER.indexOf(k)
    return i === -1 ? 1000 : i
  }
  const keys = Object.keys(row).filter((k) => {
    const v = row[k]
    return v !== null && v !== undefined && String(v) !== ''
  })
  keys.sort((a, b) => {
    const d = orderIndex(a) - orderIndex(b)
    if (d !== 0) return d
    return a.localeCompare(b, undefined, { sensitivity: 'base' })
  })
  return keys.map((key) => {
    const raw = row[key]
    return {
      key,
      label: EDUCATION_LABELS[key] ?? labelForConstituentDetailKey(key),
      value:
        typeof raw === 'number' || typeof raw === 'boolean'
          ? String(raw)
          : String(raw ?? '').trim() || '—',
    }
  })
}

/** One HKUF membership row for display (after view detail). */
export function entriesForHkufMembershipRow(
  row: Record<string, unknown>,
): { key: string; label: string; value: string }[] {
  const orderIndex = (k: string) => {
    const i = HKUF_MEMBERSHIP_ORDER.indexOf(k)
    return i === -1 ? 1000 : i
  }
  const keys = Object.keys(row).filter((k) => {
    const v = row[k]
    return v !== null && v !== undefined && String(v) !== ''
  })
  keys.sort((a, b) => {
    const d = orderIndex(a) - orderIndex(b)
    if (d !== 0) return d
    return a.localeCompare(b, undefined, { sensitivity: 'base' })
  })
  return keys.map((key) => {
    const raw = row[key]
    return {
      key,
      label: HKUF_LABELS[key] ?? labelForConstituentDetailKey(key),
      value:
        typeof raw === 'number' || typeof raw === 'boolean'
          ? String(raw)
          : String(raw ?? '').trim() || '—',
    }
  })
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
