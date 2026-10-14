import { buildBlockModel } from './blockModel.js'
import { basmalaItemsForPage } from './basmala.js'
import { repairUnmappedGlyphs } from './ligatures.js'
import { dropInventedSpaces, mayHaveInventedSpaces } from './trackedSpaces.js'
import { pageGlyphs } from './glyphBoxes.js'





const CHARS_PER_LOGICAL_PAGE = 1800


export function recommendedBudget() {

    const mem = (typeof navigator !== 'undefined' && navigator.deviceMemory) || 4



    if (mem >= 8) return 28000
    if (mem >= 4) return 18000
    return 12000
}


export function shiftWindow(from, to, delta, total) {
    const size = to - from
    let nf = from + delta
    let nt = to + delta
    if (nf < 1) { nf = 1; nt = Math.min(total, 1 + size) }
    if (nt > total) { nt = total; nf = Math.max(1, total - size) }
    return { from: nf, to: nt }
}



function cleanText(s) {
    return (s || '')
        .replace(/[ \t]+/g, ' ')
        .replace(/Page \d+( of \d+)?/gi, '')
        .trim()
}




function isTitleLike(text) {
    const t = (text || '').trim()
    const words = t.split(/\s+/).filter(Boolean).length
    if (!words || words > 12) return false
    const letters = t.replace(/[^A-Za-z]/g, '')
    return letters.length >= 3 && letters === letters.toUpperCase()
}

export function joinBlocksForSpeech(blocks) {
    let out = ''
    let prev = null
    for (const b of blocks || []) {
        const t = b && b.text ? b.text : ''
        if (!t) continue
        if (prev) {
            const prevText = prev.text || ''
            if (b.geo === 'cell' || prev.geo === 'cell') {
                out += b.row === prev.row ? '\n' : '\n\n'
                out += t
                prev = b
                continue
            }
            const rowPair = b.type === 'item' && prev.type === 'item'
            const pause = b.type === 'heading' || prev.type === 'heading'
                || b.geo === 'page-number' || prev.geo === 'page-number'
                || isTitleLike(b.text) || isTitleLike(prev.text)
                || /[\d٠-٩]["'»)\]]?\s*$/.test(prevText)
                || prevText.includes('\n')
                || /[.!?:;،؛؟)\]]["'»]?\s*$/.test(prevText)
            const hardBreak = prev.hardEnd && !/^\p{Ll}/u.test(t)
            out += rowPair || (hardBreak && !pause) ? '\n' : pause ? '\n\n' : ' '
        }
        out += t
        prev = b
    }
    return out
}


function isTocKeyword(t) {
    return /\b(table\s+of\s+)?contents?\b/i.test(t) ||
        /\bcontent\s+list\b/i.test(t) ||
        /\bindex\b/i.test(t)
}



function isEntryLike(t) {
    const s = t.trim()
    return /^(chapter|section|part|appendix|unit|lesson)\b/i.test(s) ||
        /(\.{2,}|·|…)\s*\d{1,4}$/.test(s) ||
        (/\s\d{1,4}$/.test(s) && s.length <= 90)
}







export function mergeDropCaps(items) {
    if (!items || items.length < 2) return items || []
    const out = []
    for (let i = 0; i < items.length; i++) {
        const it = items[i]
        const next = items[i + 1]
        const initial = (it.str || '').trim()
        if (initial.length === 1 && /[A-Za-z]/.test(initial)
            && next && (next.str || '').trim()
            && it.height && next.height && it.height > next.height * 1.6) {
            out.push({ ...next, str: initial + (next.str || '').replace(/^\s+/, '') })
            i++
        } else {
            out.push(it)
        }
    }
    return out
}





