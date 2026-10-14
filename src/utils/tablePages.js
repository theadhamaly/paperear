import { layerItemsForPage, preparedItems, pageFromItems, isScannedPage, joinBlocksForSpeech } from './pageModel.js'
import { graphicsFromOperatorList } from './tableGraphics.js'
import { detectTables } from './tableDetect.js'
import { pageAnalysis, layoutTables, joinPageBreak } from './tableLayout.js'

const CACHE_PAGES = 48

const caches = new WeakMap()

const cacheFor = (pdf) => {
    if (!caches.has(pdf)) caches.set(pdf, new Map())
    return caches.get(pdf)
}

async function analysePage(pdf, pageNum, OPS, cache) {
    if (cache.has(pageNum)) {
        const hit = cache.get(pageNum)
        cache.delete(pageNum)
        cache.set(pageNum, hit)
        return hit
    }
    const page = await pdf.getPage(pageNum)
    const [, , width, height] = page.view
    const raw = await layerItemsForPage(page, OPS)
    const items = preparedItems(pageNum, raw)
    const graphics = items.length ? graphicsFromOperatorList(await page.getOperatorList(), OPS, height) : null
    const entry = { raw, width, height, analysis: pageAnalysis(detectTables({ items, graphics, width, height }), height) }
    cache.set(pageNum, entry)
    while (cache.size > CACHE_PAGES) cache.delete(cache.keys().next().value)
    return entry
}

export function carryAnnotations(previous, fresh) {
    const unused = [...(previous.blocks || [])]
    const blocks = fresh.blocks.map((block) => {
        if (block.geo === 'cell') return block
        const at = unused.findIndex((o) => o.geo !== 'cell' && (o.text === block.text || (block.cleanText && o.text === block.cleanText)))
        if (at < 0) return block
        const [old] = unused.splice(at, 1)
        const next = { ...block }
        if (old.chrome) next.chrome = old.chrome
        if (old.skip) next.skip = true
        if (old.usedClean && block.cleanText) {
            next.text = block.cleanText
            next.usedClean = true
        }
        return next
    })
    const text = joinBlocksForSpeech(blocks.filter((b) => !b.skip))
    return { ...fresh, blocks, text, charCount: text.length }
}

export async function withTablePages(pdf, pages, from, to, OPS) {
    const targets = pages.filter((p) => p.pageNum >= from && p.pageNum <= to && !p.tableScan && !p.ocr && !isScannedPage(p))
    const fresh = new Map()
    if (!targets.length) return { pages, fresh }
    const cache = cacheFor(pdf)
    const lo = Math.max(1, targets[0].pageNum - 1)
    const hi = Math.min(pdf.numPages, targets[targets.length - 1].pageNum + 1)
    const scanned = new Map()
    for (let n = lo; n <= hi; n++) {
        const entry = pages.find((p) => p.pageNum === n)
        if (entry && (entry.ocr || isScannedPage(entry))) continue
        scanned.set(n, await analysePage(pdf, n, OPS, cache))
    }
    for (let n = lo; n < hi; n++) {
        if (scanned.has(n) && scanned.has(n + 1)) joinPageBreak(scanned.get(n).analysis, scanned.get(n + 1).analysis)
    }
    const replaced = new Map()
    for (const page of targets) {
        const scan = scanned.get(page.pageNum)
        const tables = scan ? layoutTables(scan.analysis) : []
        let next = { ...page, tableScan: true }
        if (tables.length) {
            const rebuilt = pageFromItems(page.pageNum, scan.raw, scan.width, scan.height, { tables })
            if (rebuilt.tables) {
                fresh.set(page.pageNum, rebuilt)
                next = { ...carryAnnotations(page, rebuilt), tableScan: true }
            }
        }
        replaced.set(page.pageNum, next)
    }
    return { pages: pages.map((p) => replaced.get(p.pageNum) || p), fresh }
}
