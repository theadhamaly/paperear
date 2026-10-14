import { basmalaItemsForPage } from '../utils/basmala.js'
import { buildLexicon, correctItems, curatedEvidence, matchesCuratedSkeleton } from '../engine/scan.js'
import { splitLayerItems, isScannedPage } from '../utils/pageModel.js'
import { repairUnmappedGlyphs } from '../utils/ligatures.js'
import { cleanOcrItems, confidentWords, leadScript } from '../utils/ocrClean.js'

const DB_NAME = 'paperear_ocr'
const STORE = 'pages'
const CACHE_VERSION = 11
const TARGET_PX = 1800
const MIN_WORD_CONFIDENCE = 15

const assetBase = () =>
    new URL('tesseract/', window.location.origin + import.meta.env.BASE_URL).href

let workerPromise = null
let workerLangs = 'ara+eng'
const docLangs = new Map()

async function getWorker() {
    if (!workerPromise) {
        workerPromise = (async () => {
            const { createWorker } = await import('tesseract.js')
            const base = assetBase()
            workerLangs = 'ara+eng'
            return createWorker(['ara', 'eng'], 1, {
                workerPath: base + 'worker.min.js',
                corePath: base + 'core/',
                langPath: base + 'lang',
                gzip: true,
            })
        })()
        workerPromise.catch(() => { workerPromise = null })
    }
    return workerPromise
}

async function setWorkerLangs(worker, langs) {
    if (workerLangs === langs) return
    await worker.reinitialize(langs.split('+'))
    workerLangs = langs
}

export function langOfItems(items) {
    let ar = 0
    let lat = 0
    for (const it of items || []) {
        const s = it.str || ''
        if ((it.conf ?? 100) < 70 || letterCount(s) < 3) continue
        ar += (s.match(/[؀-ۿ]/g) || []).length
        lat += (s.match(/[A-Za-z]/g) || []).length
    }
    const total = ar + lat
    if (total < 40) return null
    if (ar / total >= 0.9) return 'ara'
    if (lat / total >= 0.9) return 'eng'
    return 'ara+eng'
}

function openDB() {
    return new Promise((resolve) => {
        let req
        try { req = indexedDB.open(DB_NAME, 1) } catch { return resolve(null) }
        if (!req) return resolve(null)
        req.onupgradeneeded = () => {
            const db = req.result
            if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' })
        }
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => resolve(null)
        req.onblocked = () => resolve(null)
    })
}

function asPromise(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
    })
}

const cacheId = (docId, pageNum) => `v${CACHE_VERSION}:${docId}:${pageNum}`

async function getCached(docId, pageNum) {
    const db = await openDB()
    if (!db) return null
    try {
        const rec = await asPromise(db.transaction(STORE, 'readonly').objectStore(STORE).get(cacheId(docId, pageNum)))
        return rec?.items || null
    } catch { return null } finally { db.close() }
}

async function putCached(docId, pageNum, items) {
    const db = await openDB()
    if (!db) return
    try {
        await asPromise(db.transaction(STORE, 'readwrite').objectStore(STORE).put({
            id: cacheId(docId, pageNum),
            items,
            savedAt: Date.now(),
        }))
    } catch { } finally { db.close() }
}

const hasSubstance = (s) => /[\p{L}\p{N}]/u.test(s)
const letterCount = (s) => (s.match(/\p{L}/gu) || []).length