function repairTwoColumnNumbers(lines) {
    const isNum = (t) => /^\d{1,4}$/.test((t || '').trim())
    const nums = []
    for (let i = 0; i < lines.length; i++) if (isNum(lines[i].text)) nums.push(i)
    if (nums.length < 3) return
    const remove = new Set()
    for (const i of nums) {
        const nl = lines[i]
        const title = lines.find((l, j) => j !== i && !isNum(l.text) && Math.abs(l.y - nl.y) <= Math.max(2, (l.h || 12) * 0.6))
        if (title) {
            title.text = title.text.replace(/\s+$/, '') + ' ' + nl.text.trim()
            remove.add(i)
        }
    }
    if (remove.size) {
        const kept = lines.filter((_, i) => !remove.has(i))
        lines.length = 0
        lines.push(...kept)
    }
}

export function extractBlocks(rawItems) {
    const items = mergeDropCaps(rawItems)


    const lines = []
    let cur = null
    for (const it of items) {
        const s = it.str
        if (!s) continue
        const y = it.transform ? it.transform[5] : null
        const x = it.transform ? it.transform[4] : 0
        const h = it.height || 0
        if (cur && y !== null && Math.abs(cur.y - y) <= Math.max(2, cur.h * 0.5)) {
            cur.text += /\s$/.test(cur.text) || /^\s/.test(s) ? s : ' ' + s
            if (h > cur.h) cur.h = h
        } else {
            if (cur) lines.push(cur)
            cur = { text: s, y: y == null ? (cur ? cur.y : 0) : y, h: h || 12, x }
        }
    }
    if (cur) lines.push(cur)
    if (!lines.length) return []


    repairTwoColumnNumbers(lines)


    const median = (arr, fallback) => {
        if (!arr.length) return fallback
        const s = [...arr].sort((a, b) => a - b)
        return s[Math.floor(s.length / 2)]
    }
    const bodyH = median(lines.map((l) => l.h).filter((h) => h > 0), 12)
    const gaps = []
    for (let i = 1; i < lines.length; i++) {
        const g = lines[i - 1].y - lines[i].y
        if (g > 0) gaps.push(g)
    }
    const bodyGap = median(gaps, bodyH * 1.3)





    const xCounts = new Map()
    for (const l of lines) {
        const k = Math.round(l.x / 2) * 2
        xCounts.set(k, (xCounts.get(k) || 0) + 1)
    }
    let bodyLeft = 0, bestX = -1
    for (const [x, c] of xCounts) { if (c > bestX) { bestX = c; bodyLeft = x } }
    const indentMin = bodyLeft + Math.max(6, bodyH * 0.5)




    const tocPage = lines.some((l) => {
        const wc = l.text.trim().split(/\s+/).filter(Boolean).length
        return wc > 0 && wc <= 6 && isTocKeyword(l.text)
    })


    const entry = lines.map((l) => isEntryLike(l.text))
    const inRun = entry.map((e, i) => {
        if (!e) return false
        let run = 1, j = i - 1
        while (j >= 0 && entry[j]) { run++; j-- }
        j = i + 1
        while (j < lines.length && entry[j]) { run++; j++ }
        return run >= 3
    })


    const blocks = []
    let para = ''
    const flush = () => { const t = cleanText(para); if (t) blocks.push({ type: 'para', text: t }); para = '' }
    for (let i = 0; i < lines.length; i++) {
        const ln = lines[i]
        const words = ln.text.trim().split(/\s+/).filter(Boolean).length
        const isHeading = ln.h > bodyH * 1.3 && words > 0 && words <= 15
        if (isHeading) {
            flush()
            const t = cleanText(ln.text)
            if (t) blocks.push({ type: 'heading', text: t })
            continue
        }
        if (tocPage || inRun[i]) {
            flush()
            const t = cleanText(ln.text)
            if (t) blocks.push({ type: 'item', text: t })
            continue
        }
        const gap = i > 0 ? lines[i - 1].y - ln.y : 0
        const indented = ln.x > indentMin
        if (para && (gap > bodyGap * 1.6 || indented)) flush()
        para += (para ? ' ' : '') + ln.text
    }
    flush()
    return blocks
}















