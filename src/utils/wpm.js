export function clampWpm(value, min, max) {
    const number = typeof value === 'number' ? value : parseFloat(value)
    if (!Number.isFinite(number)) return null
    return Math.min(max, Math.max(min, Math.round(number)))
}
