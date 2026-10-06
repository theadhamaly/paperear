import React, { useState, useMemo, useRef, useEffect, useLayoutEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { detectLanguage } from '../../utils/languageDetector'
import VoicePill, { VoiceGallery } from './VoicePicker'
import Busy, { BusyDots } from '../Busy'
import { clampWpm } from '../../utils/wpm'
import './PlaybackControls.css'

const PRESETS = [0.75, 1, 1.25, 1.5, 2]
export const WPM_MIN = 75
export const WPM_MAX = 450
const WPM_COMMIT_DELAY = 650

function WpmBox({ value, min, max, onCommit, label }) {
    const [draft, setDraft] = useState(String(value))
    const focused = useRef(false)
    const timer = useRef(null)
    const cancelled = useRef(false)
    useEffect(() => {
        if (!focused.current) setDraft(String(value))
    }, [value])
    useEffect(() => () => clearTimeout(timer.current), [])
    const clearTimer = () => { clearTimeout(timer.current); timer.current = null }
    const commit = (text) => {
        clearTimer()
        const next = clampWpm(text, min, max)
        if (next === null) { setDraft(String(value)); return }
        if (next !== value) onCommit(next)
        setDraft(String(next))
    }
    const scheduleCommit = (text) => {
        clearTimer()
        timer.current = setTimeout(() => commit(text), WPM_COMMIT_DELAY)
    }
    const handleChange = (e) => {
        const text = e.target.value
        setDraft(text)
        if (e.nativeEvent.inputType === undefined) scheduleCommit(text)
    }
    const handleKeyDown = (e) => {
        if (e.key === 'Enter') { e.currentTarget.blur() }
        else if (e.key === 'Escape') { cancelled.current = true; clearTimer(); setDraft(String(value)); e.currentTarget.blur() }
        else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault()
            const base = clampWpm(draft, min, max) ?? value
            const next = clampWpm(base + (e.key === 'ArrowUp' ? 5 : -5), min, max)
            setDraft(String(next))
            scheduleCommit(String(next))
        }
    }
    return (
        <label className="dock-wpm">
            <input
                type="number"
                inputMode="numeric"
                className="dock-wpm__input"
                min={min}
                max={max}
                step={5}
                value={draft}
                onFocus={() => { focused.current = true }}
                onBlur={() => { focused.current = false; if (cancelled.current) { cancelled.current = false; clearTimer(); return }; commit(draft) }}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
            />
            {' '}{label}
        </label>
    )
}
const LINE_PAUSES = [0, 150, 280, 500, 800]
const PARAGRAPH_PAUSES = [0, 400, 800, 1200, 2000]

