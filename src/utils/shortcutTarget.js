const ARROW_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'])

export const isNativeRangeArrow = (event) => {
    const target = event.target
    if (!target || target.tagName !== 'INPUT' || target.type !== 'range') return false
    if (event.ctrlKey || event.metaKey || event.altKey) return false
    return ARROW_KEYS.has(event.code)
}

export const releaseFocusWithin = (root, doc = document) => {
    const active = doc.activeElement
    if (active && active !== doc.body && root && root.contains(active)) active.blur()
}
