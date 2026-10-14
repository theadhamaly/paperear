import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BusyDots } from '../Busy'
import './WordBar.css'

const GAP_ABOVE_WORD = 8
const LEAVE_MARGIN = 110
const SETTLE_MS = 800
const NOTE_LIMIT = 500

const inflated = (rect, by) => rect && {
    left: rect.left - by, right: rect.right + by, top: rect.top - by, bottom: rect.bottom + by,
}
const contains = (rect, x, y) => !!rect && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom

export default function WordBar({
    getAnchorRect,
    isPlaying,
    isPaused,
    waiting = false,
    onPlayPause,
    onSkipBackWord,
    onSkipForwardWord,
    getSeekHoldHandlers,
    onSubmitReport,
    openNote,
    openNoteType = 'mispronounced',
    onClose,
}) {
    const { t } = useTranslation()
    const barRef = useRef(null)
    const inputRef = useRef(null)
    const openedAtRef = useRef(0)
    const enteredRef = useRef(false)
    const noteOpenRef = useRef(false)
    const [pos, setPos] = useState(null)
    const [noteOpen, setNoteOpen] = useState(!!openNote)
    const [noteType, setNoteType] = useState(openNoteType)
    const [note, setNote] = useState('')
    noteOpenRef.current = noteOpen

    const place = useCallback(() => {
        const anchor = getAnchorRect()
        const bar = barRef.current
        if (!anchor || !bar) { setPos(null); return }
        const width = bar.offsetWidth || 180
        const height = bar.offsetHeight || 40
        const left = Math.max(6, Math.min(anchor.left + anchor.width / 2 - width / 2, window.innerWidth - width - 6))
        const above = anchor.top - height - GAP_ABOVE_WORD
        const top = above >= 6 ? above : anchor.bottom + GAP_ABOVE_WORD
        setPos({ left, top })
    }, [getAnchorRect])

    useLayoutEffect(place, [place, noteOpen])

    useEffect(() => {
        if (!openNote) return
        setNoteType(openNoteType)
        setNoteOpen(true)
    }, [openNote, openNoteType])

    useEffect(() => {
        if (!noteOpen) return
        const frame = requestAnimationFrame(() => inputRef.current?.focus())
        return () => cancelAnimationFrame(frame)
    }, [noteOpen, noteType])

    useEffect(() => {
        openedAtRef.current = Date.now()
        enteredRef.current = false
        const onMove = (e) => {
            if (noteOpenRef.current) return
            const bar = barRef.current?.getBoundingClientRect()
            if (contains(bar, e.clientX, e.clientY)) enteredRef.current = true
            if (contains(inflated(bar, LEAVE_MARGIN), e.clientX, e.clientY)) return
            if (contains(inflated(getAnchorRect(), LEAVE_MARGIN), e.clientX, e.clientY)) return
            if (!enteredRef.current && Date.now() - openedAtRef.current < SETTLE_MS) return
            onClose()
        }
        const onKey = (e) => {
            if (e.key !== 'Escape') return
            if (noteOpenRef.current) { setNoteOpen(false); return }
            onClose()
        }
        document.addEventListener('mousemove', onMove)
        document.addEventListener('keydown', onKey)
        document.addEventListener('scroll', place, true)
        window.addEventListener('resize', place)
        return () => {
            document.removeEventListener('mousemove', onMove)
            document.removeEventListener('keydown', onKey)
            document.removeEventListener('scroll', place, true)
            window.removeEventListener('resize', place)
        }
    }, [getAnchorRect, onClose, place])

    const hold = (action) => (getSeekHoldHandlers ? getSeekHoldHandlers(action) : {})

    const toggleNote = (type) => {
        if (noteOpen && noteType === type) { setNoteOpen(false); return }
        setNoteType(type)
        setNoteOpen(true)
    }

    const submit = () => {
        onSubmitReport(note.trim(), noteType)
        setNote('')
        setNoteOpen(false)
        onClose()
    }

    const placeholder = noteType === 'missing'
        ? t('controls.reportMissingPlaceholder', 'Type the missing word')
        : noteType === 'page'
            ? t('controls.reportPagePlaceholder', 'What is wrong on this page?')
            : noteType === 'highlight'
                ? t('controls.reportHighlightPlaceholder', 'What is wrong with the highlight?')
                : t('controls.reportPlaceholder', 'What sounds wrong?')

    return (
        <div
            ref={barRef}
            className={`wordbar ${noteOpen ? 'wordbar--note-open' : ''}`}
            style={pos ? { left: pos.left, top: pos.top } : { visibility: 'hidden' }}
            role="toolbar"
            onClick={(e) => e.stopPropagation()}
        >
            <button className="wordbar-btn" onClick={onSkipBackWord} {...hold(onSkipBackWord)} title={`${t('controls.prevWord')} (←)`}>◀</button>
            <button className="wordbar-btn wordbar-btn--play" onClick={onPlayPause} aria-busy={waiting || undefined} title={`${t('controls.playPause')} (Space)`}>
                {waiting ? <BusyDots /> : isPlaying && !isPaused ? '⏸' : '▶'}
            </button>
            <button className="wordbar-btn" onClick={onSkipForwardWord} {...hold(onSkipForwardWord)} title={`${t('controls.nextWord')} (→)`}>▶</button>
            <button
                className={`wordbar-btn wordbar-btn--flag ${noteOpen && noteType === 'mispronounced' ? 'wordbar-btn--active' : ''}`}
                onClick={() => toggleNote('mispronounced')}
                title={`${t('controls.reportWord', 'Report this word — it sounds wrong')} (R)`}
            >⚑</button>
            <button
                className={`wordbar-btn wordbar-btn--missing ${noteOpen && noteType === 'missing' ? 'wordbar-btn--active' : ''}`}
                onClick={() => toggleNote('missing')}
                title={t('controls.reportMissing', 'A word is missing near here')}
            >+</button>
            <button
                className={`wordbar-btn wordbar-btn--band ${noteOpen && noteType === 'highlight' ? 'wordbar-btn--active' : ''}`}
                onClick={() => toggleNote('highlight')}
                title={t('controls.reportHighlight', 'The highlighted sentence looks wrong')}
            >▭</button>

            <div className="wordbar-note" aria-hidden={!noteOpen}>
                <input
                    ref={inputRef}
                    className="wordbar-note-input"
                    type="text"
                    dir="auto"
                    maxLength={NOTE_LIMIT}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
                    placeholder={placeholder}
                    title={t('controls.reportHint', 'Enter sends · only this word, the voice, and nearby words.')}
                    tabIndex={noteOpen ? 0 : -1}
                />
                <button
                    className="wordbar-btn wordbar-btn--collapse"
                    onClick={() => setNoteOpen(false)}
                    tabIndex={noteOpen ? 0 : -1}
                    title={t('controls.reportCollapse', 'Close the note box')}
                >◀</button>
            </div>
        </div>
    )
}