function blocksFromModel(model) {
    const out = []
    for (const idx of model.order) {
        const b = model.blocks[idx]
        if (!b.text.trim()) continue
        const type = b.type === 'heading' ? 'heading' : b.type === 'toc' ? 'item' : 'para'
        const entry = { type, text: b.beatText || b.text, geo: b.type }
        if (b.row) entry.row = b.row
        if (b.hardEnd) entry.hardEnd = true
        if (b.suggestedSkip) entry.skippable = true
        else if (b.readText && b.readText !== (b.beatText || b.text)) entry.cleanText = b.readText
        out.push(entry)
    }
    return out
}


export function applySkippable(pages, drop) {
    if (!drop) return pages
    return pages.map((p) => {
        let changed = false
        const blocks = (p.blocks || []).map((b) => {
            if (b.skippable && !b.skip) { changed = true; return { ...b, skip: true } }
            if (!b.skippable && b.cleanText && b.cleanText !== b.text) {
                changed = true
                return { ...b, text: b.cleanText, usedClean: true }
            }
            return b
        })
        if (!changed) return p
        const text = joinBlocksForSpeech(blocks.filter((b) => !b.skip))
        return { ...p, blocks, text, charCount: text.length }
    })
}

const hasArabicChar = (s) => /[؀-ۿ]/.test(s || '')
const hasArabicForms = (s) => /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/.test(s || '')

export function mergeGlyphRuns(items) {
    if (!items?.length) return items
    const sorted = [...items].sort((a, b) => (b.transform[5] - a.transform[5]) || (a.transform[4] - b.transform[4]))
    const out = []
    for (const it of sorted) {
        const prev = out[out.length - 1]
        if (prev && (prev.str || '').trim() && (it.str || '').trim() && !hasArabicChar(prev.str) && !hasArabicChar(it.str)) {
            const hPrev = prev.height || Math.abs(prev.transform[3]) || 0
            const hIt = it.height || Math.abs(it.transform[3]) || 0
            const h = Math.max(hPrev, hIt)
            const sizeAlike = h > 0 && Math.min(hPrev, hIt) / h > 0.75
            const sameLine = Math.abs(it.transform[5] - prev.transform[5]) <= h * 0.3
            const gap = it.transform[4] - (prev.transform[4] + (prev.width || 0))
            if (sizeAlike && sameLine && (gap > -1 || (gap > -h * 0.15 && !hasArabicForms(prev.str) && !hasArabicForms(it.str))) && gap < h * 0.12) {
                prev.str = (prev.str || '') + (it.str || '')
                prev.width = (it.transform[4] + (it.width || 0)) - prev.transform[4]
                continue
            }
        }
        out.push({ ...it })
    }
    return out
}

export function dropSuperscripts(items) {
    if (!items?.length) return items
    return items.filter((it) => {
        const t = (it.str || '').trim()
        if (!/^[0-9¹²³⁰-⁹]{1,3}$/.test(t)) return true
        const h = it.height || Math.abs(it.transform[3]) || 0
        if (!h) return true
        const y = it.transform[5]
        const line = items.filter((o) => o !== it && (o.str || '').trim() &&
            Math.abs(o.transform[5] - y) <= Math.max(h, o.height || 0) * 0.9)
        if (!line.length) return true
        const tallest = Math.max(...line.map((o) => o.height || Math.abs(o.transform[3]) || 0))
        if (h >= tallest * 0.8) return true
        const itEnd = it.transform[4] + (it.width || 0)
        const near = line.some((o) => {
            const oEnd = o.transform[4] + (o.width || 0)
            return Math.max(o.transform[4] - itEnd, it.transform[4] - oEnd) < h * 2
        })
        if (!near) return true
        const minX = Math.min(...line.map((o) => o.transform[4]))
        if (it.transform[4] < minX) return true
        return false
    })
}

