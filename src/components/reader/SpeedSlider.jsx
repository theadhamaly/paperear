import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { WPM_COMMIT_DELAY } from '../../utils/wpm'
import WpmBox from './WpmBox'

export default function SpeedSlider({ value, min, max, onCommit, note }) {
    const { t } = useTranslation()
    const [draft, setDraft] = useState(value)
    const dragging = useRef(false)
    const timer = useRef(null)
    const latest = useRef({ draft: value, value, onCommit })
    latest.current = { draft, value, onCommit }

    useEffect(() => {
        if (!dragging.current) setDraft(value)
    }, [value])

    const flush = () => {
        clearTimeout(timer.current)
        timer.current = null
        const { draft: next, value: current, onCommit: commit } = latest.current
        if (next !== current) commit(next)
    }

    useEffect(() => () => {
        if (timer.current) flush()
    }, [])

    const handleChange = (e) => {
        const next = parseInt(e.target.value, 10)
        setDraft(next)
        latest.current.draft = next
        if (dragging.current) return
        clearTimeout(timer.current)
        timer.current = setTimeout(flush, WPM_COMMIT_DELAY)
    }

    const release = () => {
        if (!dragging.current) return
        dragging.current = false
        flush()
    }

    return (
        <div className="tune-slider tune-speed">
            <span className="tune-slider__top">
                <label htmlFor="tune-speed-range">{t('controls.speed')}</label>
                <WpmBox value={draft} min={min} max={max} onCommit={onCommit} label={t('controls.wpm', 'WPM')} />
            </span>
            <input
                id="tune-speed-range"
                type="range"
                min={min}
                max={max}
                step="5"
                value={draft}
                onPointerDown={() => { dragging.current = true }}
                onPointerUp={release}
                onPointerCancel={release}
                onChange={handleChange}
            />
            {note}
        </div>
    )
}
