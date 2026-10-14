export function anchoredScroll(anchor, rect, box, scroll) {
    return {
        top: scroll.top + (rect.top - box.top) - anchor.top,
        left: scroll.left + (rect.left - box.left) - anchor.left,
    }
}

export function fractionScroll(anchor, size, scroll) {
    return {
        top: anchor.fracY * size.height - anchor.top,
        left: anchor.fracX === null ? scroll.left : anchor.fracX * size.width - anchor.left,
    }
}

export function makeAnchor(rect, box, scroll, size) {
    const top = rect.top - box.top
    const left = rect.left - box.left
    return {
        top,
        left,
        fracY: size.height > 0 ? (scroll.top + top) / size.height : 0,
        fracX: size.width > 0 && scroll.left >= 0 ? (scroll.left + left) / size.width : null,
    }
}

export function intersectsBox(rect, box) {
    return rect.bottom > box.top && rect.top < box.bottom && rect.right > box.left && rect.left < box.right
}

export function needsMove(from, to, tolerance = 0.5) {
    return Math.abs(from.top - to.top) > tolerance || Math.abs(from.left - to.left) > tolerance
}