export function markPageSkippable(page) {
    const blocks = (page.blocks || []).map((b) => ({ ...b, skippable: true }))
    return { ...page, blocks, decorative: true }
}

export const isScannedPage = (p) => (p?.charCount || 0) < 20

export function preparedItems(pageNum, rawItems) {
    return mergeDropCaps(mergeGlyphRuns(dropSuperscripts(stripInvisibleFolios(rawItems, pageNum))))
}

export function pageFromItems(pageNum, rawItems, pageWidth, pageHeight, { rtl = false, tables = null } = {}) {
    rawItems = mergeGlyphRuns(dropSuperscripts(stripInvisibleFolios(rawItems, pageNum)))
    let blocks
    let tocPage = false
    try {
        const model = buildBlockModel(mergeDropCaps(rawItems), { pageWidth, pageHeight, rtl, tables })
        blocks = blocksFromModel(model)
        tocPage = !!model.tocPage
    } catch {
        blocks = null
    }
    if (!blocks || !blocks.length) blocks = extractBlocks(rawItems)

    const text = joinBlocksForSpeech(blocks.filter((b) => !b.skip))
    const entry = { pageNum, text, charCount: text.length, blocks, tocPage }
    if (tables?.length && blocks.some((b) => b.geo === 'cell')) entry.tables = tables
    return entry
}


export function stripInvisibleFolios(items, pageNum) {
    if (!pageNum) return items
    return (items || []).filter((it) => {
        const t = (it.str || '').trim()
        return !(/^[IVXLC]{1,7}$/.test(t) && romanToInt(t) === pageNum)
    })
}


const isJunkLetter = (c) => {
    const p = c.codePointAt(0)
    return (p >= 0x0100 && p <= 0x02af) || (p >= 0xe000 && p <= 0xf8ff)
}

export function textLayerTrusted(items) {
    let good = 0
    let bad = 0
    for (const it of items || []) {
        for (const w of (it.str || '').split(/\s+/)) {
            const letters = w.match(/\p{L}/gu) || []
            if (!letters.length) continue
            if (letters.filter(isJunkLetter).length / letters.length > 0.5) bad++
            else good++
        }
    }
    const total = good + bad
    return total < 8 || bad / total <= 0.2
}


export function splitLayerItems(items) {
    const good = []
    const junk = []
    for (const it of items || []) {
        const letters = ((it.str || '').match(/\p{L}/gu) || [])
        if (letters.length && letters.filter(isJunkLetter).length / letters.length > 0.5) junk.push(it)
        else good.push(it)
    }
    return { good, junk }
}


export function blockCounts(page) {
    return (page.blocks || []).map((b) => b.skip
        ? { type: 'chrome', count: 0, skip: true, text: b.text }
        : { type: b.type, count: (b.text || '').trim().split(/\s+/).filter(Boolean).length, usedClean: !!b.usedClean, ...(b.geo === 'cell' ? { cell: true } : {}) })
}

function tagMonospace(items, styles) {
    const monospaced = new Set(Object.entries(styles || {}).filter(([, style]) => /mono/i.test(style.fontFamily || '')).map(([name]) => name))
    if (!monospaced.size) return items
    return items.map((it) => (monospaced.has(it.fontName) ? { ...it, mono: true } : it))
}

export async function layerItemsForPage(page, OPS) {
    const content = await page.getTextContent()
    let items = tagMonospace(repairUnmappedGlyphs(content.items), content.styles)
    if (OPS && typeof page.getOperatorList === 'function' && items.some((it) => mayHaveInventedSpaces(it.str))) {
        items = dropInventedSpaces(items, await pageGlyphs(page, OPS))
    }
    const { good, junk } = splitLayerItems(items)
    const layer = junk.length < 3 ? items : good
    const sacred = await basmalaItemsForPage(page, layer)
    return sacred.length ? [...layer, ...sacred] : layer
}

