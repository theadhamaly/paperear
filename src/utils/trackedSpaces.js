const SAME_LINE = 0.3
const MIN_TRACKING_EM = 0.06
const TRACKING_SLACK = 1.3
const SPACE_RUN = /\s+/g

const PLAIN_SHORT_WORDS = new Set(['A', 'I', 'AN', 'AS', 'AT', 'BE', 'BY', 'DO', 'GO', 'HE', 'IF', 'IN', 'IS', 'IT', 'ME', 'MY', 'NO', 'OF', 'ON', 'OR', 'SO', 'TO', 'UP', 'US', 'WE'])

export const mayHaveInventedSpaces = (str) =>
    !!str && /\p{Lu} \p{Lu}/u.test(str) && !/\p{Ll}/u.test(str)
        && str.split(/\s+/).some((word) => /^\p{Lu}{1,2}$/u.test(word) && !PLAIN_SHORT_WORDS.has(word))

const median = (values) => {
    const sorted = [...values].sort((a, b) => a - b)
    return sorted[Math.floor(sorted.length / 2)]
}

function repairedString(item, glyphs) {
    const size = item.height || Math.abs(item.transform?.[3]) || 0
    if (!(size > 0)) return item.str
    const x = item.transform[4]
    const y = item.transform[5]
    const tol = Math.max(1, size * SAME_LINE)
    const own = glyphs.filter((g) => {
        const c = (g.x0 + g.x1) / 2
        return Math.abs(g.y - y) <= tol && c >= x - 0.5 && c <= x + (item.width || 0) + 0.5
    })
    const lettersAt = []
    own.forEach((g, i) => { if (!g.space) lettersAt.push(i) })
    const bare = item.str.replace(SPACE_RUN, '')
    if (lettersAt.map((i) => own[i].u).join('') !== bare) return item.str

    const owner = []
    lettersAt.forEach((ownIndex, k) => {
        for (let c = 0; c < own[ownIndex].u.length; c++) owner.push(k)
    })

    const gaps = []
    for (let k = 1; k < lettersAt.length; k++) {
        if (lettersAt[k] - lettersAt[k - 1] !== 1) continue
        gaps.push(own[lettersAt[k]].x0 - own[lettersAt[k - 1]].x1)
    }
    if (!gaps.length) return item.str
    const normal = median(gaps)
    if (normal < size * MIN_TRACKING_EM) return item.str
    const limit = normal * TRACKING_SLACK

    return item.str.replace(SPACE_RUN, (run, at) => {
        const before = item.str.slice(0, at).replace(SPACE_RUN, '').length
        if (before === 0 || before >= bare.length) return run
        const prev = owner[before - 1]
        const next = owner[before]
        if (prev === next) return run
        const drawn = own.slice(lettersAt[prev] + 1, lettersAt[next]).some((g) => g.space)
        const gap = own[lettersAt[next]].x0 - own[lettersAt[prev]].x1
        return !drawn && gap <= limit ? '' : run
    })
}

export function dropInventedSpaces(items, glyphs) {
    if (!glyphs?.length) return items
    let changed = false
    const out = items.map((it) => {
        if (!mayHaveInventedSpaces(it.str)) return it
        const str = repairedString(it, glyphs)
        if (str === it.str) return it
        changed = true
        return { ...it, str }
    })
    return changed ? out : items
}
