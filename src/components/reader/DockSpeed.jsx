import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import Icon from '../icons'
import WpmBox from './WpmBox'
import { clampWpm, WPM_COMMIT_DELAY } from '../../utils/wpm'

const STEP = 10

export default function DockSpeed({ value, min, max, onCommit }) {
    const { t } = useTranslation()
    const [shown, setShown] = useState(value)
    const dragging = useRef(false)
    const timer = useRef(null)
    const latest = useRef({ shown: value, value, onCommit })
    latest.current = { shown, value, onCommit }

    useEffect(() => {
        if (!dragging.current && !timer.current) setShown(value)
    }, [value])

    const flush = () => {
        clearTimeout(timer.current)
        timer.current = null
        const { shown: next, value: current, onCommit: commit } = latest.current
        if (next !== current) commit(next)
    }

    useEffect(() => () => {
        if (timer.current) flush()
    }, [])

    const show = (next) => {
        latest.current.shown = next
        setShown(next)
    }

    const schedule = () => {
        clearTimeout(timer.current)
        timer.current = setTimeout(flush, WPM_COMMIT_DELAY)
    }

    const step = (direction) => {
        const next = clampWpm(latest.current.shown + direction * STEP, min, max)
        if (next === null || next === latest.current.shown) return
        show(next)
        schedule()
    }

    const handleRange = (e) => {
        show(parseInt(e.target.value, 10))
        if (!dragging.current) schedule()
    }

    const release = () => {
        if (!dragging.current) return
        dragging.current = false
        flush()
    }

    const handleBox = (next) => {
        clearTimeout(timer.current)
        timer.current = null
        show(next)
        onCommit(next)
    }

    const label = t('controls.speed')

    return (
        <div className="dock-pace">
            <input
                type="range"
                className="dock-pace__range"
                min={min}
                max={max}
                step="5"
                value={shown}
                aria-label={label}
                onPointerDown={() => { dragging.current = true }}
                onPointerUp={release}
                onPointerCancel={release}
                onChange={handleRange}
            />
            <WpmBox value={shown} min={min} max={max} onCommit={handleBox} label={t('controls.wpm', 'WPM')} />
            <span className="dock-pace__steps">
                <button type="button" className="dock-pace__step" onClick={() => step(1)} disabled={shown >= max} aria-label={t('controls.faster', 'Faster')} title={t('controls.faster', 'Faster')}>
                    <Icon name="chevron" size={16} />
                </button>
                <button type="button" className="dock-pace__step is-down" onClick={() => step(-1)} disabled={shown <= min} aria-label={t('controls.slower', 'Slower')} title={t('controls.slower', 'Slower')}>
                    <Icon name="chevron" size={16} />
                </button>
            </span>
        </div>
    )
}
