import { useState, useRef, useEffect } from 'react'
import { clampWpm, WPM_COMMIT_DELAY } from '../../utils/wpm'

export default function WpmBox({ value, min, max, onCommit, label }) {
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