export default function PlaybackControls({
    text = '',
    isPlaying,
    isPaused,
    hasText,
    voices,
    selectedVoice,
    onVoiceChange,
    currentWPM,
    volume,
    onVolumeChange,
    onMuteToggle,
    onSpeedInput,
    onSpeedChange,
    onPlay,
    onPause,
    onResume,
    onStop,
    onSkipForwardWord,
    onSkipBackwardWord,
    onSkipForwardParagraph,
    onSkipBackwardParagraph,
    getSeekHoldHandlers,
    onVoicesChanged,
    onSpeedPreset,
    onSpeedCommit,
    pauses,
    onPausesChange,
    mixedVoices,
    onMixedVoicesChange,
    waiting = false,
    waitingLabel = '',
    children,
}) {
    const { t } = useTranslation();
    const dockRef = useRef(null)
    const applyDockHeight = () => {
        const el = dockRef.current
        if (el) document.documentElement.style.setProperty('--dock-h', el.offsetHeight + 'px')
    }
    useLayoutEffect(applyDockHeight)
    useEffect(() => {
        const el = dockRef.current
        if (!el || typeof ResizeObserver === 'undefined') return undefined
        const ro = new ResizeObserver(applyDockHeight)
        ro.observe(el)
        window.addEventListener('resize', applyDockHeight)
        return () => { ro.disconnect(); window.removeEventListener('resize', applyDockHeight); document.documentElement.style.removeProperty('--dock-h') }
    }, [])
    const [tune, setTune] = useState(false)
    const [voicesOpen, setVoicesOpen] = useState(false)

    const handlePlayPause = () => {
        if (isPaused) onResume()
        else if (isPlaying) onPause()
        else onPlay()
    }

    const detectedLang = useMemo(() => detectLanguage(text), [text])
    const hold = (fn) => (getSeekHoldHandlers ? getSeekHoldHandlers(fn) : {})
    const seconds = (ms) => `${(ms / 1000).toFixed(2).replace(/\.?0+$/, '')}${t('controls.seconds', 's')}`

    return (
        <div ref={dockRef} className="dock" role="region" aria-label={t('controls.playPause')}>
            {children}
            {tune && (
                <div className="dock-tune">
                    <label className="dock-tune__row">
                        <span>{t('controls.volume', 'Volume')}</span>
                        <input type="range" min="0" max="1" step="0.02" value={volume ?? 1} onChange={onVolumeChange} />
                        <span className="dock-tune__value">{Math.round((volume ?? 1) * 100)}%</span>
                    </label>
                    <div className="dock-tune__row">
                        <span>{t('controls.speed')}</span>
                        <input type="range" min={WPM_MIN} max={WPM_MAX} step="5" value={currentWPM} onInput={onSpeedInput} onChange={onSpeedChange} />
                        <WpmBox value={currentWPM} min={WPM_MIN} max={WPM_MAX} onCommit={onSpeedCommit} label={t('controls.wpm', 'WPM')} />
                    </div>
                    {pauses && onPausesChange && (
                        <div className="dock-tune__pauses">
                            <label>
                                <span>{t('controls.pauseLine', 'Pause after a line')}</span>
                                <select value={pauses.linePause} onChange={(e) => onPausesChange({ linePause: Number(e.target.value) })}>
                                    {LINE_PAUSES.map((ms) => <option key={ms} value={ms}>{seconds(ms)}</option>)}
                                </select>
                            </label>
                            <label>
                                <span>{t('controls.pauseParagraph', 'Pause after a paragraph')}</span>
                                <select value={pauses.paragraphPause} onChange={(e) => onPausesChange({ paragraphPause: Number(e.target.value) })}>
                                    {PARAGRAPH_PAUSES.map((ms) => <option key={ms} value={ms}>{seconds(ms)}</option>)}
                                </select>
                            </label>
                        </div>
                    )}
                    {onMixedVoicesChange && (
                        <label className="dock-tune__check">
                            <input type="checkbox" checked={mixedVoices !== false} onChange={(e) => onMixedVoicesChange(e.target.checked)} />
                            <span>
                                {t('controls.mixedVoices', 'Read foreign words in their own voice')}
                                <small>{t('controls.mixedVoicesHint', 'A word from another language is read by a voice for that language.')}</small>
                            </span>
                        </label>
                    )}
                </div>
            )}
            {voicesOpen && (
                <div className="dock-voices">
                    <VoiceGallery
                        voices={voices}
                        selectedVoice={selectedVoice}
                        onVoiceChange={onVoiceChange}
                        onVoicesChanged={onVoicesChanged}
                        canPreview={!isPlaying}
                        sample={text}
                        docLang={detectedLang}
                        onClose={() => setVoicesOpen(false)}
                    />
                </div>
            )}

            <div className="dock-row">
                <div className="dock-transport">
                    <button type="button" className="dock-btn" onClick={onSkipBackwardParagraph} {...hold(onSkipBackwardParagraph)} title={`${t('controls.prevParagraph', 'Previous paragraph')} (Ctrl+←)`}>«</button>
                    <button type="button" className="dock-btn" onClick={onSkipBackwardWord} {...hold(onSkipBackwardWord)} title={`${t('controls.prevWord')} (←)`}>‹</button>
                    <button type="button" className="dock-btn" onClick={onStop} disabled={!hasText} title={`${t('controls.fromStart', 'Read from the beginning')} (Ctrl+Home)`}>■</button>
                    <button type="button" className={'dock-play' + (isPlaying && !isPaused ? ' is-active' : '')} onClick={handlePlayPause} disabled={!hasText} aria-busy={waiting || undefined} title={`${t('controls.playPause')} (Space)`}>
                        {waiting ? <BusyDots /> : isPaused ? '▶' : isPlaying ? '❚❚' : '▶'}
                    </button>
                    <Busy active={waiting} delay={0} label={waitingLabel} className="busy--quiet" />
                    <button type="button" className="dock-btn" onClick={onSkipForwardWord} {...hold(onSkipForwardWord)} title={`${t('controls.nextWord')} (→)`}>›</button>
                    <button type="button" className="dock-btn" onClick={onSkipForwardParagraph} {...hold(onSkipForwardParagraph)} title={`${t('controls.nextParagraph', 'Next paragraph')} (Ctrl+→)`}>»</button>
                </div>

                {onSpeedPreset && (
                    <div className="dock-speed">
                        {PRESETS.map((factor) => {
                            const wpm = Math.round(150 * factor)
                            return (
                                <button key={factor} type="button" className={'dock-chip' + (currentWPM === wpm ? ' is-active' : '')} onClick={() => onSpeedPreset(wpm)}>
                                    {factor}×
                                </button>
                            )
                        })}
                        <WpmBox value={currentWPM} min={WPM_MIN} max={WPM_MAX} onCommit={onSpeedCommit} label={t('controls.wpm', 'WPM')} />
                    </div>
                )}

                <div className="dock-voice">
                    <VoicePill
                        voices={voices}
                        selectedVoice={selectedVoice}
                        open={voicesOpen}
                        onToggle={() => { setVoicesOpen((v) => !v); setTune(false) }}
                        disabled={voices.length === 0}
                    />
                </div>

                <button type="button" className={'dock-chip' + ((volume ?? 1) === 0 ? ' is-muted' : '')} onClick={onMuteToggle} title={(volume ?? 1) === 0 ? t('controls.unmute', 'Unmute') : t('controls.mute', 'Mute')}>
                    {t('controls.sound', 'Sound')} {Math.round((volume ?? 1) * 100)}%
                </button>
                <button type="button" className={'dock-chip' + (tune ? ' is-active' : '')} onClick={() => { setTune((v) => !v); setVoicesOpen(false) }} aria-expanded={tune}>
                    {t('controls.tune', 'Tune')}
                </button>
            </div>
        </div>
    )
}
