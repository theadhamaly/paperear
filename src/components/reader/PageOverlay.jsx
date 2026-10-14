








import { useEffect, useMemo, useRef, useState } from 'react'
import { buildBlockModel, alignBoxMap, detectRtlItems } from '../../utils/blockModel'
import { mergeDropCaps, stripInvisibleFolios, mergeGlyphRuns, dropSuperscripts, layerItemsForPage } from '../../utils/pageModel'
import { pageGlyphs } from '../../utils/glyphBoxes'
import { pickBandBoxes } from '../../utils/bandRects'
import Busy from '../Busy'
import './PageOverlay.css'

export default function PageOverlay({
    page,
    scale = 1.5,
    currentReadingIndex = -1,
    onWordClick,
    pipelineBlocks = null,
    tables = null,
    ocrItems = null,
    rtl = false,
    wordIndexBase = 0,
    band = null,
}) {
    const canvasRef = useRef(null)
    const [model, setModel] = useState(null)
    const [size, setSize] = useState({ w: 0, h: 0 })
    const [pageDark, setPageDark] = useState(false)
    const [painted, setPainted] = useState(false)

    const sampleLuminance = (canvas) => {
        try {
            const s = document.createElement('canvas')
            s.width = 32
            s.height = 32
            const c = s.getContext('2d')
            c.drawImage(canvas, 0, 0, 32, 32)
            const d = c.getImageData(0, 0, 32, 32).data
            let sum = 0
            for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]
            return sum / (d.length / 4) / 255
        } catch { return 1 }
    }

    const renderTaskRef = useRef(null)

    useEffect(() => {
        let dead = false
        if (!page) return undefined
        const viewport = page.getViewport({ scale })
        setSize({ w: viewport.width, h: viewport.height })

        const render = async () => {
            const canvas = canvasRef.current
            if (!canvas) return
            try { renderTaskRef.current?.cancel() } catch { }
            try { await renderTaskRef.current?.promise } catch { }
            if (dead || !canvasRef.current) return
            canvas.width = viewport.width
            canvas.height = viewport.height
            const ctx = canvas.getContext('2d')
            ctx.setTransform(1, 0, 0, 1, 0, 0)
            ctx.clearRect(0, 0, canvas.width, canvas.height)
            setPainted(false)
            const task = page.render({ canvasContext: ctx, viewport })
            renderTaskRef.current = task
            const ops = ocrItems ? null : await import('pdfjs-dist/build/pdf.mjs').then((m) => m.OPS).catch(() => null)
            const source = ocrItems || await layerItemsForPage(page, ops)
            if (dead) return
            const items = mergeDropCaps(mergeGlyphRuns(dropSuperscripts(stripInvisibleFolios(source, page.pageNumber))))
            const [, , pw, ph] = page.view
            const options = { pageWidth: pw, pageHeight: ph, rtl: ocrItems ? detectRtlItems(ocrItems) : rtl, tables: ocrItems ? null : tables }
            setModel(buildBlockModel(items, options))
            await task.promise.catch(() => {})
            if (!dead) setPainted(true)
            if (renderTaskRef.current === task) renderTaskRef.current = null
            if (!dead && canvasRef.current) setPageDark(sampleLuminance(canvasRef.current) < 0.55)
            if (dead || ocrItems) return
            const glyphs = await import('pdfjs-dist/build/pdf.mjs')
                .then(({ OPS }) => pageGlyphs(page, OPS))
                .catch(() => null)
            if (!dead && glyphs?.length) setModel(buildBlockModel(items, { ...options, glyphs }))
        }
        render()
        return () => {
            dead = true
            try { renderTaskRef.current?.cancel() } catch { }
        }
    }, [page, scale, rtl, ocrItems, tables])

    const align = useMemo(
        () => (model ? alignBoxMap(model, pipelineBlocks) : null),
        [model, pipelineBlocks],
    )
    const currentBoxIdx = align ? align.readingIndexToBox[currentReadingIndex] : undefined

    const hlRef = useRef(null)

    const bandFrom = band ? band.range[0] : -1
    const bandTo = band ? band.range[1] : -1
    const shortFrom = band?.short ? band.short[0] : -1
    const shortTo = band?.short ? band.short[1] : -1
    const bandBoxes = useMemo(
        () => (model && align && bandFrom >= 0 ? pickBandBoxes(model, align, [bandFrom, bandTo], shortFrom >= 0 ? [shortFrom, shortTo] : null) : []),
        [model, align, bandFrom, bandTo, shortFrom, shortTo],
    )

    const pwv = page ? page.view[2] : 1
    const phv = page ? page.view[3] : 1
    const sxv = size.w / pwv || 1
    const syv = size.h / phv || 1

    useEffect(() => {
        const hl = hlRef.current
        const src = canvasRef.current
        if (!hl) return
        const wd = currentBoxIdx != null && currentBoxIdx >= 0 ? model?.words?.[currentBoxIdx] : null
        if (!wd || wd.foreign || !src || !src.width) {
            hl.style.display = 'none'
            return
        }
        const left = Math.max(0, Math.round(wd.x * sxv) - 3)
        const top = Math.max(0, Math.round((phv - wd.y - wd.h * 0.85) * syv) - 2)
        const w = Math.min(src.width - left, Math.round(wd.w * sxv) + 6)
        const h = Math.min(src.height - top, Math.round(wd.h * 1.15 * syv) + 4)
        if (w <= 0 || h <= 0) {
            hl.style.display = 'none'
            return
        }
        hl.width = w
        hl.height = h
        const ctx = hl.getContext('2d')
        try {
            ctx.drawImage(src, left, top, w, h, 0, 0, w, h)
            const img = ctx.getImageData(0, 0, w, h)
            const raw = getComputedStyle(hl).getPropertyValue('--overlay-current-veil').trim()
            const hex = /^#([0-9a-f]{6})$/i.exec(raw)?.[1] || '4F46E5'
            const vr = parseInt(hex.slice(0, 2), 16)
            const vg = parseInt(hex.slice(2, 4), 16)
            const vb = parseInt(hex.slice(4, 6), 16)
            const d = img.data
            for (let i = 0; i < d.length; i += 4) {
                const t = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255
                d[i] = 255 * (1 - t) + vr * t
                d[i + 1] = 255 * (1 - t) + vg * t
                d[i + 2] = 255 * (1 - t) + vb * t
                d[i + 3] = 255
            }
            ctx.putImageData(img, 0, 0)
            hl.style.left = `${left}px`
            hl.style.top = `${top}px`
            hl.style.display = 'block'
        } catch {
            hl.style.display = 'none'
        }
    }, [currentBoxIdx, model, size, sxv, syv, phv])

    if (!page) return null
    const [, , pw, ph] = page.view
    const sx = size.w / pw || 1
    const sy = size.h / ph || 1


    const cssBox = (b) => ({
        left: b.x * sx,
        top: (ph - b.y - b.h * 0.85) * sy,
        width: b.w * sx,
        height: b.h * 1.15 * sy,
    })

    return (
        <div className={'page-overlay' + (pageDark ? ' page-overlay--dark' : '')} style={{ width: size.w, height: size.h }}>
            <canvas ref={canvasRef} className="page-overlay__canvas" />
            <div className="page-overlay__band" aria-hidden="true">
                {bandBoxes.map((strip, k) => {
                    const box = cssBox(strip)
                    return (
                        <span
                            key={k}
                            className="page-overlay__band-strip"
                            style={{ left: box.left - 3, top: box.top - 1, width: box.width + 6, height: box.height + 2 }}
                        />
                    )
                })}
            </div>
            <canvas ref={hlRef} className="page-overlay__hl" style={{ display: 'none' }} />
            <Busy active={!painted} announce={false} className="busy--over" />
            {model && align && (() => {


                const { skipByBox, readingIndexToBox } = align
                const currentBox = currentBoxIdx
                const boxToReading = new Map(readingIndexToBox.map((boxIdx, r) => [boxIdx, r]))

                const strikes = new Map()
                model.words.forEach((wd, i) => {
                    if (!skipByBox[i]) return
                    const key = `${wd.block}:${wd.line}`
                    const s = strikes.get(key)
                    if (!s) strikes.set(key, { x0: wd.x, x1: wd.x + wd.w, y: wd.y, h: wd.h })
                    else {
                        s.x0 = Math.min(s.x0, wd.x)
                        s.x1 = Math.max(s.x1, wd.x + wd.w)
                    }
                })
                return (
                    <div className="page-overlay__boxes" aria-hidden="true">
                        {[...strikes.values()].map((s, k) => {
                            const box = cssBox({ x: s.x0, y: s.y, w: s.x1 - s.x0, h: s.h })
                            return (
                                <span
                                    key={`s${k}`}
                                    className="page-overlay__strike"
                                    style={{ left: box.left, width: box.width, top: box.top + box.height / 2 }}
                                />
                            )
                        })}
                        {model.words.map((wd, i) => {
                            if (wd.foreign) return null
                            const skipped = skipByBox[i]
                            const readingIdx = boxToReading.has(i) ? boxToReading.get(i) : -1
                            const isCurrent = i === currentBox
                            const box = cssBox(wd)
                            return (
                                <span
                                    key={i}
                                    className={
                                        'page-overlay__word' +
                                        (isCurrent ? ' is-current' : '') +
                                        (skipped ? ' is-skipped' : '')
                                    }
                                    style={box}
                                    data-word-index={readingIdx >= 0 && wordIndexBase >= 0 ? wordIndexBase + readingIdx : undefined}
                                    onClick={
                                        skipped || !onWordClick || readingIdx < 0
                                            ? undefined
                                            : () => onWordClick(readingIdx)
                                    }
                                />
                            )
                        })}
                    </div>
                )
            })()}
        </div>
    )
}
