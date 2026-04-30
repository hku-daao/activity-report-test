/**
 * Leading honorific tokens (longest first), aligned with Supabase `_extract_title_and_rest`.
 */
const TITLE_PREFIXES: readonly string[] = [
  'the right honourable ',
  'the right honorable ',
  'the very reverend ',
  'the honourable ',
  'the honorable ',
  'the hon. ',
  'the hon ',
  'associate prof ',
  'assistant prof ',
  'assoc. prof ',
  'asst. prof ',
  'asst prof ',
  'assoc prof ',
  'very reverend ',
  'very rev ',
  'the very ',
  'lieutenant ',
  'reverend ',
  'sergeant ',
  'professor ',
  'monsignor ',
  'rector ',
  'father ',
  'brother ',
  'sister ',
  'admiral ',
  'colonel ',
  'captain ',
  'senator ',
  'general ',
  'signorina ',
  'signora ',
  'signore ',
  'ph.d. ',
  'ph. d. ',
  'd.d.s. ',
  'd.v.m. ',
  'justice ',
  'cdre ',
  'h.e. ',
  'h.o.n. ',
  'd.s. ',
  'd.r. ',
  'h.o.n ',
  'herr. ',
  'mme. ',
  'srta. ',
  'cpt ',
  'capt. ',
  'prof. ',
  'mrs. ',
  'ms. ',
  'dr. ',
  'mr. ',
  'sgt. ',
  'maj. ',
  'gen. ',
  'adm. ',
  'mrs ',
  'ms ',
  'miss ',
  'mx. ',
  'dr ',
  'mr ',
  'mx ',
  'phd ',
  'dds ',
  'cpl ',
  'cdr ',
  'sgt ',
  'maj ',
  'gen ',
  'adm ',
  'lt. ',
  'lt ',
  'col. ',
  'col ',
  'prof ',
  'frau ',
  'dame ',
  'herr ',
  'mme ',
  'srta ',
  'rev. ',
  'rev ',
  'rabbi ',
  'signor ',
  'hon. ',
  'honourable ',
  'honorable ',
  'fr. ',
  'sen. ',
  'sen ',
  'don ',
  'cantor ',
  'imam ',
  'judge ',
  'the ',
]

export type TitleNameParts = {
  /** Lowercase honorific fragment(s) stripped from the start, space-separated. */
  title: string
  /** Remainder after stripping titles (name for CRM lookup). */
  nameRest: string
}

function normalizeSpaces(s: string): string {
  return s.trim().replace(/\s+/g, ' ')
}

/**
 * Strips one or more leading English honorifics from a single line (same idea as Supabase strip/extract).
 */
export function extractLeadingTitle(raw: string): TitleNameParts {
  let s = normalizeSpaces(raw)
  if (!s) {
    return { title: '', nameRest: '' }
  }
  const orig = s
  const acc: string[] = []

  for (let round = 0; round < 30; round++) {
    let progressed = false
    const sLower = s.toLowerCase()
    for (const p of TITLE_PREFIXES) {
      const plen = p.length
      if (s.length < plen || plen === 0) continue
      if (sLower.startsWith(p.toLowerCase())) {
        if (s.length <= plen) {
          acc.push(s.slice(0, plen).trim().toLowerCase())
          s = ''
          progressed = true
          break
        }
        acc.push(s.slice(0, plen).trim().toLowerCase())
        let rest = s.slice(plen).trim()
        rest = rest.replace(/^[.\s]+/, '')
        rest = rest.replace(/^[-,;:/]+/, '')
        s = normalizeSpaces(rest)
        progressed = true
        break
      }
    }
    if (!progressed) break
    if (!s) break
  }

  const title = acc.join(' ').trim()
  let nameRest = s.replace(/^[,;]+/, '').trim()
  if (!acc.length) {
    return { title: '', nameRest: orig }
  }
  if (!nameRest && title) {
    return { title, nameRest: '' }
  }
  return { title, nameRest }
}
