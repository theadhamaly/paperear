import { buildSpeechUnits, bandRange, unitRange, narrowToClause, BAND_LINE_CLAUSE_WORDS } from './speechUnits.js'

export const FOLLOW_MODES = ['word', 'sentence', 'paragraph']
export const FOLLOW_KEY = 'paperear_follow'
export const DEFAULT_FOLLOW = 'sentence'

export function readFollow() {
    try {
        const stored = localStorage.getItem(FOLLOW_KEY)
        return FOLLOW_MODES.includes(stored) ? stored : DEFAULT_FOLLOW
    } catch {
        return DEFAULT_FOLLOW
    }
}

export function saveFollow(mode) {
    try { localStorage.setItem(FOLLOW_KEY, mode) } catch { return }
}

export function cellRanges(pages) {
    const ranges = []
    for (const page of pages || []) {
        for (const block of page.blocks || []) {
            if (block.cell && block.words?.length) ranges.push([block.words[0].index, block.words[block.words.length - 1].index])
        }
    }
    return ranges
}

export function unitsForText(text, pages) {
    return buildSpeechUnits(text, { cells: cellRanges(pages) })
}

export function bandFor(units, index, follow) {
    const range = bandRange(units, index, follow)
    if (!range) return null
    if (follow !== 'sentence') return { range, short: null }
    const whole = unitRange(units, index, 'sentence')
    const short = narrowToClause(units.words, whole, index, BAND_LINE_CLAUSE_WORDS)
    return { range, short: short[0] === range[0] && short[1] === range[1] ? null : short }
}

export function unitTextAt(units, index) {
    const range = unitRange(units, index, 'sentence')
    return range ? units.words.slice(range[0], range[1] + 1).join(' ') : ''
}
