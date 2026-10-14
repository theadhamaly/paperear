import React, { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import './RangePicker.css'

/**
 * RangePicker — shown when an uploaded document is large (>10 pages). Lets the
 * reader scroll real page thumbnails, enlarge any page (← / → to move between
 * pages, Esc to close), and pick the range to load.
 */

// Lazily render a single PDF page to a small canvas once it scrolls into view.
function PdfThumb({ pdf, pageNum, scrollRoot, onOpen, onPick, selected, edge }) {
    const { t } = useTranslation()
    const wrapRef = useRef(null)
    const canvasRef = useRef(null)
    const doneRef = useRef(false)

    useEffect(() => {
        if (!pdf || doneRef.current) return
        const el = wrapRef.current
        if (!el) return
        const io = new IntersectionObserver(async (entries) => {
            if (!entries[0].isIntersecting || doneRef.current) return
            doneRef.current = true
            io.disconnect()
            try {
                const page = await pdf.getPage(pageNum)
                const viewport = page.getViewport({ scale: 0.22 })
                const canvas = canvasRef.current
                if (!canvas) return
                canvas.width = viewport.width
                canvas.height = viewport.height
                await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
            } catch { /* ignore render errors per-thumb */ }
        }, { root: scrollRoot?.current || null, rootMargin: '300px' })
        io.observe(el)
        return () => io.disconnect()
    }, [pdf, pageNum, scrollRoot])

    return (
        <button
            type="button"
            className={'range-thumb' + (selected ? ' range-thumb--selected' : '') + (edge ? ' range-thumb--edge' : '')}
            ref={wrapRef}
            onClick={() => onPick(pageNum)}
            title={t('reader.pageN', 'Page {{page}}').replace('{{page}}', pageNum)}
        >
            <canvas ref={canvasRef} className="range-thumb-canvas" />
            <span className="range-thumb-num">{pageNum}</span>
            <span
                className="range-thumb-zoom"
                role="button"
                tabIndex={-1}
                onClick={(e) => { e.stopPropagation(); onOpen(pageNum) }}
            >🔍</span>
        </button>
    )
}

// Text "thumbnail" — a snippet card for non-PDF docs (no image to render).
function TextThumb({ page, onOpen, onPick, selected, edge }) {
    const { t } = useTranslation()
    return (
        <button
            type="button"
            className={'range-thumb range-thumb--text' + (selected ? ' range-thumb--selected' : '') + (edge ? ' range-thumb--edge' : '')}
            onClick={() => onPick(page.pageNum)}
            title={t('reader.pageN', 'Page {{page}}').replace('{{page}}', page.pageNum)}
        >
            <span className="range-thumb-snippet" dir="auto">{(page.text || '').slice(0, 160)}</span>
            <span className="range-thumb-num">{page.pageNum}</span>
            <span
                className="range-thumb-zoom"
                role="button"
                tabIndex={-1}
                onClick={(e) => { e.stopPropagation(); onOpen(page.pageNum) }}
            >🔍</span>
        </button>
    )
}

// Full-screen enlarged page (blocking overlay). ← / → move pages; Esc closes.
function Enlarged({ pdf, docPages, pageNum, total, onClose, onPrev, onNext }) {
    const { t } = useTranslation()
    const canvasRef = useRef(null)
    useEffect(() => {
        if (!pdf) return
        let cancelled = false
        ;(async () => {
            try {
                const page = await pdf.getPage(pageNum)
                const viewport = page.getViewport({ scale: 1.4 })
                const canvas = canvasRef.current
                if (!canvas || cancelled) return
                canvas.width = viewport.width
                canvas.height = viewport.height
                await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
            } catch { /* ignore */ }
        })()
        return () => { cancelled = true }
    }, [pdf, pageNum])

    const textPage = !pdf ? docPages?.find((p) => p.pageNum === pageNum) : null

    return (
        <div className="range-enlarge-overlay" onClick={onClose}>
            <div className="range-enlarge" onClick={(e) => e.stopPropagation()}>
                {pdf
                    ? <canvas ref={canvasRef} className="range-enlarge-canvas" />
                    : <div className="range-enlarge-text" dir="auto">{textPage?.text}</div>}
                <div className="range-enlarge-bar">
                    <button type="button" className="range-enlarge-nav" onClick={onPrev} disabled={pageNum <= 1} aria-label={t('reader.prevPage', 'Previous page')}>‹</button>
                    <span className="range-enlarge-label">{t('reader.pageN', 'Page {{page}}').replace('{{page}}', pageNum)}{total ? ` / ${total}` : ''}</span>
                    <button type="button" className="range-enlarge-nav" onClick={onNext} disabled={pageNum >= total} aria-label={t('reader.nextPage', 'Next page')}>›</button>
                    <button type="button" className="range-enlarge-close" onClick={onClose} aria-label={t('reader.close', 'Close')}>✕</button>
                </div>
            </div>
        </div>
    )
}

export default function RangePicker({ meta, suggested, pdf, docPages, onLoad, onLoadAll, onCancel, busy = null }) {
    const { t } = useTranslation()
    const total = meta?.totalPages || 1
    const scrollRoot = useRef(null)

    const [from, setFrom] = useState(suggested?.fromPage || 1)
    const [to, setTo] = useState(suggested?.toPage || total)
    const [enlarged, setEnlarged] = useState(null)
    const [pickingSecond, setPickingSecond] = useState(false)

    const pickPage = (n) => {
        if (busy) return
        if (!pickingSecond) {
            setFrom(String(n))
            setTo(String(n))
            setPickingSecond(true)
        } else {
            const a = parseInt(from, 10) || n
            setFrom(String(Math.min(a, n)))
            setTo(String(Math.max(a, n)))
            setPickingSecond(false)
        }
    }

    useEffect(() => {
        setFrom(suggested?.fromPage || 1)
        setTo(suggested?.toPage || total)
    }, [suggested, total])

    // Arrow-key navigation while a page is enlarged. Capture phase + stop, so the
    // reader's own arrow shortcuts don't also fire behind the overlay.
    useEffect(() => {
        if (enlarged == null) return
        const onKey = (e) => {
            if (e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); setEnlarged((n) => Math.min(total, (n || 1) + 1)) }
            else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); setEnlarged((n) => Math.max(1, (n || 1) - 1)) }
            else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setEnlarged(null) }
        }
        window.addEventListener('keydown', onKey, true)
        return () => window.removeEventListener('keydown', onKey, true)
    }, [enlarged, total])

    // Free entry — let users type any number (even 0 / out of range) instead of
    // clamping each keystroke. Validate on load and block + explain why.
    const scanned = !!meta?.scannedDoc
    const nFrom = parseInt(from, 10)
    const nTo = parseInt(to, 10)
    let rangeError = ''
    if (from === '' || to === '' || Number.isNaN(nFrom) || Number.isNaN(nTo)) {
        rangeError = t('reader.rangeEnter', 'Enter a start and end page.')
    } else if (nFrom < 1 || nTo < 1) {
        rangeError = t('reader.rangeMinOne', 'Page numbers start at 1.')
    } else if (nFrom > total || nTo > total) {
        rangeError = t('reader.rangeMax', 'This document has only {{total}} pages.').replace('{{total}}', total)
    } else if (nFrom > nTo) {
        rangeError = t('reader.rangeOrder', '"From" must be the same as or before "To".')
    } else if (scanned && nTo - nFrom + 1 > 20) {
        rangeError = t('reader.rangeScanCap', 'Scanned files open up to 20 pages at a time — more pages prepare as you read.')
    }
    const rangeValid = !rangeError
    const pageNums = Array.from({ length: total }, (_, i) => i + 1)

    // Enter loads the chosen range (the enlarged page overlay has its own keys).
    useEffect(() => {
        if (enlarged != null) return
        const onKey = (e) => {
            if (e.key === 'Enter' && rangeValid && !busy) { e.preventDefault(); onLoad(nFrom, nTo) }
            if (e.key === 'Escape' && !busy) { e.preventDefault(); onCancel() }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [enlarged, rangeValid, nFrom, nTo, onLoad, onCancel, busy])

    return (
        <>
            <div className="range-picker-overlay" onClick={busy ? undefined : onCancel}>
                <div className="range-picker" onClick={(e) => e.stopPropagation()} dir="auto">
                    <button
                        type="button"
                        className="range-picker-close"
                        onClick={onCancel}
                        disabled={!!busy}
                        aria-label={t('reader.rangeCancel', 'Cancel')}
                        title={`${t('reader.rangeCancel', 'Cancel')} (Esc)`}
                    >✕</button>
                    <h3 className="range-picker-title">{t('reader.bigDocTitle', 'This is a large document')}</h3>
                    <p className="range-picker-desc">
                        {t('reader.bigDocDesc', '{{file}} is {{pages}} pages. We recommend opening a smaller range to start — you can change it anytime below.')
                            .replace('{{file}}', meta?.fileName || 'Document')
                            .replace('{{pages}}', total)}
                    </p>
                    <p className="range-picker-hint">
                        {t('reader.rangeDisclaimer', 'Large documents take longer to prepare. For the smoothest experience, load a few pages at a time.')}
                    </p>

                    <p className="range-picker-pickhint">
                        {pickingSecond
                            ? t('reader.pickHintSecond', 'Now click the last page of your range — 🔍 to preview any page.')
                            : t('reader.pickHintFirst', 'Click a page to start your range — 🔍 to preview any page.')}
                    </p>

                    {/* Scrollable page thumbnails — click picks the range, 🔍 previews */}
                    <div className="range-thumbs" ref={scrollRoot}>
                        {pageNums.map((n) => {
                            const selected = rangeValid && n >= nFrom && n <= nTo
                            const edge = rangeValid && (n === nFrom || n === nTo)
                            return pdf
                                ? <PdfThumb key={n} pdf={pdf} pageNum={n} scrollRoot={scrollRoot} onOpen={setEnlarged} onPick={pickPage} selected={selected} edge={edge} />
                                : <TextThumb key={n} page={docPages?.[n - 1] || { pageNum: n, text: '' }} onOpen={setEnlarged} onPick={pickPage} selected={selected} edge={edge} />
                        })}
                    </div>

                    <div className="range-picker-row">
                        <label className="range-picker-field">
                            <span>{t('reader.fromPage', 'From page')}</span>
                            <input type="number" min={1} max={total} value={from} onChange={(e) => setFrom(e.target.value)} />
                        </label>
                        <span className="range-picker-dash">–</span>
                        <label className="range-picker-field">
                            <span>{t('reader.toPage', 'To page')}</span>
                            <input type="number" min={1} max={total} value={to} onChange={(e) => setTo(e.target.value)} />
                        </label>
                    </div>

                    {rangeError
                        ? <p className="range-picker-hint range-picker-error">{rangeError}</p>
                        : <p className="range-picker-hint">
                            {t('reader.suggestedHint', 'Recommended start: pages {{from}}–{{to}} · press Enter to load.').replace('{{from}}', suggested?.rec?.fromPage ?? suggested?.fromPage ?? 1).replace('{{to}}', suggested?.rec?.toPage ?? suggested?.toPage ?? 10)}
                        </p>}

                    <div className="range-picker-actions">
                        <button className="range-picker-btn range-picker-btn--ghost" onClick={onCancel} disabled={!!busy}>
                            {t('reader.rangeCancel', 'Cancel')}
                        </button>
                        {!scanned && (
                            <button className="range-picker-btn range-picker-btn--ghost" onClick={onLoadAll} disabled={!!busy}>
                                {t('reader.loadAll', 'Load entire document')}
                            </button>
                        )}
                        <button
                            className="range-picker-btn range-picker-btn--primary"
                            onClick={() => rangeValid && !busy && onLoad(nFrom, nTo)}
                            disabled={!rangeValid || !!busy}
                        >
                            {busy
                                ? busy.total
                                    ? t('sequencer.ocrProgress', 'Preparing scanned pages… {{done}}/{{total}}').replace('{{done}}', busy.done).replace('{{total}}', busy.total)
                                    : t('busy.pages', 'Preparing the pages…')
                                : rangeValid
                                    ? t('reader.loadPages', 'Load pages {{from}}–{{to}}').replace('{{from}}', nFrom).replace('{{to}}', nTo)
                                    : t('reader.loadPagesShort', 'Load pages')}
                        </button>
                    </div>
                </div>
            </div>

            {enlarged != null && (
                <Enlarged
                    pdf={pdf}
                    docPages={docPages}
                    pageNum={enlarged}
                    total={total}
                    onClose={() => setEnlarged(null)}
                    onPrev={() => setEnlarged((n) => Math.max(1, (n || 1) - 1))}
                    onNext={() => setEnlarged((n) => Math.min(total, (n || 1) + 1))}
                />
            )}
        </>
    )
}
