const MARKS = /[ً-ْٰـ]/g
const stripMarks = (str) => (str || '').replace(MARKS, '')

const letterCount = (s) => ((s || '').match(/\p{L}/gu) || []).length
const alnumCount = (s) => ((s || '').match(/[\p{L}\p{N}]/gu) || []).length

const isSolid = (it) => (it.conf ?? 100) >= 60 && letterCount(it.str) >= 3

export const isAnchor = (it) => {
    const conf = it.conf ?? 100
    const n = alnumCount(it.str)
    return (conf >= 80 && n >= 3) || (conf >= 70 && n >= 5)
}

export function isArtPage(items, { minItems = 40, solidShare = 0.25 } = {}) {
    if (!items || items.length < minItems) return false
    const solid = items.filter(isSolid).length
    return solid / items.length < solidShare
}

export function scriptOf(str) {
    let ar = 0
    let lat = 0
    for (const ch of str || '') {
        if (!/\p{L}/u.test(ch)) continue
        if (/\p{Script=Arabic}/u.test(ch)) ar++
        else if (/\p{Script=Latin}/u.test(ch)) lat++
    }
    if (!ar && !lat) return ''
    return ar >= lat ? 'ar' : 'lat'
}

export function groupLines(items) {
    const boxes = (items || []).map((it, i) => {
        const x = it.transform?.[4] ?? 0
        const y = it.transform?.[5] ?? 0
        const h = it.height || Math.abs(it.transform?.[3] ?? 0) || 1
        return { i, x1: x, x2: x + (it.width || 0), y1: y, y2: y + h, h }
    }).sort((a, b) => (b.y1 + b.y2) - (a.y1 + a.y2))
    const rows = []
    for (const b of boxes) {
        const row = rows.find((r) => Math.min(b.y2, r.y2) - Math.max(b.y1, r.y1) >= 0.5 * Math.min(b.h, r.h))
        if (row) row.boxes.push(b)
        else rows.push({ y1: b.y1, y2: b.y2, h: b.h, boxes: [b] })
    }
    const lines = []
    for (const row of rows) {
        let line = null
        for (const b of row.boxes.sort((p, q) => p.x1 - q.x1)) {
            if (line && b.x1 - line.x2 <= 5 * Math.max(b.h, line.h)) {
                line.members.push(b.i)
                line.x2 = Math.max(line.x2, b.x2)
                line.h = Math.max(line.h, b.h)
            } else {
                line = { x2: b.x2, h: b.h, members: [b.i] }
                lines.push(line)
            }
        }
    }
    return lines.map((l) => l.members)
}

export function leadScript(engItems, araItems) {
    const lat = (engItems || []).filter((it) => scriptOf(it.str) === 'lat' && isAnchor(it)).length
    const ar = (araItems || []).filter((it) => scriptOf(it.str) === 'ar' && isAnchor(it)).length
    if (ar >= 2 && lat < 2) return 'ar'
    if (lat >= 2 && ar < 2) return 'lat'
    return ''
}

function isForeign(it, anchors) {
    const s = scriptOf(it.str)
    if (!s) return false
    const other = s === 'ar' ? 'lat' : 'ar'
    if (anchors[s] >= 2 || anchors[other] < 2) return false
    return !((it.conf ?? 100) >= 90 && letterCount(it.str) >= 3)
}

const wordKey = (str) => stripMarks((str || '').toLowerCase()).replace(/[^\p{L}]/gu, '')

export function confidentWords(itemsPerPage, { minCount = 2, minConf = 70 } = {}) {
    const counts = new Map()
    for (const items of itemsPerPage || [])
        for (const it of items || []) {
            if ((it.conf ?? 100) < minConf) continue
            const key = wordKey(it.str)
            if (key.length < 2) continue
            counts.set(key, (counts.get(key) || 0) + 1)
        }
    const known = new Set()
    for (const [key, n] of counts) if (n >= minCount) known.add(key)
    return known
}

