import { NUL, repairUnmappedGlyphBoxes } from './ligatures.js'

const IDENTITY = [1, 0, 0, 1, 0, 0]
const DEFAULT_FONT_MATRIX = [0.001, 0, 0, 0.001, 0, 0]
const CACHE_PAGES = 16
const FONT_WAIT_MS = 3000

const multiply = (m, n) => [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
]

const project = (m, x) => [m[0] * x + m[4], m[1] * x + m[5]]

export function glyphsFromOperatorList(opList, fontOf, OPS) {
    const glyphs = []
    let state = {
        ctm: IDENTITY, tm: IDENTITY, x: 0, y: 0, lineX: 0, lineY: 0,
        font: null, size: 0, fontMatrix: DEFAULT_FONT_MATRIX, direction: 1,
        charSpacing: 0, wordSpacing: 0, hScale: 1, leading: 0, rise: 0,
    }
    const stack = []
    const setFont = (name, size) => {
        const font = fontOf(name)
        state.font = font
        state.fontMatrix = font?.fontMatrix || DEFAULT_FONT_MATRIX
        state.direction = size < 0 ? -1 : 1
        state.size = Math.abs(size)
    }
    const moveText = (dx, dy) => {
        state.x = state.lineX += dx
        state.y = state.lineY += dy
    }
    for (let i = 0; i < opList.fnArray.length; i++) {
        const fn = opList.fnArray[i]
        const args = opList.argsArray[i] || []
        if (fn === OPS.save) stack.push({ ...state })
        else if (fn === OPS.restore) { if (stack.length) state = stack.pop() }
        else if (fn === OPS.transform) state.ctm = multiply(state.ctm, args)
        else if (fn === OPS.paintFormXObjectBegin) {
            stack.push({ ...state })
            if (args[0]) state.ctm = multiply(state.ctm, args[0])
        } else if (fn === OPS.paintFormXObjectEnd) { if (stack.length) state = stack.pop() }
        else if (fn === OPS.beginText) {
            state.tm = IDENTITY
            state.x = state.lineX = 0
            state.y = state.lineY = 0
        } else if (fn === OPS.setCharSpacing) state.charSpacing = args[0]
        else if (fn === OPS.setWordSpacing) state.wordSpacing = args[0]
        else if (fn === OPS.setHScale) state.hScale = args[0] / 100
        else if (fn === OPS.setLeading) state.leading = -args[0]
        else if (fn === OPS.setTextRise) state.rise = args[0]
        else if (fn === OPS.setFont) setFont(args[0], args[1])
        else if (fn === OPS.setGState) {
            for (const [key, value] of args[0] || []) if (key === 'Font') setFont(value[0], value[1])
        } else if (fn === OPS.moveText) moveText(args[0], args[1])
        else if (fn === OPS.setLeadingMoveText) {
            state.leading = args[1]
            moveText(args[0], args[1])
        } else if (fn === OPS.setTextMatrix) {
            state.tm = Array.isArray(args[0]) || ArrayBuffer.isView(args[0]) ? [...args[0]] : args.slice(0, 6)
            state.x = state.lineX = 0
            state.y = state.lineY = 0
        } else if (fn === OPS.nextLine) moveText(0, state.leading)
        else if (fn === OPS.showText) {
            if (!state.size || state.font?.vertical) continue
            const advanceScale = state.size * state.fontMatrix[0]
            const hScale = state.hScale * state.direction
            const base = multiply(multiply(state.ctm, state.tm), [1, 0, 0, 1, state.x, state.y + state.rise])
            let x = 0
            for (const g of args[0] || []) {
                if (typeof g === 'number') {
                    x -= (g * state.size) / 1000
                    continue
                }
                const width = g.width * advanceScale
                const a = project(base, x * hScale)
                const b = project(base, (x + width) * hScale)
                glyphs.push({
                    x0: Math.min(a[0], b[0]),
                    x1: Math.max(a[0], b[0]),
                    y: a[1],
                    u: g.unicode || '',
                    space: !(g.unicode || '').trim(),
                    ...(g.unicode === NUL ? { em: g.width * state.fontMatrix[0] } : {}),
                })
                x += width + ((g.isSpace ? state.wordSpacing : 0) + state.charSpacing) * state.direction
            }
            state.x += x * hScale
        }
    }
    return repairUnmappedGlyphBoxes(glyphs)
}

