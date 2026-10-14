import { cellContent } from './tableDetect.js'

const NEAR_BOTTOM_LINES = 2.5
const NEAR_TOP_LINES = 3.5
const COLUMN_TOLERANCE = 10
const SENTENCE_END = /[.!?:;…،؛؟۔]["'”’»)\]]?\s*$/

export function pageAnalysis(detected, height) {
    return {
        tables: detected.tables.filter((t) => t.signal !== 'whitespace'),
        model: detected.model,
        metrics: detected.metrics,
        height,
    }
}

export function layoutTables(analysis) {
    const { height } = analysis
    return analysis.tables.map((table) => ({
        signal: table.signal,
        rtl: table.rtl,
        cells: table.cells.map((c) => ({
            x0: c.x0,
            x1: c.x1,
            y0: height - c.y1,
            y1: height - c.y0,
            row: c.row,
            col: c.col,
            ...(c.after ? { after: c.after } : {}),
            ...(c.consumed ? { consumed: true } : {}),
        })),
    }))
}

const rowCells = (table, pick) => {
    const rows = table.cells.map((c) => c.row)
    const row = pick === 'last' ? Math.max(...rows) : Math.min(...rows)
    return table.cells.filter((c) => c.row === row).sort((a, b) => a.col - b.col)
}

function textExtent(model, cells) {
    const inside = model.filter((i) => cells.some((c) => i.cx >= c.x0 && i.cx <= c.x1 && i.cy >= c.y0 && i.cy <= c.y1))
    if (!inside.length) return null
    return { top: Math.min(...inside.map((i) => i.top)), bottom: Math.max(...inside.map((i) => i.bottom)) }
}

function pairColumns(upperCells, lowerCells) {
    const pairs = []
    for (const lower of lowerCells) {
        const upper = upperCells.reduce((best, c) => (!best || Math.abs(c.x0 - lower.x0) < Math.abs(best.x0 - lower.x0) ? c : best), null)
        if (upper && Math.abs(upper.x0 - lower.x0) <= COLUMN_TOLERANCE) pairs.push({ upper, lower })
    }
    return pairs
}

const continues = (upperText, lowerText, caseless) => !SENTENCE_END.test(upperText)
    && (caseless ? !/^\p{Lu}/u.test(lowerText) : /^\p{Ll}/u.test(lowerText))

function cutPairs(upperTable, lowerTable, upper, lower, upperCells, lowerCells, pairs) {
    const texts = pairs.map((p) => ({
        pair: p,
        upper: cellContent(upper.model, p.upper).text,
        lower: cellContent(lower.model, p.lower).text,
    })).filter((t) => t.upper && t.lower)
    if (!texts.length) return []
    const headerBand = upperTable.signal === 'filled' && upperTable.rows === 1 && lowerTable.filledHeader
    if (headerBand) {
        const joined = texts.filter((t) => continues(t.upper, t.lower, true))
        return texts.length >= 2 && joined.length >= texts.length / 2 ? joined : []
    }
    const filledUpper = upperCells.filter((c) => cellContent(upper.model, c).text).length
    const filledLower = lowerCells.filter((c) => cellContent(lower.model, c).text).length
    if (filledLower >= filledUpper || texts.length !== filledLower) return []
    return texts.every((t) => continues(t.upper, t.lower, false)) ? texts : []
}

export function joinPageBreak(upper, lower) {
    for (const upperTable of upper.tables) {
        const upperCells = rowCells(upperTable, 'last')
        const upperExtent = textExtent(upper.model, upperCells)
        if (!upperExtent || upperExtent.bottom < upper.metrics.contentBottom - NEAR_BOTTOM_LINES * upper.metrics.lineHeight) continue
        for (const lowerTable of lower.tables) {
            const lowerCells = rowCells(lowerTable, 'first')
            const lowerExtent = textExtent(lower.model, lowerCells)
            if (!lowerExtent || lowerExtent.top > lower.metrics.contentTop + NEAR_TOP_LINES * lower.metrics.lineHeight) continue
            const pairs = pairColumns(upperCells, lowerCells)
            if (pairs.length < Math.min(2, lowerCells.length)) continue
            const cut = cutPairs(upperTable, lowerTable, upper, lower, upperCells, lowerCells, pairs)
            for (const t of cut) {
                t.pair.upper.after = t.lower
                t.pair.lower.consumed = true
            }
            if (cut.length) return true
        }
    }
    return false
}