export async function buildPagesFromPdf(pdf, onProgress, OPS) {
    const pages = []
    let totalChars = 0
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i)
        const [, , pw, ph] = page.view
        const items = await layerItemsForPage(page, OPS)
        const entry = pageFromItems(i, items, pw, ph)
        pages.push(entry)
        totalChars += entry.charCount
        onProgress?.(i, pdf.numPages)
    }
    return { pages, totalChars }
}


export function firstContentPage(pages) {
    if (!pages?.length) return 1
    const words = (t) => (t || '').trim().split(/\s+/).filter(Boolean).length
    const scanMax = Math.min(pages.length, Math.max(12, Math.ceil(pages.length * 0.15)))
    for (let i = 0; i < scanMax; i++) {
        const p = pages[i]
        if (p.tocPage) continue



        const legalTitle = (p.blocks || []).some((b) => {
            const t = (b.text || '').trim()
            return /\b(legal notice|disclaimer|copyright page)\b/i.test(t) && t.split(/\s+/).length <= 8
        })
        if (legalTitle) continue


        const readBlocks = (p.blocks || []).filter((b) => !b.skip && !b.skippable)
        const totalRead = readBlocks.reduce((s, b) => s + words(b.text), 0)
        if (totalRead < 40) continue
        const tocRead = readBlocks
            .filter((b) => b.geo === 'toc' || b.type === 'item')
            .reduce((s, b) => s + words(b.text), 0)
        if (tocRead > totalRead * 0.35) continue
        return p.pageNum
    }
    return pages[0].pageNum
}








