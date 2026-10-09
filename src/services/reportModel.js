const CONTEXT_RADIUS = 6

export function wordLang(word) {
    if (/[؀-ۿ]/.test(word)) return 'ar'
    if (/[A-Za-z]/.test(word)) return 'en'
    return 'other'
}

const isControl = (code) => (code < 0x20 && code !== 0x09 && code !== 0x0A && code !== 0x0D) || code === 0x7F

const scrub = (value) => Array.from(String(value)).filter((ch) => !isControl(ch.charCodeAt(0))).join('')

const clip = (value, max) => (value == null ? null : scrub(value).slice(0, max))

export const clampReport = ({ client_id, ...report }) => ({
    ...report,
    word: scrub(report.word || '').slice(0, 200) || '?',
    context: clip(report.context, 600),
    note: clip(report.note, 500),
    voice: clip(report.voice, 200),
    source_kind: clip(report.source_kind, 40),
    app_build: clip(report.app_build, 40),
    lang: scrub(report.lang || 'other').slice(0, 16) || 'other',
})

export function buildWordReport({ words, index, voice, rate, sourceKind, appBuild, note = '', reportType = 'mispronounced' }) {
    const word = (words?.[index] || '').trim()
    if (!word) return null
    const context = words.slice(Math.max(0, index - CONTEXT_RADIUS), index + CONTEXT_RADIUS + 1).join(' ')
    return clampReport({
        report_type: reportType,
        word,
        note: note.trim().slice(0, 500) || null,
        lang: wordLang(word),
        voice: voice || null,
        rate: rate ?? null,
        context,
        word_index: index,
        source_kind: sourceKind,
        app_build: appBuild ?? null,
    })
}
