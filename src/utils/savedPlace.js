const ANCHOR_SIZE = 4
const SEARCH_RADIUS = 200
const WORD_CAP = 24

const norm = (word) => String(word ?? '').toLowerCase().slice(0, WORD_CAP)

export const anchorAt = (words, index) =>
    words.slice(index, index + ANCHOR_SIZE).map(norm)

const matchesAt = (words, index, anchor) => {
    if (index < 0 || index + anchor.length > words.length) return false
    for (let i = 0; i < anchor.length; i++) if (norm(words[index + i]) !== anchor[i]) return false
    return true
}

export const resolveSavedWord = (words, saved) => {
    if (!saved || !words.length) return 0
    const raw = Number(saved.word)
    if (!Number.isFinite(raw) || raw <= 0) return 0
    const index = Math.floor(raw)
    const anchor = Array.isArray(saved.anchor) && saved.anchor.length ? saved.anchor.map(norm) : null
    if (index >= words.length) {
        if (!anchor) return 0
        for (let d = 0; d <= SEARCH_RADIUS; d++) {
            const at = words.length - 1 - d
            if (at >= 0 && matchesAt(words, at, anchor)) return at
        }
        return 0
    }
    if (!anchor || matchesAt(words, index, anchor)) return index
    for (let d = 1; d <= SEARCH_RADIUS; d++) {
        if (matchesAt(words, index - d, anchor)) return index - d
        if (matchesAt(words, index + d, anchor)) return index + d
    }
    return index
}

export const savedPlaceFor = (saved, from) =>
    saved && saved.word > 0 && saved.from === from ? saved : null

export const isStaleRangeKey = (key, id) => {
    const text = String(key)
    const name = String(id).replace(/:\d+$/, '')
    if (text === id || !text.startsWith(`${name}:`)) return false
    return /^\d+$/.test(text.slice(name.length + 1))
}

export const prunedRanges = (all, id) =>
    Object.fromEntries(Object.entries(all).filter(([key]) => !isStaleRangeKey(key, id)))
