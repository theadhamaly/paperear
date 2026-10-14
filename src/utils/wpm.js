export const WPM_MIN = 75
export const WPM_MAX = 450
export const WPM_COMMIT_DELAY = 650

export function clampWpm(value, min, max) {
    const number = typeof value === 'number' ? value : parseFloat(value)
    if (!Number.isFinite(number)) return null
    return Math.min(max, Math.max(min, Math.round(number)))
}
