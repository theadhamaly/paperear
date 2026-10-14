import React, { useState, useMemo, useRef, useEffect, useLayoutEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { detectLanguage } from '../../utils/languageDetector'
import VoicePill, { VoiceGallery } from './VoicePicker'
import VolumeControl from './VolumeControl'
import Busy, { BusyDots } from '../Busy'
import { WPM_MIN, WPM_MAX } from '../../utils/wpm'
import DockSpeed from './DockSpeed'
import TunePanel from './TunePanel'
import './PlaybackControls.css'

export default function PlaybackControls({
    text = '',
    isPlaying,
    isPaused,
    hasText,
    voices,
    selectedVoice,
    onVoiceChange,
    currentWPM,
    speedLimit,
    volume,
    onVolumeChange,
    onMuteToggle,
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
    onSpeedCommit,
    pauses,
    onPausesChange,
    mixedVoices,
    onMixedVoicesChange,
    follow = 'sentence',
    onFollowChange,
    tuneOpen = false,
    onTuneClose,
    waiting = false,
    locked = false,
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
    const tune = tuneOpen
    const [voicesOpen, setVoicesOpen] = useState(false)
    useEffect(() => { if (tuneOpen) setVoicesOpen(false) }, [tuneOpen])

    const playing = isPlaying && !isPaused
    const transportLocked = locked
    const playLocked = locked && !playing

    const handlePlayPause = () => {
        if (isPaused) onResume()
        else if (isPlaying) onPause()
        else onPlay()
    }

    const detectedLang = useMemo(() => detectLanguage(text), [text])
    const hold = (fn) => (getSeekHoldHandlers ? getSeekHoldHandlers(fn) : {})

    return (
        <div ref={dockRef} className="dock" role="region" aria-label={t('controls.playPause')}>
            {children}
            <TunePanel
                open={tune}
                onClose={onTuneClose}
                volume={volume}
                onVolumeChange={onVolumeChange}
                currentWPM={currentWPM}
                speedLimit={speedLimit}
                wpmMin={WPM_MIN}
                wpmMax={WPM_MAX}
                onSpeedCommit={onSpeedCommit}
                pauses={pauses}
                onPausesChange={onPausesChange}
                follow={follow}
                onFollowChange={onFollowChange}
                mixedVoices={mixedVoices}
                onMixedVoicesChange={onMixedVoicesChange}
            />
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
                    <button type="button" className="dock-btn" onClick={onSkipBackwardParagraph} disabled={transportLocked} {...hold(onSkipBackwardParagraph)} title={`${t('controls.prevParagraph', 'Previous paragraph')} (Ctrl+←)`}>«</button>
                    <button type="button" className="dock-btn" onClick={onSkipBackwardWord} disabled={transportLocked} {...hold(onSkipBackwardWord)} title={`${t('controls.prevWord')} (←)`}>‹</button>
                    <button type="button" className="dock-btn" onClick={onStop} disabled={!hasText || transportLocked} title={`${t('controls.fromStart', 'Read from the beginning')} (Ctrl+Home)`}>■</button>
                    <button type="button" className={'dock-play' + (isPlaying && !isPaused ? ' is-active' : '')} onClick={handlePlayPause} disabled={!hasText || playLocked} aria-busy={waiting || undefined} title={`${t('controls.playPause')} (Space)`}>
                        {waiting ? <BusyDots /> : isPaused ? '▶' : isPlaying ? '❚❚' : '▶'}
                    </button>
                    <Busy active={waiting} delay={0} label={waitingLabel} className="busy--quiet" />
                    <button type="button" className="dock-btn" onClick={onSkipForwardWord} disabled={transportLocked} {...hold(onSkipForwardWord)} title={`${t('controls.nextWord')} (→)`}>›</button>
                    <button type="button" className="dock-btn" onClick={onSkipForwardParagraph} disabled={transportLocked} {...hold(onSkipForwardParagraph)} title={`${t('controls.nextParagraph', 'Next paragraph')} (Ctrl+→)`}>»</button>
                </div>

                {onSpeedCommit && (
                    <div className="dock-speed">
                        <DockSpeed value={currentWPM} min={WPM_MIN} max={WPM_MAX} onCommit={onSpeedCommit} />
                    </div>
                )}

                <div className="dock-voice">
                    <VoicePill
                        voices={voices}
                        selectedVoice={selectedVoice}
                        open={voicesOpen}
                        onToggle={() => { setVoicesOpen((v) => !v); onTuneClose?.() }}
                        disabled={voices.length === 0}
                    />
                </div>

                <VolumeControl volume={volume} onVolumeChange={onVolumeChange} onMuteToggle={onMuteToggle} />
            </div>
        </div>
    )
}
