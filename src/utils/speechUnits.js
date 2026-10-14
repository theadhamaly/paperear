const CLOSERS = '"\'”’)»\\]'
const TERMINAL_TAIL = new RegExp(`^(.*?)([.!?؟۔…]+)([${CLOSERS}]*)$`, 'u')
const OPENERS = /^[“"'‘(«[]+/u
const NON_ENDING_STOPS = /[!?؟۔]/u
const TITLE_ABBREVIATIONS = new Set(['mr', 'mrs', 'ms', 'dr', 'prof', 'st', 'fig', 'vol', 'vs', 'jr', 'sr', 'inc', 'ltd', 'dept', 'approx', 'cf'])
const NUMBERED_ABBREVIATIONS = new Set(['no', 'p', 'pp'])
const SOFT_CLAUSE_END = new RegExp(`[;:—–][${CLOSERS}]*$`, 'u')
const COMMA_END = new RegExp(`[,،][${CLOSERS}]*$`, 'u')

export const BAND_MAX_WORDS = 45
export const BAND_MAX_LINES = 3
export const BAND_LINE_CLAUSE_WORDS = 25

export function endsSentence(words, index) {
    const match = TERMINAL_TAIL.exec(words[index] || '')
    if (!match) return false
    if (index + 1 >= words.length) return true
    const [, rawCore, stops] = match
    if (NON_ENDING_STOPS.test(stops)) return true
    const next = words[index + 1].replace(OPENERS, '')
    if (/^\p{Ll}/u.test(next)) return false
    if (stops !== '.') return true
    const core = rawCore.replace(/^[^\p{L}\p{N}]+/u, '')
    const lower = core.toLowerCase()
    if (TITLE_ABBREVIATIONS.has(lower)) return false
    if (NUMBERED_ABBREVIATIONS.has(lower) && /^\d/.test(next)) return false
    if (/^\p{Lu}$/u.test(core)) return false
    if (/^(?:\p{L}\.)+\p{L}$/u.test(core)) return false
    return true
}

function tokenize(text) {
    const words = []
    const walls = []
    const pattern = /\S+/gu
    let previousEnd = 0
    let hit
    while ((hit = pattern.exec(text || '')) !== null) {
        if (words.length) {
            const gap = text.slice(previousEnd, hit.index)
            walls[words.length - 1] = /\n\s*\n/.test(gap) ? 2 : gap.includes('\n') ? 1 : 0
        }
        words.push(hit[0])
        previousEnd = hit.index + hit[0].length
    }
    if (words.length) walls[words.length - 1] = 2
    return { words, walls }
}

export function buildSpeechUnits(text, { cells = null } = {}) {
    const { words, walls } = tokenize(text)
    const sentences = []
    const segments = []
    const sentenceOf = new Int32Array(words.length)
    const segmentOf = new Int32Array(words.length)
    const cellEnds = new Set((cells || []).map(([, end]) => end))
    const cellStarts = new Set((cells || []).map(([start]) => start))
    let sentenceStart = 0
    let segmentStart = 0
    let insideCell = false
    for (let i = 0; i < words.length; i++) {
        if (cellStarts.has(i)) insideCell = true
        const wall = walls[i] > 0
        const ends = wall || (!insideCell && endsSentence(words, i))
        sentenceOf[i] = sentences.length
        segmentOf[i] = segments.length
        if (ends) {
            sentences.push([sentenceStart, i])
            sentenceStart = i + 1
        }
        if (wall) {
            segments.push([segmentStart, i])
            segmentStart = i + 1
        }
        if (cellEnds.has(i)) insideCell = false
    }
    return { words, walls, sentences, segments, sentenceOf, segmentOf }
}

export function unitRange(units, index, mode) {
    if (mode === 'word' || index < 0 || index >= units.words.length) return null
    if (mode === 'paragraph') return units.segments[units.segmentOf[index]]
    return units.sentences[units.sentenceOf[index]]
}

function pieceAround(words, [lo, hi], index, isEnd) {
    let start = lo
    for (let i = lo; i <= hi; i++) {
        const closes = i < hi && isEnd(words[i])
        if (i >= index) {
            if (closes || i === hi) return [start, i]
        } else if (closes) start = i + 1
    }
    return [start, hi]
}

export function narrowToClause(words, range, index, maxWords = BAND_MAX_WORDS) {
    const [lo, hi] = range
    if (hi - lo + 1 <= maxWords) return range
    const first = pieceAround(words, range, index, (w) => SOFT_CLAUSE_END.test(w))
    if (first[1] - first[0] + 1 <= maxWords) return first
    return pieceAround(words, first, index, (w) => COMMA_END.test(w))
}

export function bandRange(units, index, mode, maxWords = BAND_MAX_WORDS) {
    const base = unitRange(units, index, mode)
    if (!base || mode !== 'sentence') return base
    return narrowToClause(units.words, base, index, maxWords)
}