function normalizeChromeSig(text) {
    return (text || '')
        .toLowerCase()
        .replace(/\d+/g, '#')



        .replace(/\b[ivxlcdm]{1,8}\b/g, '#')
        .replace(/[^\p{L}#]+/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}


function classifyChrome(text) {
    const t = (text || '').trim()
    const words = t.split(/\s+/).filter(Boolean)
    if (/scan|download|free books|bookey|subscribe|follow us|visit us|buy now|coupon|www\.|https?:\/\/|\b\S+\.(?:com|net|org|io)\b|\bqr\b/i.test(t)) return 'promo'
    if (words.length < 2 || !/[a-z؀-ۿ]{3,}/i.test(t)) return 'promo'
    return 'info'
}


export function detectChrome(pages) {
    if (!pages || pages.length < 3) return []
    const threshold = Math.max(3, Math.ceil(pages.length * 0.25))
    const EDGE = 5
    const seen = new Map()

    const note = (block, position) => {
        const wc = (block.text || '').trim().split(/\s+/).filter(Boolean).length
        if (wc === 0 || wc > 40) return
        const sig = normalizeChromeSig(block.text)
        if (!sig || sig === '#') return
        const rec = seen.get(sig) || { count: 0, sample: block.text, header: 0, footer: 0 }
        rec.count++
        rec[position]++
        seen.set(sig, rec)
    }
    for (const p of pages) {
        const b = p.blocks || []
        const n = b.length
        for (let i = 0; i < Math.min(EDGE, n); i++) note(b[i], 'header')
        for (let i = Math.max(0, n - EDGE); i < n; i++) note(b[i], 'footer')
    }

    const bands = new Map()
    for (const [sig, rec] of seen) {
        if (rec.count >= threshold) {



            const position = rec.footer >= rec.header ? 'footer' : 'header'
            const type = classifyChrome(rec.sample) === 'promo' || position === 'footer' ? 'promo' : 'info'
            bands.set(sig, { signature: sig, sampleText: rec.sample, position, count: rec.count, type })
        }
    }


    for (const p of pages) {
        const b = p.blocks || []
        const n = b.length
        const edges = new Set()
        for (let i = 0; i < Math.min(EDGE, n); i++) edges.add(i)
        for (let i = Math.max(0, n - EDGE); i < n; i++) edges.add(i)
        for (const i of edges) {
            const band = bands.get(normalizeChromeSig(b[i].text))
            if (band) b[i].chrome = { signature: band.signature, position: band.position, type: band.type }
        }
    }
    return [...bands.values()]
}


export function applyChromeSkip(pages, bands) {
    const typeBySig = new Map((bands || []).map((b) => [b.signature, b.type]))
    if (!typeBySig.size) return pages
    const seenInfo = new Set()
    return pages.map((p) => {
        const blocks = (p.blocks || []).map((b) => {
            const sig = b.chrome && b.chrome.signature
            if (!sig || !typeBySig.has(sig)) return b
            if (typeBySig.get(sig) !== 'info') return { ...b, skip: true }
            if (seenInfo.has(sig)) return { ...b, skip: true }
            seenInfo.add(sig)
            return b
        })
        const text = joinBlocksForSpeech(blocks.filter((b) => !b.skip))
        return { ...p, blocks, text, charCount: text.length }
    })
}


function romanToInt(s) {
    const t = (s || '').toLowerCase()
    if (!/^[ivxlcdm]+$/.test(t)) return null
    const m = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 }
    let total = 0
    for (let k = 0; k < t.length; k++) total += m[t[k]] < (m[t[k + 1]] || 0) ? -m[t[k]] : m[t[k]]
    return total > 0 ? total : null
}



function pageNumValue(text, allowRoman = false) {
    const core = (text || '').trim()
        .replace(/^[-–—\s]*(?:page\s+)?/i, '')
        .replace(/[-–—.\s]*$/, '')


    const arabic = core
        .replace(/[٠-٩]/g, (d) => d.charCodeAt(0) - 0x0660)
        .replace(/[۰-۹]/g, (d) => d.charCodeAt(0) - 0x06F0)
    if (/^\d{1,4}$/.test(arabic)) return parseInt(arabic, 10)
    if (allowRoman && /^[ivxlcdm]{1,7}$/.test(core)) return romanToInt(core)
    return null
}


export function detectPageNumbers(pages) {
    if (!pages || pages.length < 3) return null
    const frontMatter = Math.max(8, Math.ceil(pages.length * 0.15))
    const cands = []
    pages.forEach((p, pageIdx) => {
        const b = p.blocks || []
        const edges = [0, 1, b.length - 1, b.length - 2].filter((i) => i >= 0 && i < b.length)
        for (const i of edges) {
            const v = pageNumValue(b[i].text, pageIdx < frontMatter)
            if (v != null) { cands.push({ value: v, block: b[i] }); break }
        }
    })
    if (cands.length < Math.max(3, pages.length * 0.4)) return null

    let inc = 0
    for (let i = 1; i < cands.length; i++) {
        const d = cands[i].value - cands[i - 1].value
        if (d >= 1 && d <= 3) inc++
    }
    if (inc < (cands.length - 1) * 0.6) return null
    for (const c of cands) c.block.chrome = { signature: '__pagenum__', position: 'edge', type: 'pagenum' }
    const vals = cands.map((c) => c.value)
    const min = vals.reduce((a, b) => Math.min(a, b), Infinity)
    const max = vals.reduce((a, b) => Math.max(a, b), -Infinity)
    return { signature: '__pagenum__', type: 'pagenum', position: 'edge', count: cands.length, sampleText: `Page numbers (${min}–${max})` }
}




function isPromoLine(text) {
    const t = (text || '').trim()
    const wc = t.split(/\s+/).filter(Boolean).length
    if (wc === 0 || wc > 12) return false
    return /\bwww\.|https?:\/\//i.test(t)

        || /\b[a-z0-9][a-z0-9-]*\.(?:com|net|org|io|ca|co|uk|info|biz|app|dev|store|shop|ai|online|site)\b/i.test(t)
        || /(?:\+?\d[\s.\-]?)?\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}\b/.test(t)
        || /\b1[\s.\-]?8(?:00|33|44|55|66|77|88)\b/.test(t)
        || /\bscan\b|\bqr\b|coupon|subscribe|\bvisit\s+(?:us|our)\b|buy\s+now|call\s+now|click\s+here|toll[\s-]?free/i.test(t)
        || /\bfree\b[\s\S]*\b(?:e-?book|books?|edition|pdf|download|trial|training)\b/i.test(t)
        || /\bdownload\b[\s\S]*\b(?:pdf|e-?book|free|book|edition)\b/i.test(t)
        || /re-?published\s+by/i.test(t)
        || /\b(?:pdf|e-?book)\s+edition\b/i.test(t)
}


export function skipToggleRuns(rawPages, bands, from, to) {
    const on = applyChromeSkip(applySkippable(rawPages, true), bands)
    const wordsIn = (s) => (s || '').trim().split(/\s+/).filter(Boolean).length
    const runs = []
    rawPages.forEach((raw, pi) => {
        if (raw.pageNum < from || raw.pageNum > to) return
        ;(raw.blocks || []).forEach((rb, bi) => {
            const ob = on[pi].blocks[bi]
            const total = wordsIn(rb.text)
            if (!total) return
            if (ob.skip) { runs.push({ chrome: true, count: total }); return }
            const kept = ob.usedClean ? wordsIn(ob.text) : total
            runs.push({ chrome: false, count: kept })
            if (total > kept) runs.push({ chrome: true, count: total - kept })
        })
    })
    return runs
}

export function remapChromeToggleIndex(runs, idx, currentlySkipping, willSkip) {

    let ord
    if (currentlySkipping) {
        ord = idx
    } else {
        let acc = 0, readable = 0
        ord = readable
        for (const r of runs) {
            if (idx < acc + r.count) { ord = r.chrome ? readable : readable + (idx - acc); break }
            acc += r.count
            if (!r.chrome) readable += r.count
            ord = readable
        }
    }

    if (willSkip) return ord
    let acc = 0, readable = 0, out = 0
    for (const r of runs) {
        if (!r.chrome) {
            if (ord < readable + r.count) return acc + (ord - readable)
            readable += r.count
        }
        acc += r.count
        out = acc
    }
    return out
}


export function detectPromoLines(pages) {
    let count = 0
    for (const p of pages || []) {
        for (const b of (p.blocks || [])) {
            if (!b.chrome && isPromoLine(b.text)) {
                b.chrome = { signature: '__promo__', position: 'overlay', type: 'promo' }
                count++
            }
        }
    }
    return count ? { signature: '__promo__', type: 'promo', position: 'overlay', count, sampleText: 'Promotional overlays' } : null
}


export function buildPagesFromText(text, charsPerPage = CHARS_PER_LOGICAL_PAGE) {
    const clean = (text || '').replace(/\r\n/g, '\n').trim()
    if (!clean) return { pages: [], totalChars: 0 }

    const paragraphs = clean.split(/\n\s*\n/)
    const pages = []
    let buf = ''
    let pageNum = 1

    const flush = () => {
        const t = buf.trim()
        if (t) pages.push({ pageNum: pageNum++, text: t, charCount: t.length })
        buf = ''
    }

    for (const para of paragraphs) {


        if (para.length > charsPerPage) {
            flush()
            for (let i = 0; i < para.length; i += charsPerPage) {
                const slice = para.slice(i, i + charsPerPage).trim()
                if (slice) pages.push({ pageNum: pageNum++, text: slice, charCount: slice.length })
            }
            continue
        }
        if (buf.length + para.length > charsPerPage) flush()
        buf += (buf ? '\n\n' : '') + para
    }
    flush()



    for (const p of pages) {
        p.blocks = (p.text || '')
            .split(/\n\s*\n/)
            .map((t) => t.trim())
            .filter(Boolean)
            .map((t) => ({ type: 'para', text: t }))
        p.text = joinBlocksForSpeech(p.blocks)
        p.charCount = p.text.length
    }
    const totalChars = pages.reduce((s, p) => s + p.charCount, 0)
    return { pages, totalChars }
}



function stripMdInline(s) {
    return (s || '')
        .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/(\*\*|__)(.*?)\1/g, '$2')
        .replace(/(\*|_)(.*?)\1/g, '$2')
        .replace(/~~(.*?)~~/g, '$1')
        .replace(/\s+/g, ' ')
        .trim()
}