const glyphCache = new Map()

export function pageGlyphs(page, OPS) {
    if (glyphCache.has(page)) {
        const hit = glyphCache.get(page)
        glyphCache.delete(page)
        glyphCache.set(page, hit)
        return hit
    }
    const pending = readPageGlyphs(page, OPS).catch(() => {
        glyphCache.delete(page)
        return null
    })
    glyphCache.set(page, pending)
    while (glyphCache.size > CACHE_PAGES) glyphCache.delete(glyphCache.keys().next().value)
    return pending
}

async function readPageGlyphs(page, OPS) {
    const opList = await page.getOperatorList()
    const names = new Set()
    opList.fnArray.forEach((fn, i) => {
        const args = opList.argsArray[i] || []
        if (fn === OPS.setFont) names.add(args[0])
        if (fn === OPS.setGState) for (const [key, value] of args[0] || []) if (key === 'Font') names.add(value[0])
    })
    const fonts = new Map()
    await Promise.all([...names].map((name) => Promise.race([
        new Promise((resolve) => {
            try { page.commonObjs.get(name, (font) => { fonts.set(name, font); resolve() }) } catch { resolve() }
        }),
        new Promise((resolve) => setTimeout(resolve, FONT_WAIT_MS)),
    ])))
    return glyphsFromOperatorList(opList, (name) => fonts.get(name) || null, OPS)
}

export const letterKey = (s) =>
    [...String(s || '').normalize('NFKC').replace(/[\p{M}\u{640}\x00]/gu, '').replace(/[^\p{L}\p{N}]/gu, '')].sort().join('')

function groupsFor(item, glyphs, count) {
    const tol = Math.max(1, item.h * 0.3)
    const own = glyphs
        .filter((g) => !g.space && Math.abs(g.y - item.y) <= tol)
        .filter((g) => {
            const c = (g.x0 + g.x1) / 2
            return c >= item.x - 0.5 && c <= item.x + item.w + 0.5
        })
        .sort((a, b) => a.x0 + a.x1 - b.x0 - b.x1)
    if (own.length < count) return null
    const gaps = []
    let reach = own[0].x1
    for (let i = 1; i < own.length; i++) {
        gaps.push({ i, gap: own[i].x0 - reach })
        reach = Math.max(reach, own[i].x1)
    }
    const cuts = gaps.sort((a, b) => b.gap - a.gap).slice(0, count - 1).map((g) => g.i).sort((a, b) => a - b)
    const groups = []
    let start = 0
    for (const end of [...cuts, own.length]) {
        const part = own.slice(start, end)
        groups.push({
            x0: Math.min(...part.map((g) => g.x0)),
            x1: Math.max(...part.map((g) => g.x1)),
            key: letterKey(part.map((g) => g.u).join('')),
        })
        start = end
    }
    return groups
}

export function refineBoxesWithGlyphs(words, glyphs) {
    if (!glyphs?.length) return words
    const byItem = new Map()
    for (const w of words) {
        if (!w.src) continue
        if (!byItem.has(w.src.item)) byItem.set(w.src.item, [])
        byItem.get(w.src.item).push(w)
    }
    for (const [item, boxes] of byItem) {
        if (item.w < 0.5) continue
        const count = boxes[0].src.count
        if (boxes.length !== count) continue
        const groups = groupsFor(item, glyphs, count)
        if (!groups) continue
        const ordered = [...boxes].sort((a, b) => a.src.k - b.src.k)
        const expected = (k) => (boxes[0].src.rtl ? count - 1 - k : k)
        const keys = ordered.map((box) => letterKey(box.text))
        const inOrder = keys.every((key, k) => key === groups[expected(k)].key)
        const used = new Set()
        ordered.forEach((box, k) => {
            const key = keys[k]
            let best = inOrder ? expected(k) : -1
            let bestDistance = Infinity
            if (!inOrder && key) {
                groups.forEach((g, j) => {
                    if (used.has(j) || g.key !== key) return
                    const d = Math.abs(j - expected(k))
                    if (d < bestDistance) { bestDistance = d; best = j }
                })
            }
            if (best < 0) return
            used.add(best)
            box.x = groups[best].x0
            box.w = groups[best].x1 - groups[best].x0
        })
    }
    return words
}
