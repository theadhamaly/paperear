import React, { useState, useRef, useEffect, useLayoutEffect, useId } from 'react'
import { useTranslation } from 'react-i18next'
import Icon from '../icons'
import { releaseFocusWithin } from '../../utils/shortcutTarget'

const STEP = 5
const HOVER_OPEN_MS = 250
const HOVER_CLOSE_MS = 400
const VIEWPORT_MARGIN = 8

const clampPercent = (value) => Math.min(100, Math.max(0, value))

export default function VolumeControl({ volume, onVolumeChange, onMuteToggle }) {
    const { t } = useTranslation()
    const popoverId = useId()
    const rootRef = useRef(null)
    const popoverRef = useRef(null)
    const chevronRef = useRef(null)
    const openTimer = useRef(null)
    const closeTimer = useRef(null)
    const dragging = useRef(false)
    const percentRef = useRef(100)
    const [open, setOpen] = useState(false)

    const percent = Math.round((volume ?? 1) * 100)
    percentRef.current = percent
    const muted = percent === 0

    const clearTimers = () => {
        clearTimeout(openTimer.current)
        clearTimeout(closeTimer.current)
    }

    const applyPercent = (next) => {
        const clamped = clampPercent(next)
        if (clamped === percentRef.current) return
        percentRef.current = clamped
        onVolumeChange?.({ target: { value: clamped / 100 } })
    }

    const stepBy = (delta) => applyPercent(Math.round((percentRef.current + delta) / STEP) * STEP)

    useEffect(() => clearTimers, [])

    useEffect(() => {
        if (!open) return undefined
        const onPointerDown = (event) => {
            if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false)
        }
        document.addEventListener('pointerdown', onPointerDown)
        return () => document.removeEventListener('pointerdown', onPointerDown)
    }, [open])

    useEffect(() => {
        const root = rootRef.current
        if (!root) return undefined
        const onWheel = (event) => {
            if (!event.deltaY) return
            event.preventDefault()
            stepBy(event.deltaY < 0 ? STEP : -STEP)
            releaseFocusWithin(root)
        }
        root.addEventListener('wheel', onWheel, { passive: false })
        return () => root.removeEventListener('wheel', onWheel)
    })

    useLayoutEffect(() => {
        const popover = popoverRef.current
        const root = rootRef.current
        if (!open || !popover || !root) return
        popover.style.setProperty('--vol-shift', '0px')
        const anchor = root.getBoundingClientRect()
        const half = popover.offsetWidth / 2
        const center = anchor.left + anchor.width / 2
        const overflowStart = VIEWPORT_MARGIN - (center - half)
        const overflowEnd = center + half - (window.innerWidth - VIEWPORT_MARGIN)
        const shift = overflowStart > 0 ? overflowStart : overflowEnd > 0 ? -overflowEnd : 0
        popover.style.setProperty('--vol-shift', shift + 'px')
    }, [open])

    useEffect(() => {
        const endDrag = () => {
            if (dragging.current) releaseFocusWithin(rootRef.current)
            dragging.current = false
        }
        window.addEventListener('pointerup', endDrag)
        window.addEventListener('pointercancel', endDrag)
        return () => {
            window.removeEventListener('pointerup', endDrag)
            window.removeEventListener('pointercancel', endDrag)
        }
    }, [])

    const handlePointerEnter = (event) => {
        if (event.pointerType !== 'mouse') return
        clearTimeout(closeTimer.current)
        if (open) return
        openTimer.current = setTimeout(() => setOpen(true), HOVER_OPEN_MS)
    }

    const handlePointerLeave = (event) => {
        if (event.pointerType !== 'mouse') return
        clearTimeout(openTimer.current)
        if (!open) return
        closeTimer.current = setTimeout(() => {
            if (!dragging.current) setOpen(false)
        }, HOVER_CLOSE_MS)
    }

    const handleKeyDown = (event) => {
        if (event.key !== 'Escape' || !open) return
        event.stopPropagation()
        setOpen(false)
        if (rootRef.current?.contains(document.activeElement)) chevronRef.current?.focus()
    }

    const volumeLabel = t('controls.volume', 'Volume')

    return (
        <div
            ref={rootRef}
            className={'dock-volume' + (open ? ' is-open' : '')}
            onPointerEnter={handlePointerEnter}
            onPointerLeave={handlePointerLeave}
            onKeyDown={handleKeyDown}
        >
            <button
                type="button"
                className={'dock-sound' + (muted ? ' is-muted' : '')}
                onClick={(event) => {
                    onMuteToggle?.(event)
                    if (event.detail > 0) event.currentTarget.blur()
                }}
                aria-pressed={muted}
                aria-label={`${volumeLabel}: ${muted ? t('controls.muted', 'Muted') : percent + '%'}`}
                title={muted ? t('controls.unmute', 'Unmute') : t('controls.mute', 'Mute')}
            >
                <Icon name={muted ? 'volumeMute' : 'volume'} size={18} />
                <span className="dock-sound__label">{muted ? t('controls.muted', 'Muted') : `${percent}%`}</span>
            </button>
            <button
                ref={chevronRef}
                type="button"
                className="dock-volume__toggle"
                onClick={(event) => {
                    clearTimers()
                    setOpen((value) => !value)
                    if (event.detail > 0) event.currentTarget.blur()
                }}
                aria-expanded={open}
                aria-controls={popoverId}
                aria-label={t('controls.adjustVolume', 'Adjust volume')}
                title={t('controls.adjustVolume', 'Adjust volume')}
            >
                <Icon name="chevron" size={14} />
            </button>
            {open && (
                <div
                    ref={popoverRef}
                    id={popoverId}
                    className="dock-volume__popover"
                    role="group"
                    aria-label={volumeLabel}
                    onPointerEnter={() => clearTimeout(closeTimer.current)}
                >
                    <Icon name={muted ? 'volumeMute' : 'volume'} size={16} />
                    <input
                        type="range"
                        className="dock-volume__range"
                        min="0"
                        max="100"
                        step={STEP}
                        value={percent}
                        aria-label={volumeLabel}
                        aria-valuetext={`${percent}%`}
                        onPointerDown={() => { dragging.current = true }}
                        onChange={(event) => applyPercent(parseInt(event.target.value, 10))}
                    />
                    <span className="dock-volume__value">{percent}%</span>
                </div>
            )}
        </div>
    )
}
