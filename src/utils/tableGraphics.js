import { multiply } from './glyphBoxes.js'

const MOVE_TO = 0
const LINE_TO = 1
const CURVE_TO = 2
const QUADRATIC_TO = 3
const CLOSE_PATH = 4

const NEAR_WHITE = 244
const MIN_RULE_LENGTH = 6
const MAX_RULE_THICKNESS = 0.8
const MAX_FILLED_RULE_THICKNESS = 2.6
const AXIS_TOLERANCE = 0.6

const point = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]

const isWhite = (color) => {
    if (!color || color[0] !== '#') return false
    const channel = (at) => parseInt(color.slice(at, at + 2), 16)
    return channel(1) > NEAR_WHITE && channel(3) > NEAR_WHITE && channel(5) > NEAR_WHITE
}

const grayColor = (value) => {
    const level = Math.round(value <= 1 ? value * 255 : value).toString(16).padStart(2, '0')
    return `#${level}${level}${level}`
}

function subpaths(data, matrix) {
    const out = []
    let current = null
    let i = 0
    while (i < data.length) {
        const op = data[i++]
        if (op === MOVE_TO) {
            current = { points: [point(matrix, data[i], data[i + 1])], closed: false, curved: false }
            out.push(current)
            i += 2
        } else if (op === LINE_TO) {
            if (!current) {
                current = { points: [], closed: false, curved: false }
                out.push(current)
            }
            current.points.push(point(matrix, data[i], data[i + 1]))
            i += 2
        } else if (op === CURVE_TO) {
            if (current) {
                current.curved = true
                current.points.push(point(matrix, data[i + 4], data[i + 5]))
            }
            i += 6
        } else if (op === QUADRATIC_TO) {
            if (current) {
                current.curved = true
                current.points.push(point(matrix, data[i + 2], data[i + 3]))
            }
            i += 4
        } else if (op === CLOSE_PATH) {
            if (current) current.closed = true
        } else break
    }
    return out
}

function axisRectangle(sub) {
    let corners = sub.points
    const first = corners[0]
    const last = corners[corners.length - 1]
    if (corners.length === 5 && Math.abs(first[0] - last[0]) < 0.5 && Math.abs(first[1] - last[1]) < 0.5) corners = corners.slice(0, 4)
    if (corners.length !== 4 || sub.curved) return null
    for (let k = 0; k < 4; k++) {
        const a = corners[k]
        const b = corners[(k + 1) % 4]
        if (Math.abs(a[0] - b[0]) > AXIS_TOLERANCE && Math.abs(a[1] - b[1]) > AXIS_TOLERANCE) return null
    }
    const xs = corners.map((c) => c[0])
    const ys = corners.map((c) => c[1])
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }
}

export function graphicsFromOperatorList(opList, OPS, pageHeight) {
    const horizontal = []
    const vertical = []
    const rects = []
    const strokePaints = new Set([OPS.stroke, OPS.closeStroke, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke])
    const fillPaints = new Set([OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke, OPS.rawFillPath])
    let ctm = [1, 0, 0, -1, 0, pageHeight]
    let fill = '#000000'
    let stroke = '#000000'
    const stack = []
    const addSegment = (a, b) => {
        const dx = Math.abs(a[0] - b[0])
        const dy = Math.abs(a[1] - b[1])
        if (dy <= MAX_RULE_THICKNESS && dx >= MIN_RULE_LENGTH) horizontal.push({ y: (a[1] + b[1]) / 2, x1: Math.min(a[0], b[0]), x2: Math.max(a[0], b[0]) })
        else if (dx <= MAX_RULE_THICKNESS && dy >= MIN_RULE_LENGTH) vertical.push({ x: (a[0] + b[0]) / 2, y1: Math.min(a[1], b[1]), y2: Math.max(a[1], b[1]) })
    }
    const { fnArray, argsArray } = opList
    for (let i = 0; i < fnArray.length; i++) {
        const fn = fnArray[i]
        const args = argsArray[i]
        if (fn === OPS.save) stack.push([ctm, fill, stroke])
        else if (fn === OPS.restore) {
            const saved = stack.pop()
            if (saved) [ctm, fill, stroke] = saved
        } else if (fn === OPS.transform) ctm = multiply(ctm, args)
        else if (fn === OPS.paintFormXObjectBegin) {
            stack.push([ctm, fill, stroke])
            if (args && args[0]) ctm = multiply(ctm, args[0])
        } else if (fn === OPS.paintFormXObjectEnd) {
            const saved = stack.pop()
            if (saved) [ctm, fill, stroke] = saved
        } else if (fn === OPS.setFillRGBColor) fill = args[0]
        else if (fn === OPS.setStrokeRGBColor) stroke = args[0]
        else if (fn === OPS.setFillGray) fill = grayColor(args[0])
        else if (fn === OPS.setStrokeGray) stroke = grayColor(args[0])
        else if (fn === OPS.setFillColorN || fn === OPS.setFillColorSpace || fn === OPS.setFillTransparent) fill = null
        else if (fn === OPS.setStrokeColorN || fn === OPS.setStrokeColorSpace || fn === OPS.setStrokeTransparent) stroke = null
        else if (fn === OPS.constructPath) {
            const paint = args[0]
            const doStroke = strokePaints.has(paint)
            const doFill = fillPaints.has(paint)
            if (!doStroke && !doFill) continue
            for (const sub of subpaths(args[1][0], ctm)) {
                if (doFill && fill && !isWhite(fill)) {
                    const rect = axisRectangle(sub)
                    if (rect) {
                        const w = rect.x1 - rect.x0
                        const h = rect.y1 - rect.y0
                        if (h <= MAX_FILLED_RULE_THICKNESS && w >= MIN_RULE_LENGTH) horizontal.push({ y: (rect.y0 + rect.y1) / 2, x1: rect.x0, x2: rect.x1 })
                        else if (w <= MAX_FILLED_RULE_THICKNESS && h >= MIN_RULE_LENGTH) vertical.push({ x: (rect.x0 + rect.x1) / 2, y1: rect.y0, y2: rect.y1 })
                        else rects.push({ ...rect, fill })
                    }
                }
                if (doStroke && stroke && !isWhite(stroke) && !sub.curved) {
                    const pts = sub.points
                    for (let k = 0; k + 1 < pts.length; k++) addSegment(pts[k], pts[k + 1])
                    if (sub.closed && pts.length > 2) addSegment(pts[pts.length - 1], pts[0])
                }
            }
        }
    }
    return { horizontal, vertical, rects }
}
