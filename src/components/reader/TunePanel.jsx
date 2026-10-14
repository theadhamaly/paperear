import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { FOLLOW_MODES } from '../../utils/follow'
import SpeedSlider from './SpeedSlider'
import './TunePanel.css'

const FOLLOW_LABELS = {
    word: { key: 'controls.followWord', fallback: 'Word only' },
    sentence: { key: 'controls.followSentence', fallback: 'Word + sentence' },
    paragraph: { key: 'controls.followParagraph', fallback: 'Word + paragraph' },
}
const LINE_PAUSES = [0, 150, 280, 500, 800]
const PARAGRAPH_PAUSES = [0, 400, 800, 1200, 2000]
const HINT_ROWS = [0, 1, 2]
const HINT_CELLS = [0, 1, 2, 3]

function FollowHint({ mode }) {
    return (
        <span className={'tune-hint tune-hint--' + mode} aria-hidden="true">
            {HINT_ROWS.map((row) => (
                <span key={row} className="tune-hint__row">
                    {HINT_CELLS.map((cell) => <i key={cell} />)}
                </span>
            ))}
        </span>
    )
}

function PauseChoice({ label, value, options, onPick, seconds }) {
    return (
        <div className="tune-field" role="radiogroup" aria-label={label}>
            <span className="tune-field__label">{label}</span>
            <div className="tune-seg">
                {options.map((ms) => (
                    <button
                        key={ms}
                        type="button"
                        role="radio"
                        aria-checked={value === ms}
                        className={'tune-seg__btn' + (value === ms ? ' is-active' : '')}
                        onClick={() => onPick(ms)}
                    >
                        {seconds(ms)}
                    </button>
                ))}
            </div>
        </div>
    )
}

export default function TunePanel({
    open,
    onClose,
    volume,
    onVolumeChange,
    currentWPM,
    speedLimit,
    wpmMin,
    wpmMax,
    onSpeedCommit,
    pauses,
    onPausesChange,
    follow,
    onFollowChange,
    mixedVoices,
    onMixedVoicesChange,
}) {
    const { t } = useTranslation()
    const panelRef = useRef(null)

    useEffect(() => {
        if (!open) return undefined
        const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
        const onPointer = (e) => {
            const panel = panelRef.current
            if (!panel || panel.contains(e.target)) return
            if (e.target.closest?.('[data-tune-toggle]')) return
            onClose?.()
        }
        window.addEventListener('keydown', onKey)
        document.addEventListener('pointerdown', onPointer)
        return () => {
            window.removeEventListener('keydown', onKey)
            document.removeEventListener('pointerdown', onPointer)
        }
    }, [open, onClose])

    useEffect(() => {
        if (open) panelRef.current?.focus({ preventScroll: true })
    }, [open])

    if (!open) return null

    const seconds = (ms) => `${(ms / 1000).toFixed(2).replace(/\.?0+$/, '')}${t('controls.seconds', 's')}`
    const volumePercent = Math.round((volume ?? 1) * 100)

    return (
        <aside ref={panelRef} className="tune-panel" role="dialog" aria-label={t('controls.tune', 'Tune')} tabIndex={-1}>
            <header className="tune-panel__head">
                <h2>{t('controls.tune', 'Tune')}</h2>
                <button type="button" className="tune-panel__close" onClick={onClose} aria-label={t('controls.tuneClose', 'Close')}>×</button>
            </header>

            <div className="tune-panel__body">
                <section className="tune-section">
                    <h3>{t('controls.tuneSound', 'Sound')}</h3>
                    <p>{t('controls.tuneSoundHint', 'How loud it is and how fast it reads.')}</p>
                    <label className="tune-slider">
                        <span className="tune-slider__top">
                            <span>{t('controls.volume', 'Volume')}</span>
                            <strong>{volumePercent}%</strong>
                        </span>
                        <input type="range" min="0" max="1" step="0.02" value={volume ?? 1} onChange={onVolumeChange} />
                    </label>
                    <SpeedSlider
                        value={currentWPM}
                        min={wpmMin}
                        max={wpmMax}
                        onCommit={onSpeedCommit}
                        note={speedLimit && (
                            <span className="tune-slider__note" role="status">
                                {speedLimit.kind === 'max'
                                    ? t('controls.speedTopsOut', 'This voice tops out around {{wpm}} words a minute.', { wpm: speedLimit.wpm })
                                    : t('controls.speedBottomsOut', 'This voice slows down to about {{wpm}} words a minute at most.', { wpm: speedLimit.wpm })}
                            </span>
                        )}
                    />
                </section>

                {pauses && onPausesChange && (
                    <section className="tune-section">
                        <h3>{t('controls.tunePauses', 'Pauses')}</h3>
                        <p>{t('controls.tunePausesHint', 'How long the voice rests between lines and paragraphs.')}</p>
                        <PauseChoice
                            label={t('controls.pauseLine', 'Pause after a line')}
                            value={pauses.linePause}
                            options={LINE_PAUSES}
                            onPick={(ms) => onPausesChange({ linePause: ms })}
                            seconds={seconds}
                        />
                        <PauseChoice
                            label={t('controls.pauseParagraph', 'Pause after a paragraph')}
                            value={pauses.paragraphPause}
                            options={PARAGRAPH_PAUSES}
                            onPick={(ms) => onPausesChange({ paragraphPause: ms })}
                            seconds={seconds}
                        />
                    </section>
                )}

                {onFollowChange && (
                    <section className="tune-section">
                        <h3>{t('controls.follow', 'Follow')}</h3>
                        <p>{t('controls.tuneFollowHint', 'What is highlighted while it reads.')}</p>
                        <div className="tune-cards" role="radiogroup" aria-label={t('controls.follow', 'Follow')}>
                            {FOLLOW_MODES.map((mode) => (
                                <button
                                    key={mode}
                                    type="button"
                                    role="radio"
                                    aria-checked={follow === mode}
                                    className={'tune-card' + (follow === mode ? ' is-active' : '')}
                                    onClick={() => onFollowChange(mode)}
                                >
                                    <FollowHint mode={mode} />
                                    <span>{t(FOLLOW_LABELS[mode].key, FOLLOW_LABELS[mode].fallback)}</span>
                                </button>
                            ))}
                        </div>
                    </section>
                )}

                {onMixedVoicesChange && (
                    <section className="tune-section">
                        <h3>{t('controls.tuneVoices', 'Voices')}</h3>
                        <p>{t('controls.tuneVoicesHint', 'Choose how words from other languages are spoken.')}</p>
                        <label className="tune-toggle">
                            <span className="tune-toggle__text">
                                {t('controls.mixedVoices', 'Read foreign words in their own voice')}
                                <small>{t('controls.mixedVoicesHint', 'A word from another language is read by a voice for that language.')}</small>
                            </span>
                            <input type="checkbox" role="switch" checked={mixedVoices !== false} onChange={(e) => onMixedVoicesChange(e.target.checked)} />
                            <span className="tune-toggle__track" aria-hidden="true" />
                        </label>
                    </section>
                )}
            </div>
        </aside>
    )
}
