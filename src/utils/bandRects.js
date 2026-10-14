import { BAND_MAX_LINES } from './speechUnits.js'

export function bandBoxesForRange(model, align, range) {
    if (!model || !align || !range) return []
    const lines = new Map()
    const last = Math.min(range[1], align.readingIndexToBox.length - 1)
    for (let reading = Math.max(0, range[0]); reading <= last; reading++) {
        const index = align.readingIndexToBox[reading]
        const word = model.words[index]
        if (!word || word.foreign || align.skipByBox[index]) continue
        const key = `${word.block}:${word.line}`
        const line = lines.get(key)
        if (!line) {
            lines.set(key, { x0: word.x, x1: word.x + word.w, y: word.y, top: word.y + word.h, h: word.h })
        } else {
            line.x0 = Math.min(line.x0, word.x)
            line.x1 = Math.max(line.x1, word.x + word.w)
            line.y = Math.min(line.y, word.y)
            line.top = Math.max(line.top, word.y + word.h)
            line.h = Math.max(line.h, word.h)
        }
    }
    return [...lines.values()].map((line) => ({ x: line.x0, y: line.y, w: line.x1 - line.x0, h: line.h }))
}

export function pickBandBoxes(model, align, range, shortRange = null, maxLines = BAND_MAX_LINES) {
    const boxes = bandBoxesForRange(model, align, range)
    if (boxes.length <= maxLines || !shortRange) return boxes
    return bandBoxesForRange(model, align, shortRange)
}
