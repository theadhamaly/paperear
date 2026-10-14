import { useLayoutEffect, useRef } from 'react'
import { anchoredScroll, fractionScroll, makeAnchor, intersectsBox, needsMove } from '../utils/viewAnchor'

const SETTLE_MS = 450
const COVER_MARGIN = 24

export default function useViewAnchor(token, { getScroller, locate, coverBottom = null }) {
    const stateRef = useRef({ token, anchor: null, pending: false, until: 0, frame: 0, release: null })
    const state = stateRef.current
    const callbacks = useRef({ getScroller, locate })
    callbacks.current = { getScroller, locate }

    if (state.token !== token) {
        state.token = token
        state.pending = true
        const settling = performance.now() < state.until
        const scroller = getScroller()
        if (!(settling && state.anchor) && scroller) {
            const box = scroller.getBoundingClientRect()
            let target = locate()
            let useLocate = true
            if (!target || !intersectsBox(target.getBoundingClientRect(), box)) {
                useLocate = false
                const probe = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
                const word = probe && scroller.contains(probe) ? probe.closest('[data-word-index]') : null
                target = word
            }
            const rect = target ? target.getBoundingClientRect() : { top: box.top + box.height / 2, left: box.left + box.width / 2 }
            const made = makeAnchor(rect, box, { top: scroller.scrollTop, left: scroller.scrollLeft }, { height: scroller.scrollHeight, width: scroller.scrollWidth })
            const covered = coverBottom ? coverBottom() : 0
            if (covered > 0 && target && made.top + rect.height > box.height - covered - COVER_MARGIN) made.top = Math.max(0, (box.height - covered) * 0.4)
            state.anchor = {
                ...made,
                useLocate,
                index: target?.dataset?.wordIndex ?? null,
            }
        }
    }

    useLayoutEffect(() => {
        const state = stateRef.current
        if (!state.pending) return undefined
        state.pending = false
        const anchor = state.anchor
        const scroller = callbacks.current.getScroller()
        if (!anchor || !scroller) return undefined

        const stop = () => {
            state.until = 0
            cancelAnimationFrame(state.frame)
            if (state.release) state.release()
            state.release = null
        }

        const apply = () => {
            const sc = callbacks.current.getScroller()
            if (!sc) return
            const box = sc.getBoundingClientRect()
            const scroll = { top: sc.scrollTop, left: sc.scrollLeft }
            let target = null
            if (anchor.useLocate) target = callbacks.current.locate()
            else if (anchor.index !== null) target = sc.querySelector(`[data-word-index="${anchor.index}"]`)
            const next = target
                ? anchoredScroll(anchor, target.getBoundingClientRect(), box, scroll)
                : fractionScroll(anchor, { height: sc.scrollHeight, width: sc.scrollWidth }, scroll)
            if (needsMove(scroll, next)) sc.scrollTo({ top: next.top, left: next.left, behavior: 'instant' })
        }

        if (state.release) state.release()
        cancelAnimationFrame(state.frame)
        state.until = performance.now() + SETTLE_MS
        scroller.addEventListener('wheel', stop, { passive: true })
        scroller.addEventListener('touchmove', stop, { passive: true })
        scroller.addEventListener('pointerdown', stop)
        state.release = () => {
            scroller.removeEventListener('wheel', stop)
            scroller.removeEventListener('touchmove', stop)
            scroller.removeEventListener('pointerdown', stop)
        }

        apply()
        const tick = () => {
            if (performance.now() >= state.until) {
                if (state.release) state.release()
                state.release = null
                return
            }
            apply()
            state.frame = requestAnimationFrame(tick)
        }
        state.frame = requestAnimationFrame(tick)
        return undefined
    }, [token])

    useLayoutEffect(() => () => {
        const state = stateRef.current
        cancelAnimationFrame(state.frame)
        if (state.release) state.release()
    }, [])

    return { isSettling: () => performance.now() < state.until }
}
