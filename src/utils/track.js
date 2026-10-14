const fired = new Set()

const analyticsOff = import.meta.env?.VITE_ANALYTICS === 'off'

export const track = (name) => {
    if (analyticsOff) return
    if (fired.has(name)) return
    try {
        if (typeof window !== 'undefined' && window.umami && typeof window.umami.track === 'function') {
            fired.add(name)
            window.umami.track(name)
        }
    } catch { }
}
