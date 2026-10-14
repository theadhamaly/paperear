import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Icon from '../icons'
import { ZOOM_MIN, ZOOM_MAX, ZOOM_SLIDER_STEP, clampZoom, stepZoom } from '../../utils/zoomSteps'
import './ZoomControl.css'

export default function ZoomControl({ zoom, onChange }) {
    const { t } = useTranslation()
    const [open, setOpen] = useState(false)
    const rootRef = useRef(null)
    const percent = Math.round(zoom * 100)

    useEffect(() => {
        if (!open) return undefined
        const onPointerDown = (e) => {
            if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
        }
        const onKeyDown = (e) => {
            if (e.key === 'Escape') setOpen(false)
        }
        document.addEventListener('pointerdown', onPointerDown)
        document.addEventListener('keydown', onKeyDown)
        return () => {
            document.removeEventListener('pointerdown', onPointerDown)
            document.removeEventListener('keydown', onKeyDown)
        }
    }, [open])

    const zoomOutLabel = t('controls.zoomOut', 'Zoom out')
    const zoomInLabel = t('controls.zoomIn', 'Zoom in')
    const menuLabel = t('controls.zoomMenu', 'Zoom level')

    return (
        <div className="zoom-ctl" ref={rootRef}>
            {open && (
                <div className="zoom-ctl__panel">
                    <input
                        type="range"
                        className="zoom-ctl__slider"
                        min={ZOOM_MIN}
                        max={ZOOM_MAX}
                        step={ZOOM_SLIDER_STEP}
                        value={zoom}
                        onChange={(e) => onChange(clampZoom(e.target.value))}
                        aria-label={t('controls.zoomSlider', 'Zoom')}
                    />
                    <span className="zoom-ctl__value">{percent}%</span>
                </div>
            )}
            <div className="zoom-ctl__bar">
                <button type="button" className="zoom-ctl__btn" onClick={() => onChange(stepZoom(zoom, -1))} disabled={zoom <= ZOOM_MIN} aria-label={zoomOutLabel} title={zoomOutLabel}>
                    <Icon name="zoomOut" size={18} />
                </button>
                <button type="button" className={'zoom-ctl__btn' + (open ? ' is-active' : '')} onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label={menuLabel} title={`${menuLabel} (${percent}%)`}>
                    <Icon name="zoom" size={18} />
                </button>
                <button type="button" className="zoom-ctl__btn" onClick={() => onChange(stepZoom(zoom, 1))} disabled={zoom >= ZOOM_MAX} aria-label={zoomInLabel} title={zoomInLabel}>
                    <Icon name="zoomIn" size={18} />
                </button>
            </div>
        </div>
    )
}