const LATIN_VOWELS = /[aeiouy]/i
const REPEATED_LETTER = /(\p{L})\1{2,}/u
const CONSONANT_CLUSTER = /[^aeiouy\s]{5,}/i
const INNER_CAPITAL = /[a-z][A-Z]/
const NOISE_SYMBOL = /[|~^_\\#<>{}=@]/

export function isJunkWord(it, known, lead = '') {
    const str = (it.str || '').trim()
    const conf = it.conf ?? 100
    if (conf >= 70) return false
    const key = wordKey(str)
    if (key && known && known.has(key)) return false
    const script = scriptOf(str)
    if (script === 'lat') {
        const letters = letterCount(str)
        if (/\d/.test(str) && letters > 0) return true
        if (NOISE_SYMBOL.test(str)) return true
        if (lead === 'ar' && letters <= 2) return true
        if (letters === 1) return !/^[aAiI]$/.test(key)
        if (letters >= 3 && !LATIN_VOWELS.test(key)) return true
        if (conf < 50 && CONSONANT_CLUSTER.test(key)) return true
        if (INNER_CAPITAL.test(str.replace(/^[^a-zA-Z]+/, '')) && !/^[A-Z][a-z]+[A-Z][a-z]+$/.test(str)) return true
        if (conf < 40 && letters <= 3) return true
        if (lead === 'ar') return conf < 50
        return false
    }
    if (script === 'ar') {
        const core = stripMarks(str).replace(/[^ء-ي]/g, '')
        if (lead === 'lat' && core.length <= 1) return true
        if (core.length <= 1) return conf < 50
        if (/\p{Script=Latin}|\d/u.test(str)) return true
        if (REPEATED_LETTER.test(core)) return true
    }
    return false
}

function leadOf(anchors) {
    if (anchors.lat >= 4 && anchors.lat >= 4 * anchors.ar) return 'lat'
    if (anchors.ar >= 4 && anchors.ar >= 4 * anchors.lat) return 'ar'
    return ''
}

export function pageProfile(items) {
    const list = items || []
    const lines = groupLines(list)
    const lineOf = new Array(list.length)
    lines.forEach((members, n) => { for (const i of members) lineOf[i] = n })
    const anchors = { ar: 0, lat: 0 }
    for (const it of list) {
        if (!isAnchor(it)) continue
        const s = scriptOf(it.str)
        if (s) anchors[s] += 1
    }
    const anchoredLines = lines.map((members) => members.some((i) => isAnchor(list[i]) && !isForeign(list[i], anchors)))
    const prose = lines.filter((members) => members.length >= 3 && members.filter((i) => isAnchor(list[i])).length >= 2)
    const proseShare = prose.reduce((n, members) => n + members.length, 0) / Math.max(1, list.length)
    const cover = prose.length < 3 || proseShare < 0.35
    return { lineOf, anchors, anchoredLines, cover }
}

function legacyClean(list, vouch) {
    const art = isArtPage(list)
    return list.filter((it) => {
        const str = (it.str || '').trim()
        if (!str) return false
        if (vouch(str)) return true
        const conf = it.conf ?? 100
        const letters = letterCount(str)
        if (art) return conf >= 70 && letters >= 3
        if (letters <= 2 && conf < 30) return false
        if (letters === 0 && conf < 50) return false
        return true
    })
}

export function cleanOcrItems(items, { vouch = () => false, known = null } = {}) {
    const list = items || []
    if (list.some((it) => it.fontName && it.fontName !== 'ocr' && it.fontName !== 'basmala')) return legacyClean(list, vouch)
    const profile = pageProfile(list)
    const lead = leadOf(profile.anchors)
    return list.filter((it, i) => {
        const str = (it.str || '').trim()
        if (!str) return false
        if (it.fontName === 'basmala') return true
        if (isForeign(it, profile.anchors)) return false
        if (!vouch(str) && isJunkWord(it, known, lead)) return false
        const conf = it.conf ?? 100
        if (profile.cover) {
            if (!profile.anchoredLines[profile.lineOf[i]]) return false
            if (vouch(str)) return true
            const alnum = alnumCount(str)
            if (!alnum) return false
            return alnum === 1 ? conf >= 80 : conf >= 40
        }
        if (vouch(str)) return true
        const letters = letterCount(str)
        if (letters <= 2 && conf < 30) return false
        if (letters === 0) {
            if (conf < 60) return false
            if (!profile.anchoredLines[profile.lineOf[i]]) return false
            if ([...str.replace(/\p{Cf}/gu, '')].length === 1 && conf < 90) return false
        }
        return true
    })
}

const medianOf = (nums) => {
    if (!nums.length) return 0
    const sorted = [...nums].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export function isUnreadableCover(items, pageNum, { maxPage = 2, minConfident = 8, confident = 70, minMedian = 55 } = {}) {
    if (!(pageNum >= 1 && pageNum <= maxPage)) return false
    const words = (items || []).filter((it) => (it.str || '').trim() && alnumCount(it.str) > 0)
    const sure = words.filter((it) => (it.conf ?? 100) >= confident && alnumCount(it.str) >= 2)
    if (sure.length < minConfident) return true
    return medianOf(words.map((it) => it.conf ?? 100)) < minMedian
}
