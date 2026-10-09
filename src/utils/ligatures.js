export const NUL = '\u0000'

const LETTER = /\p{L}/u
const ARABIC = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/
const MAX_F_EM = 0.5
const MAX_FF_EM = 0.8
const GAP_BEFORE = -0.15
const GAP_AFTER = 0.12
const SAME_LINE = 0.3

const isLetter = (c) => !!c && LETTER.test(c)

export function ligatureFor({ em, before, after }) {
    if (!(em > 0) || (!isLetter(before) && !isLetter(after))) return ''
    if (em < MAX_F_EM) return 'f'
    if (em < MAX_FF_EM && isLetter(before) && (after === 'i' || after === 'l')) return 'ff'
    return ''
}

const heightOf = (it) => it.height || Math.abs(it.transform?.[3]) || 0

const touches = (left, right, size) => {
    const gap = right.transform[4] - (left.transform[4] + (left.width || 0))
    return Math.abs(right.transform[5] - left.transform[5]) <= size * SAME_LINE
        && gap >= size * GAP_BEFORE && gap <= size * GAP_AFTER
}

export function repairUnmappedGlyphs(items) {
    if (!items?.some((it) => it.str?.includes(NUL))) return items
    const out = []
    for (let k = 0; k < items.length; k++) {
        const it = items[k]
        if (!it.str?.includes(NUL)) {
            out.push(it)
            continue
        }
        const bare = it.str.replaceAll(NUL, '')
        if (bare || ARABIC.test(it.str)) {
            if (bare) out.push({ ...it, str: bare })
            continue
        }
        const size = heightOf(it)
        const prev = items[k - 1]
        const next = items[k + 1]
        const joinsPrev = !!prev?.str && size > 0 && !ARABIC.test(prev.str) && touches(prev, it, size)
        const joinsNext = !!next?.str && size > 0 && !ARABIC.test(next.str) && touches(it, next, size)
        const letters = ligatureFor({
            em: size > 0 ? (it.width || 0) / size : 0,
            before: joinsPrev ? prev.str.slice(-1) : '',
            after: joinsNext ? next.str.slice(0, 1) : '',
        })
        if (letters) {
            out.push({ ...it, str: letters })
            continue
        }
        const last = out[out.length - 1]
        if (joinsPrev && last && !prev.str.includes(NUL)) out[out.length - 1] = { ...last, width: (last.width || 0) + (it.width || 0), hasEOL: last.hasEOL || it.hasEOL }
        else if (it.hasEOL && last) out[out.length - 1] = { ...last, hasEOL: true }
    }
    return out
}

export function repairUnmappedGlyphBoxes(glyphs) {
    for (let i = 0; i < glyphs.length; i++) {
        const g = glyphs[i]
        if (g.u !== NUL) continue
        const size = g.em > 0 ? (g.x1 - g.x0) / g.em : 0
        const prev = glyphs[i - 1]
        const next = glyphs[i + 1]
        const joinsPrev = !!prev && size > 0 && Math.abs(prev.y - g.y) <= size * SAME_LINE
            && g.x0 - prev.x1 >= size * GAP_BEFORE && g.x0 - prev.x1 <= size * GAP_AFTER
        const joinsNext = !!next && size > 0 && Math.abs(next.y - g.y) <= size * SAME_LINE
            && next.x0 - g.x1 >= size * GAP_BEFORE && next.x0 - g.x1 <= size * GAP_AFTER
        g.u = ligatureFor({
            em: g.em,
            before: joinsPrev ? prev.u.slice(-1) : '',
            after: joinsNext ? next.u.slice(0, 1) : '',
        })
        delete g.em
    }
    return glyphs
}
