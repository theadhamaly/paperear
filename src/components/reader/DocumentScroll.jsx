





import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import PageOverlay from './PageOverlay'
import WordBar from './WordBar'
import Busy from '../Busy'
import { detectLanguage, isRtl } from '../../utils/languageDetector'
import { buildPageList, pageAtScroll } from '../../utils/documentPages'
import RangeBox from './RangeBox'
import DocumentPanel from './DocumentPanel'
import useViewAnchor from '../../hooks/useViewAnchor'
import { dockCoverFor } from '../../utils/dockLayout'
import './DocumentScroll.css'

const OVERSCAN = 1

export default function DocumentScroll({
    zoom = 1,
    dockOpen = false,
    pdf,
    pagedView,
    loadedPages = null,
    currentWordIndex = -1,
    band = null,
    onWordClick,
    jumpTick = 0,
    restoreTick = 0,
    ocrItemsByPage = null,
    chromeSkipping = false,
    bookmarkedPage = null,
    onToggleBookmark = null,
    rtl = false,
    isPlaying = false,
    isPaused = false,
    waiting = false,
    scanning = null,
    onPlayPause,
    onSkipBackWord,
    onSkipForwardWord,
    getSeekHoldHandlers,
    onReportWord,
    openReportTick = 0,
    totalPages = 0,
    onOpenPage = null,
}) {
    const { t } = useTranslation()
    const containerRef = useRef(null)
    const pageLinkRef = useRef(null)
    const [barIndex, setBarIndex] = useState(null)
    const [noteRequested, setNoteRequested] = useState(false)
    const [noteType, setNoteType] = useState('mispronounced')
    const openBarAt = (index) => {
        setBarIndex(index)
        setNoteType('mispronounced')
        setNoteRequested(false)
    }
    const closeBar = useCallback(() => { setBarIndex(null); setNoteRequested(false) }, [])
    const getAnchorRect = useCallback(
        () => containerRef.current?.querySelector(`[data-word-index="${barIndex}"]`)?.getBoundingClientRect()
            || (noteType === 'page' ? pageLinkRef.current?.getBoundingClientRect() : null)
            || null,
        [barIndex, noteType],
    )
    const openPageReport = () => {
        setBarIndex(currentWordIndex)
        setNoteType('page')
        setNoteRequested(true)
    }
    useEffect(() => {
        if (!openReportTick) return
        setBarIndex(currentWordIndex)
        setNoteType('mispronounced')
        setNoteRequested(true)
    }, [openReportTick])
    const [containerWidth, setContainerWidth] = useState(0)
    const [scrollTop, setScrollTop] = useState(0)
    const [viewportH, setViewportH] = useState(0)
    const [pageDims, setPageDims] = useState(null)
    const [proxies, setProxies] = useState({})
    const [perRow, setPerRow] = useState(1)
    const [panelOpen, setPanelOpen] = useState(false)


    const pageList = useMemo(() => buildPageList(totalPages, pagedView), [pagedView, totalPages])
    const docRtl = useMemo(() => {
        const sample = (pagedView || []).flatMap((p) => p.words.slice(0, 120).map((w) => w.word)).slice(0, 400).join(' ')
        return isRtl(detectLanguage(sample))
    }, [pagedView])
    const startEdgeLeft = (el) => {
        const overflow = Math.max(0, el.scrollWidth - el.clientWidth)
        const rtlBox = getComputedStyle(el).direction === 'rtl'
        if (docRtl) return rtlBox ? 0 : overflow
        return rtlBox ? -overflow : 0
    }


    useEffect(() => {
        const el = containerRef.current
        if (!el) return undefined
        const measure = () => {
            setContainerWidth(el.clientWidth)
            setViewportH(el.clientHeight)
        }
        measure()
        const ro = new ResizeObserver(measure)
        ro.observe(el)
        window.addEventListener('resize', measure)
        return () => {
            ro.disconnect()
            window.removeEventListener('resize', measure)
        }
    }, [])


    useEffect(() => {
        let dead = false
        if (!pdf || !pageList.length) return undefined
        pdf.getPage(pageList[0].pageNum).then((pg) => {
            if (dead) return
            const [, , w, h] = pg.view
            setPageDims(pageList.map(() => ({ w, h })))
            setProxies((prev) => ({ ...prev, [pageList[0].pageNum]: pg }))
        })
        return () => { dead = true }
    }, [pdf, pageList])

    const GAP = 14
    const rowOf = (i) => Math.floor(i / perRow)
    const colOf = (i) => i % perRow
    const colWidth = containerWidth ? (containerWidth - 8 - (perRow - 1) * GAP) / perRow : 0
    const fitWidth = colWidth && pageDims?.[0] ? colWidth / pageDims[0].w : 1
    const scale = fitWidth * zoom
    const heights = useMemo(
        () => (pageDims || []).map((d) => d.h * scale + GAP),
        [pageDims, scale],
    )
    const rowHeights = useMemo(() => {
        const rows = []
        for (let i = 0; i < heights.length; i++) {
            const r = Math.floor(i / perRow)
            rows[r] = Math.max(rows[r] || 0, heights[i])
        }
        return rows
    }, [heights, perRow])
    const offsets = useMemo(() => {
        const out = []
        let y = 0
        for (const h of rowHeights) { out.push(y); y += h }
        out.total = y
        return out
    }, [rowHeights])


    const [firstVisible, lastVisible] = useMemo(() => {
        if (!rowHeights.length) return [0, 0]
        let lo = 0
        while (lo < rowHeights.length - 1 && offsets[lo] + rowHeights[lo] < scrollTop) lo++
        let hi = lo
        while (hi < rowHeights.length - 1 && offsets[hi] < scrollTop + viewportH) hi++
        const loRow = Math.max(0, lo - OVERSCAN)
        const hiRow = Math.min(rowHeights.length - 1, hi + OVERSCAN)
        return [loRow * perRow, Math.min(heights.length - 1, hiRow * perRow + perRow - 1)]
    }, [scrollTop, viewportH, rowHeights, offsets, heights.length, perRow])


    useEffect(() => {
        let dead = false
        if (!pdf) return undefined
        for (let i = firstVisible; i <= lastVisible; i++) {
            const pn = pageList[i]?.pageNum
            if (!pn || proxies[pn]) continue
            pdf.getPage(pn).then((pg) => {
                if (dead) return
                setProxies((prev) => (prev[pn] ? prev : { ...prev, [pn]: pg }))

                const [, , w, h] = pg.view
                setPageDims((prev) => {
                    if (!prev) return prev
                    const next = [...prev]
                    next[i] = { w, h }
                    return next
                })
            })
        }
        return () => { dead = true }
    }, [pdf, firstVisible, lastVisible, pageList, proxies])


    const currentSlot = useMemo(
        () => pageList.findIndex((p) => currentWordIndex >= p.start && currentWordIndex <= p.end && p.start >= 0),
        [pageList, currentWordIndex],
    )

    const followLockRef = useRef(true)
    const lastUserScrollRef = useRef(0)

    const breakLock = () => {
        followLockRef.current = false
        lastUserScrollRef.current = Date.now()
    }

    const currentWordEl = () =>
        containerRef.current?.querySelector('.page-overlay__hl:not([style*="display: none"])') ||
        containerRef.current?.querySelector('.page-overlay__word.is-current')

    const viewAnchor = useViewAnchor(`${zoom}|${dockOpen}`, { getScroller: () => containerRef.current, locate: currentWordEl, coverBottom: () => dockCoverFor(dockOpen) })

    const centerOnCurrent = (threshold = 0, behavior = 'smooth') => {
        const el = containerRef.current
        if (!el) return
        const word = currentWordEl()
        if (word) {
            const c = el.getBoundingClientRect()
            const r = word.getBoundingClientRect()
            const dy = (r.top + r.height / 2) - (c.top + el.clientHeight / 2)
            const dx = el.scrollWidth > el.clientWidth ? (r.left + r.width / 2) - (c.left + el.clientWidth / 2) : 0
            const moveY = Math.abs(dy) > threshold
            const moveX = Math.abs(dx) > (threshold ? el.clientWidth * 0.12 : 0)
            if (!moveY && !moveX) return
            const target = { behavior }
            if (moveY) target.top = el.scrollTop + dy
            if (moveX) target.left = el.scrollLeft + dx
            el.scrollTo(target)
            return
        }
        if (currentSlot < 0 || !offsets.length) return
        const p = pageList[currentSlot]
        const span = Math.max(1, p.end - p.start)
        const ratio = Math.min(1, Math.max(0, (currentWordIndex - p.start) / span))
        const row = rowOf(currentSlot)
        const top = offsets[row] + (rowHeights[row] || 0) * ratio - viewportH * 0.5
        const target = { top: Math.max(0, top), behavior }
        if (el.scrollWidth > el.clientWidth) target.left = startEdgeLeft(el)
        el.scrollTo(target)
    }

    const followCurrent = () => {
        const el = containerRef.current
        const word = currentWordEl()
        if (!el) return
        if (!word) {
            centerOnCurrent(viewportH * 0.12)
            return
        }
        const c = el.getBoundingClientRect()
        const r = word.getBoundingClientRect()
        const top = r.top - c.top
        const target = { behavior: 'smooth' }
        if (top < el.clientHeight * 0.1 || top + r.height > el.clientHeight * 0.78) {
            target.top = Math.max(0, el.scrollTop + top - el.clientHeight * 0.3)
        }
        if (el.scrollWidth > el.clientWidth) {
            const left = r.left - c.left
            if (left < el.clientWidth * 0.1 || left + r.width > el.clientWidth * 0.9) {
                target.left = el.scrollLeft + (left + r.width / 2) - el.clientWidth / 2
            }
        }
        if (target.top !== undefined || target.left !== undefined) el.scrollTo(target)
    }

    useEffect(() => {
        if (currentWordIndex < 0 || viewAnchor.isSettling()) return
        if (followLockRef.current) {
            followCurrent()
            return
        }
        if (Date.now() - lastUserScrollRef.current < 2500) return
        const el = containerRef.current
        const word = currentWordEl()
        if (!el || !word) return
        const c = el.getBoundingClientRect()
        const r = word.getBoundingClientRect()
        const margin = el.clientHeight * 0.4
        if (r.bottom > c.top - margin && r.top < c.bottom + margin) {
            followLockRef.current = true
            followCurrent()
        }
    }, [currentWordIndex, currentSlot, offsets, rowHeights, viewportH])



    const jumpSeen = useRef(0)
    useEffect(() => {
        if (jumpTick === jumpSeen.current) return
        jumpSeen.current = jumpTick
        followLockRef.current = true
        centerOnCurrent()
    }, [jumpTick, currentSlot, offsets, rowHeights, pageList, currentWordIndex, viewportH, perRow])

    const restoreSeen = useRef(0)
    useEffect(() => {
        if (!restoreTick || restoreTick === restoreSeen.current) return undefined
        restoreSeen.current = restoreTick
        followLockRef.current = true
        let frame = 0
        let tries = 0
        const settle = () => {
            const ready = Boolean(currentWordEl())
            if (ready || tries >= 90) {
                if (ready) centerOnCurrent(0, 'instant')
                return
            }
            tries += 1
            if (tries === 30 || tries === 60) centerOnCurrent(0, 'instant')
            frame = requestAnimationFrame(settle)
        }
        frame = requestAnimationFrame(settle)
        return () => cancelAnimationFrame(frame)
    }, [restoreTick])

    const panRef = useRef(null)
    const onPointerDown = (e) => {
        if (e.button !== 0) return
        const el = containerRef.current
        if (!el) return
        panRef.current = {
            x: e.clientX,
            y: e.clientY,
            left: el.scrollLeft,
            top: el.scrollTop,
            active: false,
        }
    }
    const onPointerMove = (e) => {
        const pan = panRef.current
        const el = containerRef.current
        if (!pan || !el) return
        const dx = e.clientX - pan.x
        const dy = e.clientY - pan.y
        if (!pan.active && Math.hypot(dx, dy) < 6) return
        pan.active = true
        breakLock()
        el.scrollLeft = pan.left - dx
        el.scrollTop = pan.top - dy
    }
    const onPointerUp = (e) => {
        const pan = panRef.current
        panRef.current = null
        if (pan?.active) {
            e.preventDefault()
            suppressClickRef.current = true
            setTimeout(() => { suppressClickRef.current = false }, 0)
        }
    }
    const suppressClickRef = useRef(false)
    const onClickCapture = (e) => {
        if (suppressClickRef.current) {
            e.stopPropagation()
            e.preventDefault()
        }
    }

    if (!pdf || !pageList.length) return null

    return (
        <div className="doc-scroll__wrap">
            <div className="doc-scroll__zoom">
                {totalPages > 0 && (
                    <button
                        type="button"
                        className={'doc-scroll__zoom-btn' + (panelOpen ? ' is-active' : '')}
                        onClick={() => setPanelOpen((v) => !v)}
                        title={t('panel.open', 'Pages and contents')}
                        aria-expanded={panelOpen}
                    >
                        ☰
                    </button>
                )}
                {[1, 2].map((n) => (
                    <button
                        key={`pr${n}`}
                        className={'doc-scroll__zoom-btn' + (perRow === n ? ' is-active' : '')}
                        onClick={() => setPerRow(n)}
                    >
                        {n === 1 ? '▯' : '▯▯'}
                    </button>
                ))}
                {onToggleBookmark && (() => {
                    const visiblePage = pageList[currentSlot >= 0 ? currentSlot : firstVisible]?.pageNum
                    if (!visiblePage) return null
                    const marked = bookmarkedPage === visiblePage
                    return (
                        <button
                            className={'doc-scroll__zoom-btn' + (marked ? ' is-active' : '')}
                            title={marked ? `Bookmarked page ${visiblePage}` : `Bookmark page ${visiblePage}`}
                            onClick={() => onToggleBookmark(visiblePage)}
                        >
                            {marked ? '★' : '☆'}
                        </button>
                    )
                })()}
                <span className="doc-scroll__zoom-sep"></span>
                {onReportWord && (
                    <button ref={pageLinkRef} type="button" className="doc-scroll__zoom-btn doc-scroll__report" onClick={openPageReport}>
                        {t('reader.reportPage', 'Something wrong on this page?')}
                    </button>
                )}
            </div>
            <DocumentPanel
                pdf={pdf}
                totalPages={totalPages || pageList.length}
                currentPage={pageList[pageAtScroll(offsets, rowHeights, perRow, scrollTop, viewportH) - 1]?.pageNum || 1}
                bookmarkedPage={bookmarkedPage}
                onToggleBookmark={onToggleBookmark}
                onGoToPage={(n) => onOpenPage?.(n)}
                open={panelOpen}
                onClose={() => setPanelOpen(false)}
            />
            {totalPages > 1 && (
                <div className="doc-scroll__where">
                    <RangeBox
                        value={pageList[pageAtScroll(offsets, rowHeights, perRow, scrollTop, viewportH) - 1]?.pageNum || 1}
                        min={1}
                        max={totalPages}
                        title={t('reader.jumpToPage', 'Go to page')}
                        onCommit={(n) => onOpenPage?.(n)}
                    />
                    <span>/ {totalPages}</span>
                </div>
            )}
        <div
            ref={containerRef}
            className={'doc-scroll' + (zoom > 1 ? ' is-pannable' : '')}
            onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
            onWheel={breakLock}
            onTouchMove={breakLock}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
            onClickCapture={onClickCapture}
        >
            <div className="doc-scroll__spacer" style={{ height: offsets.total || 0, width: `${zoom * 100}%`, margin: zoom < 1 ? '0 auto' : undefined }}>
                {pageList.map((p, i) => {
                    if (i < firstVisible || i > lastVisible)
                        return null
                    const proxy = proxies[p.pageNum]
                    const pageBand = p.loaded && band && band.range[1] >= p.start && band.range[0] <= p.end
                        ? {
                            range: [band.range[0] - p.start, band.range[1] - p.start],
                            short: band.short ? [band.short[0] - p.start, band.short[1] - p.start] : null,
                        }
                        : null
                    return (
                        <div
                            key={p.pageNum}
                            className={'doc-scroll__slot' + (p.loaded ? '' : ' is-unloaded')}
                            style={{
                                top: offsets[rowOf(i)],
                                height: (rowHeights[rowOf(i)] || 0) - GAP,
                                left: `${colOf(i) * (100 / perRow)}%`,
                                width: `${100 / perRow}%`,
                            }}
                            onClick={!p.loaded && onOpenPage ? () => onOpenPage(p.pageNum) : undefined}
                        >
                            {scanning?.includes(p.pageNum) && <Busy label={t('busy.scanPage', 'Preparing this page…')} showLabel announce={false} delay={0} className="busy--chip" />}
                            {proxy ? (
                                <PageOverlay
                                    page={proxy}
                                    scale={scale}
                                    rtl={rtl}
                                    ocrItems={ocrItemsByPage?.[p.pageNum] || null}
                                    chromeSkipping={chromeSkipping}
                                    pipelineBlocks={
                                        p.loaded ? loadedPages?.find((lp) => lp.pageNum === p.pageNum)?.blocks || null : null
                                    }
                                    tables={
                                        p.loaded ? loadedPages?.find((lp) => lp.pageNum === p.pageNum)?.tables || null : null
                                    }
                                    currentReadingIndex={
                                        i === currentSlot ? currentWordIndex - p.start : -1
                                    }
                                    wordIndexBase={p.loaded ? p.start : -1}
                                    band={pageBand}
                                    onWordClick={
                                        p.loaded && onWordClick
                                            ? (readingIdx) => {
                                                onWordClick(p.start + readingIdx)
                                                openBarAt(p.start + readingIdx)
                                            }
                                            : undefined
                                    }
                                />
                            ) : (
                                <div className="doc-scroll__loading"><Busy announce={false} /></div>
                            )}
                            <div className="doc-scroll__pagenum">{p.pageNum}</div>
                        </div>
                    )
                })}
            </div>
        </div>
        {barIndex !== null && onReportWord && (
            <WordBar
                key={barIndex}
                getAnchorRect={getAnchorRect}
                isPlaying={isPlaying}
                isPaused={isPaused}
                waiting={waiting}
                onPlayPause={onPlayPause}
                onSkipBackWord={onSkipBackWord}
                onSkipForwardWord={onSkipForwardWord}
                getSeekHoldHandlers={getSeekHoldHandlers}
                onSubmitReport={(note, type) => onReportWord(note, type, barIndex)}
                openNote={noteRequested}
                openNoteType={noteType}
                onClose={closeBar}
            />
        )}
        </div>
    )
}