export function itemsFromBlocks(blocks, pageHeight, scale) {
    const lines = []
    for (const b of blocks || [])
        for (const p of b.paragraphs || [])
            for (const l of p.lines || []) {
                const words = []
                let vouched = false
                for (const w of l.words || []) {
                    const str = (w.text || '').trim()
                    if (!str || !hasSubstance(str)) continue
                    const curatedShape = matchesCuratedSkeleton(str)
                    if ((w.confidence ?? 100) < MIN_WORD_CONFIDENCE && !curatedShape) continue
                    const { x0, y0, x1, y1 } = w.bbox || {}
                    if (!(x1 > x0) || !(y1 > y0)) continue
                    if (curatedShape) vouched = true
                    words.push({ str, x0, y0, x1, y1, confidence: w.confidence ?? 100 })
                }
                if (!words.length) continue
                const h = words.reduce((s, w) => s + (w.y1 - w.y0), 0) / words.length
                const conf = words.reduce((s, w) => s + w.confidence, 0) / words.length
                const letters = words.reduce((s, w) => s + letterCount(w.str), 0)
                lines.push({ words, h, conf, letters, vouched })
            }

    const sortedH = lines.map((l) => l.h).sort((a, b) => a - b)
    const medianH = sortedH[Math.floor(sortedH.length / 2)] || 0

    const items = []
    for (const l of lines) {
        if (!l.vouched && l.letters <= 3 && l.words.length <= 2 && l.h < medianH) continue
        if (!l.vouched && l.conf < 25 && l.words.length <= 4 && (l.h < medianH * 0.75 || l.h > medianH * 1.6)) continue
        for (const w of l.words) {
            const x = w.x0 / scale
            const y = pageHeight - w.y1 / scale
            const width = (w.x1 - w.x0) / scale
            const height = (w.y1 - w.y0) / scale
            items.push({ str: w.str, transform: [height, 0, 0, height, x, y], width, height, fontName: 'ocr', conf: w.confidence })
        }
    }
    return items
}

async function renderPageCanvas(page) {
    const [, , pw, ph] = page.view
    const scale = Math.max(1.5, Math.min(4, TARGET_PX / pw))
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
    return { canvas, ph, scale }
}

async function recognizeOn(worker, canvas, ph, scale) {
    const { data } = await worker.recognize(canvas, {}, { blocks: true, text: true })
    return itemsFromBlocks(data.blocks, ph, scale)
}

const hasArabic = (s) => /[؀-ۿ]/.test(s)

export function mergeHybrid(layerItems, araItems) {
    const truth = layerItems
        .filter((it) => !/[Ā-ʯ-ﭐ-﻿]/.test(it.str || ''))
        .map((it) => ({ ...it, conf: 95 }))
    const boxes = truth
        .filter((it) => (it.str || '').trim())
        .map((it) => {
            const x1 = it.transform[4]
            const y1 = it.transform[5]
            const h = it.height || Math.abs(it.transform[3]) || 0
            return { x1, y1, x2: x1 + (it.width || 0), y2: y1 + h, area: Math.max(1, (it.width || 0) * h) }
        })
    const kept = araItems.filter((it) => {
        if (!hasArabic(it.str)) return false
        const x1 = it.transform[4]
        const y1 = it.transform[5]
        const x2 = x1 + it.width
        const y2 = y1 + it.height
        const area = Math.max(1, it.width * it.height)
        let covered = 0
        for (const b of boxes) {
            const ix = Math.min(x2, b.x2) - Math.max(x1, b.x1)
            if (ix <= 0) continue
            const iy = Math.min(y2, b.y2) - Math.max(y1, b.y1)
            if (iy <= 0) continue
            covered += ix * iy
        }
        return covered / area <= 0.4
    })
    return [...truth, ...kept]
}

export function mergeBilingual(engItems, araItems) {
    const ar = araItems.filter((it) => hasArabic(it.str))
    const en = engItems.filter((it) => !hasArabic(it.str))
    const lead = leadScript(en, ar)
    const arabicWins = (a, e) => {
        if (lead === 'ar') return true
        if (lead === 'lat') return false
        if ((e.conf ?? 60) >= 90 && (a.conf ?? 60) < (e.conf ?? 60)) return false
        return (a.conf ?? 60) >= (e.conf ?? 60) - 20
    }
    const box = (it) => {
        const x1 = it.transform[4]
        const y1 = it.transform[5]
        return { x1, y1, x2: x1 + it.width, y2: y1 + it.height, area: Math.max(1, it.width * it.height) }
    }
    const arBox = ar.map(box)
    const enBox = en.map(box)
    const overlap = (a, b) => {
        const ix = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1)
        if (ix <= 0) return 0
        const iy = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1)
        if (iy <= 0) return 0
        return (ix * iy) / Math.min(a.area, b.area)
    }
    const dropEn = new Set()
    const dropAr = new Set()
    for (let i = 0; i < ar.length; i++) {
        for (let j = 0; j < en.length; j++) {
            if (dropEn.has(j)) continue
            if (overlap(arBox[i], enBox[j]) <= 0.4) continue
            if (arabicWins(ar[i], en[j])) dropEn.add(j)
            else { dropAr.add(i); break }
        }
    }
    return [...en.filter((_, j) => !dropEn.has(j)), ...ar.filter((_, i) => !dropAr.has(i))]
}

