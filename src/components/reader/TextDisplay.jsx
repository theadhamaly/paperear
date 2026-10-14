import React, { useRef, useEffect, useMemo, useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import './TextDisplay.css'
import { walkWordFragments } from '../../utils/richWords'
import WordBar from './WordBar'
import useViewAnchor from '../../hooks/useViewAnchor'
import { dockCoverFor } from '../../utils/dockLayout'

/**
 * TextDisplay — PDF-style viewer.
 *
 * Two rendering modes:
 * 1. richHtml mode (when richHtml is provided): renders the actual formatted
 *    document HTML (preserving bold, italic, headings, alignment, etc.) with
 *    word-index spans injected into each text node. Highlighting is applied
 *    via direct DOM class updates (no full re-render) for performance.
 *
 * 2. Flat mode (plain words array): original behavior — flat word spans in
 *    paragraph chunks. Used as fallback when no richHtml is available.
 *
 * Word click, highlighting classes (td-word, td-word--current, td-word--read),
 * and dir="auto" are preserved in both modes.
 */

// ---- HTML injection: wrap every word in a text node with a span ----
function injectWordSpansIntoHtml(htmlString) {
    if (!htmlString || typeof document === 'undefined') return { html: '', wordCount: 0 }

    const container = document.createElement('div')
    container.innerHTML = htmlString

    container.querySelectorAll('script, iframe, object, embed, link, meta').forEach((n) => n.remove())
    container.querySelectorAll('*').forEach((el) => {
        for (const attr of [...el.attributes]) {
            const name = attr.name.toLowerCase()
            if (name.startsWith('on')) el.removeAttribute(attr.name)
            else if ((name === 'href' || name === 'src') && /^\s*javascript:/i.test(attr.value)) el.removeAttribute(attr.name)
        }
    })

    const wordIndex = walkWordFragments(container, (node, pieces) => {
        const frag = document.createDocumentFragment()
        for (const piece of pieces) {
            if (piece.space !== undefined) {
                frag.appendChild(document.createTextNode(piece.space))
                continue
            }
            const span = document.createElement('span')
            span.className = 'td-word'
            span.dataset.wordIndex = String(piece.index)
            span.textContent = piece.word
            frag.appendChild(span)
        }
        node.parentNode.replaceChild(frag, node)
    })

    return { html: container.innerHTML, wordCount: wordIndex }
}

export default function TextDisplay({
    zoom: textZoom = 1,
    dockOpen = false,
    restoreTick = 0,
    words,
    currentWordIndex,
    band = null,
    onWordClick,
    richHtml,
    pages,
    focusMode,
    isPlaying,
    isPaused,
    waiting = false,
    onPlayPause,
    onSkipBackWord,
    onSkipForwardWord,
    getSeekHoldHandlers,
    onReportWord,
    openReportTick,
}) {
    const { t }          = useTranslation()
    const containerRef   = useRef(null)
    const [barIndex, setBarIndex] = useState(null)
    const [noteRequested, setNoteRequested] = useState(false)
    const [noteType, setNoteType] = useState('mispronounced')
    const pageLinkRef = useRef(null)
    const getAnchorRect = useCallback(
        () => containerRef.current?.querySelector(`[data-word-index="${barIndex}"]`)?.getBoundingClientRect()
            || (noteType === 'page' ? pageLinkRef.current?.getBoundingClientRect() : null)
            || null,
        [barIndex, noteType],
    )
    const closeBar = useCallback(() => { setBarIndex(null); setNoteRequested(false) }, [])
    const openPageReport = useCallback(() => {
        setBarIndex(currentWordIndex)
        setNoteType('page')
        setNoteRequested(true)
    }, [currentWordIndex])
    useEffect(() => {
        if (!openReportTick) return
        setBarIndex(currentWordIndex)
        setNoteType('mispronounced')
        setNoteRequested(true)
    }, [openReportTick])
    const pageReportLink = onReportWord ? (
        <button ref={pageLinkRef} type="button" className="pdf-viewer-report" onClick={openPageReport}>
            {t('reader.reportPage', 'Something wrong on this page?')}
        </button>
    ) : null
    const wordBar = barIndex !== null && onReportWord ? (
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
    ) : null
    const dockCover = () => dockCoverFor(dockOpen)
    useViewAnchor(`${textZoom}|${dockOpen}`, {
        coverBottom: dockCover,
        getScroller: () => containerRef.current?.closest('.pdf-page-area') || null,
        locate: () => containerRef.current?.querySelector('.td-word--current') || null,
    })
    const prevIndexRef   = useRef(-1)
    const isAutoScrollingRef = useRef(true)
    const focusTrackRef  = useRef(null)

    const hasWords = words && words.length > 0

    // ---- Detach auto-scroll on manual user interaction; re-engage after a
    // short idle once the highlighted word is back in comfortable view ----
    const lastUserScrollRef = useRef(0)
    useEffect(() => {
        const handleUserScroll = () => {
            isAutoScrollingRef.current = false
            lastUserScrollRef.current = Date.now()
        }

        const handleKeyDown = (e) => {
            if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(e.code)) {
                handleUserScroll()
            }
        }

        const handleReEngage = () => {
            isAutoScrollingRef.current = true
        }

        const reengageTimer = setInterval(() => {
            if (isAutoScrollingRef.current) return
            if (Date.now() - lastUserScrollRef.current < 2500) return
            const span = containerRef.current?.querySelector(`[data-word-index="${prevIndexRef.current}"]`)
            if (!span) return
            const r = span.getBoundingClientRect()
            if (r.top >= 60 && r.bottom <= window.innerHeight - 60) {
                isAutoScrollingRef.current = true
            }
        }, 600)

        window.addEventListener('wheel', handleUserScroll, { passive: true })
        window.addEventListener('touchmove', handleUserScroll, { passive: true })
        window.addEventListener('keydown', handleKeyDown, { passive: true })
        window.addEventListener('re-engage-autoscroll', handleReEngage)

        return () => {
            clearInterval(reengageTimer)
            window.removeEventListener('wheel', handleUserScroll)
            window.removeEventListener('touchmove', handleUserScroll)
            window.removeEventListener('keydown', handleKeyDown)
            window.removeEventListener('re-engage-autoscroll', handleReEngage)
        }
    }, [])

    // ---- Rich HTML mode: inject spans once, update classes via DOM ----
    const { html: processedHtml, wordCount: richWordCount } = useMemo(() => {
        if (!richHtml) return { html: '', wordCount: 0 }
        return injectWordSpansIntoHtml(richHtml)
    }, [richHtml])

    // Update highlighting via direct DOM mutation (no re-render needed)
    useEffect(() => {
        if (!containerRef.current) return

        const prev    = prevIndexRef.current
        const current = currentWordIndex

        if (prev === current) return

        // Un-highlight previous
        if (prev >= 0) {
            for (const prevSpan of containerRef.current.querySelectorAll(`[data-word-index="${prev}"]`)) {
                prevSpan.classList.remove('td-word--current')
                prevSpan.classList.add('td-word--read')
            }
        }

        // Highlight current
        if (current >= 0) {
            const curSpans = containerRef.current.querySelectorAll(`[data-word-index="${current}"]`)
            curSpans.forEach((curSpan, i) => {
                curSpan.classList.add('td-word--current')
                curSpan.classList.remove('td-word--read')
                if (i === 0 && isAutoScrollingRef.current && !focusMode) {
                    const r = curSpan.getBoundingClientRect()
                    const drift = Math.abs((r.top + r.bottom) / 2 - window.innerHeight / 2)
                    if (r.top < 0 || r.bottom > window.innerHeight || drift > 140) {
                        curSpan.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
                    }
                }
            })
        }

        prevIndexRef.current = current
    }, [currentWordIndex, richHtml, focusMode])

    const latestWordRef = useRef(currentWordIndex)
    latestWordRef.current = currentWordIndex

    useEffect(() => {
        if (!restoreTick) return undefined
        let frame = 0
        let tries = 0
        const settle = () => {
            const span = containerRef.current?.querySelector(`[data-word-index="${latestWordRef.current}"]`)
            if (span) {
                span.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'nearest' })
                return
            }
            tries += 1
            if (tries < 90) frame = requestAnimationFrame(settle)
        }
        frame = requestAnimationFrame(settle)
        return () => cancelAnimationFrame(frame)
    }, [restoreTick])

    const bandStart = band ? band.range[0] : -1
    const bandEnd = band ? band.range[1] : -1
    const paintedBandRef = useRef(null)
    useEffect(() => {
        const root = containerRef.current
        if (!root) return
        const paint = (from, to, on) => {
            for (let i = from; i <= to; i++) {
                for (const span of root.querySelectorAll(`[data-word-index="${i}"]`)) span.classList.toggle('td-word--band', on)
            }
        }
        const painted = paintedBandRef.current
        if (painted && (painted.from !== bandStart || painted.to !== bandEnd)) {
            paint(painted.from, painted.to, false)
            paintedBandRef.current = null
        }
        if (bandStart >= 0) {
            paint(bandStart, bandEnd, true)
            paintedBandRef.current = { from: bandStart, to: bandEnd }
        }
    }, [bandStart, bandEnd, currentWordIndex, richHtml, focusMode, pages, words])

    // Focus mode — translate the text so the current word's line stays centered.
    useEffect(() => {
        if (!focusMode || !containerRef.current || !focusTrackRef.current) return
        const cur = containerRef.current.querySelector(`[data-word-index="${currentWordIndex}"]`)
        if (!cur) return
        const viewH = containerRef.current.clientHeight
        focusTrackRef.current.style.transform =
            `translateY(${(viewH / 2) - (cur.offsetHeight / 2) - cur.offsetTop}px)`
    }, [focusMode, currentWordIndex, words])

    // Mark all words before currentWordIndex as read on first paint / richHtml change
    useEffect(() => {
        if (!richHtml || !containerRef.current) return
        const spans = containerRef.current.querySelectorAll('.td-word')
        spans.forEach((span) => {
            const idx = parseInt(span.dataset.wordIndex, 10)
            span.classList.remove('td-word--current', 'td-word--read')
            if (idx < currentWordIndex)  span.classList.add('td-word--read')
            if (idx === currentWordIndex) span.classList.add('td-word--current')
        })
        prevIndexRef.current = currentWordIndex
    }, [richHtml]) // intentionally only on richHtml change

    // Click delegation for rich HTML mode
    const handleRichClick = useCallback((e) => {
        const span = e.target.closest('[data-word-index]')
        if (!span) return
        const idx = parseInt(span.dataset.wordIndex, 10)
        if (isNaN(idx)) return
        onWordClick(idx)
        setBarIndex(idx)
        setNoteType('mispronounced')
        setNoteRequested(false)
    }, [onWordClick])

    if (!hasWords) return null

    // ---- Focus mode: teleprompter — active line centered + lit, rest dimmed ----
    if (focusMode) {
        return (
            <div
                key="flow"
                className="focus-view"
                ref={containerRef}
                onClick={handleRichClick}
                style={{
                    position: 'relative',
                    height: '42vh',
                    minHeight: '220px',
                    overflow: 'hidden',
                    textAlign: 'center',
                    fontSize: '1.7rem',
                    lineHeight: 2.4,
                    WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, #000 33%, #000 67%, transparent 100%)',
                    maskImage: 'linear-gradient(to bottom, transparent 0%, #000 33%, #000 67%, transparent 100%)',
                }}
            >
                <div
                    ref={focusTrackRef}
                    style={{ position: 'relative', transition: 'transform 0.45s cubic-bezier(0.22, 1, 0.36, 1)', willChange: 'transform' }}
                >
                    {words.map((word, index) => (
                        <span key={index} data-word-index={index} className="td-word">{word}{' '}</span>
                    ))}
                </div>
                {wordBar}
            </div>
        )
    }

    // ---- Paged mode: numbered page blocks matching the source document ----
    // Word spans keep their global data-word-index, so the existing highlight +
    // auto-scroll effect (which queries containerRef) works across page blocks.
    if (pages && pages.length > 0) {
        return (
            <div className="pdf-viewer" style={{ '--text-zoom': textZoom }}>
                <div className="pdf-viewer-toolbar">
                    <span className="pdf-viewer-toolbar-title">{t('reader.document', 'Document')}</span>
                    <span className="pdf-viewer-hint">{t('reader.jumpHint', 'Click any word to jump')}</span>
                    {pageReportLink}
                </div>
                <div className="pdf-page-area" ref={containerRef} onClick={handleRichClick}>
                    {pages.map((pg) => (
                        <div className="pdf-page" key={pg.pageNum} style={{ marginBottom: '1.5rem' }}>
                            <div className="pdf-page-chrome pdf-page-chrome--top" />
                            <div className="pdf-page-content" dir="auto">
                                {(pg.blocks || [{ type: 'para', words: pg.words }]).map((blk, bi) => {
                                    // Chrome (repeating ad/boilerplate): shown in place, struck through,
                                    // never read — no word-index spans, so it stays out of the read stream.
                                    if (blk.skip) return <p key={bi} dir="auto" className="pdf-block pdf-block--chrome" title={t('reader.notRead', 'Not read aloud')}>{blk.text}</p>
                                    const spans = blk.words.map(({ word, index }) => (
                                        <span key={index} data-word-index={index} className="td-word">{word}{' '}</span>
                                    ))
                                    if (blk.type === 'heading') return <h3 key={bi} dir="auto" className="pdf-block pdf-block--heading">{spans}</h3>
                                    if (blk.type === 'item') return <div key={bi} dir="auto" className="pdf-block pdf-block--item">{spans}</div>
                                    return <p key={bi} dir="auto" className="pdf-block">{spans}</p>
                                })}
                            </div>
                            <div className="pdf-page-chrome pdf-page-chrome--bottom" />
                            <div style={{ textAlign: 'center', fontSize: '0.72rem', opacity: 0.6, padding: '0.4rem 0', color: 'var(--pdf-page-text, #555)' }}>
                                {t('reader.page', 'Page')} {pg.pageNum}
                            </div>
                        </div>
                    ))}
                </div>
                {wordBar}
            </div>
        )
    }

    // ---- Estimate pages (flat word count) ----
    const WORDS_PER_PAGE = 400
    const totalWords     = words.length
    const currentPage    = Math.floor(currentWordIndex / WORDS_PER_PAGE) + 1
    const totalPages     = Math.max(1, Math.ceil(totalWords / WORDS_PER_PAGE))

    // ---- Flat fallback: build visual paragraphs ----
    const buildFlatParagraphs = () => {
        const paragraphs = []
        let current = []

        for (let i = 0; i < words.length; i++) {
            const word = words[i]
            if (word.includes('\n') && word.trim() === '') {
                if (current.length > 0) { paragraphs.push(current); current = [] }
                continue
            }
            current.push({ word, index: i })
        }
        if (current.length > 0) paragraphs.push(current)

        // Auto-chunk if no natural breaks
        if (paragraphs.length === 1 && words.length > 100) {
            const flat = paragraphs[0]
            const chunks = []
            for (let i = 0; i < flat.length; i += 60) chunks.push(flat.slice(i, i + 60))
            return chunks
        }
        return paragraphs
    }

    return (
        <div className="pdf-viewer" style={{ '--text-zoom': textZoom }}>
            {/* Viewer toolbar */}
            <div className="pdf-viewer-toolbar">
                <span className="pdf-viewer-toolbar-title">
                    {t('reader.interactiveText', 'Interactive Text')}
                </span>
                <span className="pdf-viewer-hint">
                    {t('reader.jumpHint', 'Click any word to jump')}
                </span>
                {pageReportLink}
            </div>

            {/* Page area */}
            <div className="pdf-page-area">
                <div className="pdf-page">
                    <div className="pdf-page-chrome pdf-page-chrome--top" />

                    {richHtml ? (
                        /* Rich HTML mode — rendered document with injected word spans */
                        <div
                            ref={containerRef}
                            className="pdf-page-content pdf-page-content--rich"
                            dir="auto"
                            onClick={handleRichClick}
                            dangerouslySetInnerHTML={{ __html: processedHtml }}
                        />
                    ) : (
                        /* Flat fallback mode */
                        <div className="pdf-page-content" dir="auto" ref={containerRef} onClick={handleRichClick}>
                            {buildFlatParagraphs().map((para, paraIndex) => (
                                <p key={paraIndex} className="pdf-paragraph">
                                    {para.map(({ word, index }) => (
                                        <span
                                            key={index}
                                            data-word-index={index}
                                            className={`td-word${index === currentWordIndex ? ' td-word--current' : ''}${index < currentWordIndex ? ' td-word--read' : ''}`}
                                        >
                                            {word}{' '}
                                        </span>
                                    ))}
                                </p>
                            ))}
                        </div>
                    )}

                    <div className="pdf-page-chrome pdf-page-chrome--bottom" />
                </div>
            </div>

            {/* Footer */}
            <div className="pdf-viewer-footer">
                <span className="pdf-page-number">
                    {t('reader.page', 'Page')} {currentPage} / {totalPages}
                </span>
            </div>
            {wordBar}
        </div>
    )
}