function parseMarkdownToBlocks(md) {
    const blocks = []
    const lines = (md || '').replace(/\r\n/g, '\n').split('\n')
    let para = []
    let inFence = false
    const flushPara = () => {
        if (!para.length) return
        const t = stripMdInline(para.join(' '))
        if (t) blocks.push({ type: 'para', text: t })
        para = []
    }
    for (const raw of lines) {
        if (/^\s*(```|~~~)/.test(raw)) { inFence = !inFence; flushPara(); continue }
        if (inFence) continue
        const trimmed = raw.trim()
        if (!trimmed) { flushPara(); continue }
        if (/^([*\-_]\s*){3,}$/.test(trimmed)) { flushPara(); continue }
        const h = trimmed.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/)
        if (h) { flushPara(); const t = stripMdInline(h[2]); if (t) blocks.push({ type: 'heading', text: t }); continue }
        const li = trimmed.match(/^([-*+]|\d+[.)])\s+(.*)$/)
        if (li) { flushPara(); const t = stripMdInline(li[2]); if (t) blocks.push({ type: 'item', text: t }); continue }
        const bq = trimmed.match(/^>\s?(.*)$/)
        para.push(bq ? bq[1] : trimmed)
    }
    flushPara()
    return blocks
}


export function buildPagesFromMarkdown(md, charsPerPage = CHARS_PER_LOGICAL_PAGE) {
    const all = parseMarkdownToBlocks(md)
    if (!all.length) return { pages: [], totalChars: 0 }
    const pages = []
    let buf = []
    let bufLen = 0
    let pageNum = 1
    const flush = () => {
        if (!buf.length) return
        const text = joinBlocksForSpeech(buf)
        pages.push({ pageNum: pageNum++, text, charCount: text.length, blocks: buf })
        buf = []
        bufLen = 0
    }
    for (const b of all) {
        if (bufLen + b.text.length > charsPerPage && buf.length) flush()
        buf.push(b)
        bufLen += b.text.length
    }
    flush()
    const totalChars = pages.reduce((s, p) => s + p.charCount, 0)
    return { pages, totalChars }
}


export function rangeText(pages, start, end) {
    const s = Math.max(1, start)
    const e = Math.min(pages.length, end)
    const slice = pages.filter((p) => p.pageNum >= s && p.pageNum <= e)
    const text = joinPages(slice)
    return { text, charCount: text.length, fromPage: s, toPage: e }
}


export function joinPages(pages) {
    let out = ''
    for (const pg of pages) {
        const t = (pg.text || '').trim()
        if (!t) continue
        if (out) {
            if (/^[a-z]/.test(t)) {
                out += ' '
            } else {
                const prevEndsSentence = /[.!?:;،؛؟]["'»)\]]?$/.test(out)
                out += prevEndsSentence ? '\n\n' : '.\n\n'
            }
        }
        out += t
    }
    return out
}


export function fitRange(pages, startPage, budget = recommendedBudget()) {
    let chars = 0
    let end = startPage
    for (const p of pages) {
        if (p.pageNum < startPage) continue
        if (chars + p.charCount > budget && end > startPage) break
        chars += p.charCount
        end = p.pageNum
    }
    return { fromPage: startPage, toPage: end, charCount: chars }
}
