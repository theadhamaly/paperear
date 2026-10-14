export const DOCK_MIN_WIDTH = 900
export const DOCK_WIDTH = 360
export const SHEET_HEIGHT_RATIO = 0.42

export function dockMode(viewportWidth) {
    return viewportWidth >= DOCK_MIN_WIDTH ? 'side' : 'sheet'
}

export function sheetCover(open, viewportWidth, viewportHeight) {
    return open && dockMode(viewportWidth) === 'sheet' ? Math.round(viewportHeight * SHEET_HEIGHT_RATIO) : 0
}

export function dockCoverFor(open) {
    if (typeof window === 'undefined') return 0
    return sheetCover(open, window.innerWidth, window.innerHeight)
}
