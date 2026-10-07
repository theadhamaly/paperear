const fired = new Set()

export const track = (name) => {
    if (fired.has(name)) return
    try {
        if (typeof window !== 'undefined' && window.umami && typeof window.umami.track === 'function') {
            fired.add(name)
            window.umami.track(name)
        }
    } catch { }
}
