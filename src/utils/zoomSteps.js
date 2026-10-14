export const ZOOM_MIN = 0.5
export const ZOOM_MAX = 4
export const ZOOM_SLIDER_STEP = 0.05

const roundToStep = (value) => Math.round(value / ZOOM_SLIDER_STEP) * ZOOM_SLIDER_STEP

export function clampZoom(value) {
    const number = Number(value)
    if (!Number.isFinite(number)) return 1
    const snapped = Math.round(roundToStep(number) * 100) / 100
    return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, snapped))
}

export function stepZoom(current, dir) {
    const base = clampZoom(current)
    const size = dir > 0 ? (base >= 1 ? 0.1 : 0.05) : (base > 1 ? 0.1 : 0.05)
    return clampZoom(base + dir * size)
}