async function recognizeUncached(pdf, pageNum, docId) {
    const worker = await getWorker()
    const page = await pdf.getPage(pageNum)
    const known = docLangs.get(docId)
    const { canvas, ph, scale } = await renderPageCanvas(page)
    let content = null
    try { content = await page.getTextContent() } catch { content = null }
    const layerItems = repairUnmappedGlyphs(content?.items)
    const layer = splitLayerItems(layerItems)
    let items
    if (layer.junk.length >= 3 && layer.good.length >= 8) {
        await setWorkerLangs(worker, 'ara')
        const araItems = await recognizeOn(worker, canvas, ph, scale)
        items = mergeHybrid(layer.good, araItems)
    } else if (known === 'ara' || known === 'eng') {
        await setWorkerLangs(worker, known)
        items = await recognizeOn(worker, canvas, ph, scale)
    } else {
        await setWorkerLangs(worker, 'eng')
        const engItems = await recognizeOn(worker, canvas, ph, scale)
        await setWorkerLangs(worker, 'ara')
        const araItems = await recognizeOn(worker, canvas, ph, scale)
        items = mergeBilingual(engItems, araItems)
        const lang = known ? null : langOfItems(items)
        if (lang) docLangs.set(docId, lang)
    }
    const sacred = await basmalaItemsForPage(page, layerItems)
    if (sacred.length) items = [...items, ...sacred]
    canvas.width = 0
    canvas.height = 0
    putCached(docId, pageNum, items)
    return items
}

let jobToken = 0
const recognizing = new Map()

function recognizeOnce(pdf, pageNum, docId) {
    const key = `${docId}:${pageNum}`
    if (recognizing.has(key)) return recognizing.get(key)
    const job = recognizeUncached(pdf, pageNum, docId).finally(() => recognizing.delete(key))
    recognizing.set(key, job)
    return job
}

export async function prefetchPages(pdf, pageNums, docId) {
    const token = jobToken
    for (const n of pageNums) {
        if (jobToken !== token) return
        try {
            if (await getCached(docId, n)) continue
            await recognizeOnce(pdf, n, docId)
        } catch { return }
    }
}

export async function recognizePages(pdf, pageNums, docId, onProgress) {
    jobToken += 1
    const out = {}
    let done = 0
    for (const n of pageNums) {
        const cached = await getCached(docId, n)
        if (cached) {
            out[n] = cached
            if (!docLangs.has(docId)) {
                const d = langOfItems(cached)
                if (d) docLangs.set(docId, d)
            }
        } else {
            out[n] = await recognizeOnce(pdf, n, docId)
        }
        done += 1
        if (onProgress) onProgress(done, pageNums.length)
    }
    const curated = curatedEvidence(Object.values(out)) >= 2
    const known = confidentWords(Object.values(out))
    for (const n of Object.keys(out)) out[n] = cleanOcrItems(out[n], { vouch: curated ? matchesCuratedSkeleton : () => false, known })
    const lexicon = buildLexicon(Object.values(out))
    const allChanges = []
    for (const n of Object.keys(out)) {
        const { items, changes } = correctItems(out[n], lexicon, { curated })
        out[n] = items
        for (const c of changes) allChanges.push({ ...c, page: Number(n) })
    }
    if (allChanges.length) {
        try {
            const log = JSON.parse(localStorage.getItem('paperear_correction_log') || '[]')
            log.push(...allChanges.map((c) => ({ ...c, docId, at: Date.now() })))
            localStorage.setItem('paperear_correction_log', JSON.stringify(log.slice(-400)))
        } catch { }
    }
    return out
}

export { isScannedPage }
