const ARABIC = /\p{Script=Arabic}/u

const MIN_LINE_LENGTH = 8
const RULE_MERGE_TOLERANCE = 1.6
const RULE_MERGE_GAP = 3
const JOIN_TOLERANCE = 3
const LATTICE_CLUSTER = 2.5
const MAX_LATTICE_COLUMNS = 40
const MAX_LATTICE_ROWS = 120
const MAX_RULES = 1500
const BOOKTABS_MIN_RULE = 80
const BOOKTABS_X_TOLERANCE = 5
const BOOKTABS_MAX_SPAN = 450
const BOOKTABS_MAX_RULES = 8
const MIN_COVERAGE = 0.5
const FRAME_SHARE = 0.97
const CHROME_BAND = 0.07
const HEADER_MERGE_MAX_GAP = 16
const HEADER_MERGE_MIN_GAP = -4
const COLUMN_MATCH = 10

const PRIORITY = { grid: 0, booktabs: 1, filled: 2, whitespace: 3 }

const hasLetter = (s) => /\p{L}/u.test(s)

const median = (values, fallback) => {
    if (!values.length) return fallback
    const sorted = [...values].sort((a, b) => a - b)
    return sorted[Math.floor(sorted.length / 2)]
}

const overlap = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0))

class DisjointSet {
    constructor(size) {
        this.parent = Array.from({ length: size }, (_, i) => i)
    }

    find(x) {
        while (this.parent[x] !== x) {
            this.parent[x] = this.parent[this.parent[x]]
            x = this.parent[x]
        }
        return x
    }

    union(a, b) {
        this.parent[this.find(a)] = this.find(b)
    }
}

function clusterValues(values, tolerance) {
    const clusters = []
    for (const v of [...values].sort((a, b) => a - b)) {
        const last = clusters[clusters.length - 1]
        if (last && v - last.max <= tolerance) {
            last.values.push(v)
            last.max = v
        } else clusters.push({ values: [v], max: v })
    }
    return clusters.map((c) => c.values.reduce((a, b) => a + b, 0) / c.values.length)
}

export function textModel(items, pageHeight) {
    const out = []
    for (const it of items) {
        if (!it.str || !it.str.trim()) continue
        const t = it.transform
        const h = Math.hypot(t[2], t[3])
        if (h < 2) continue
        const w = it.width || 0
        const x0 = Math.min(t[4], t[4] + w)
        const x1 = Math.max(t[4], t[4] + w)
        const y = pageHeight - t[5]
        out.push({
            str: it.str,
            x0,
            x1,
            y,
            top: y - h * 0.85,
            bottom: y + h * 0.2,
            h,
            horizontal: Math.abs(t[1]) < 0.25 * Math.abs(t[0]),
            arabic: ARABIC.test(it.str),
            mono: !!it.mono,
            cx: (x0 + x1) / 2,
            cy: y - h * 0.3,
        })
    }
    return out
}

export function groupLines(items) {
    const sorted = items.filter((i) => i.horizontal).sort((a, b) => a.y - b.y || a.x0 - b.x0)
    const lines = []
    for (const it of sorted) {
        const line = lines.find((l) => Math.abs(l.y - it.y) <= Math.max(1.2, 0.35 * Math.min(l.h, it.h)))
        if (line) {
            line.items.push(it)
            line.h = Math.max(line.h, it.h)
        } else lines.push({ y: it.y, h: it.h, items: [it] })
    }
    for (const l of lines) {
        l.items.sort((a, b) => a.x0 - b.x0)
        l.top = Math.min(...l.items.map((i) => i.top))
        l.bottom = Math.max(...l.items.map((i) => i.bottom))
    }
    return lines.sort((a, b) => a.y - b.y)
}

const lineString = (items) => {
    const ordered = items.some((i) => i.arabic) ? [...items].reverse() : items
    return ordered.map((i) => i.str).join(' ')
}

function segmentLine(line, gutterFactor = 0.9) {
    const cells = []
    let current = null
    const threshold = Math.max(7, line.h * gutterFactor)
    for (const it of line.items) {
        if (current && it.x0 - current.x1 <= threshold) {
            current.items.push(it)
            current.x1 = Math.max(current.x1, it.x1)
        } else {
            current = { x0: it.x0, x1: it.x1, items: [it] }
            cells.push(current)
        }
    }
    for (const c of cells) {
        c.text = lineString(c.items).replace(/\s+/g, ' ').trim()
        c.arabic = c.items.some((i) => i.arabic)
        c.mono = c.items.every((i) => i.mono)
    }
    return cells
}

export function cellContent(items, cell) {
    const inside = items.filter((i) => i.cx >= cell.x0 && i.cx <= cell.x1 && i.cy >= cell.y0 && i.cy <= cell.y1)
    const arabic = inside.filter((i) => i.arabic).length > inside.length / 2
    const text = groupLines(inside)
        .map((l) => (arabic ? [...l.items].reverse() : l.items).map((i) => i.str).join(' '))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
    return { text, arabic }
}

function finalizeTable(signal, grid, items, extra = {}) {
    const cells = grid.map((c) => {
        const content = c.text !== undefined ? { text: c.text, arabic: c.arabic } : cellContent(items, c)
        return { x0: c.x0, y0: c.y0, x1: c.x1, y1: c.y1, row: c.row, col: c.col, text: content.text, arabic: content.arabic }
    })
    const lettered = cells.filter((c) => hasLetter(c.text))
    const rtl = lettered.length > 0 && lettered.filter((c) => c.arabic).length > lettered.length / 2
    return {
        signal,
        rtl,
        cells,
        bbox: {
            x0: Math.min(...cells.map((c) => c.x0)),
            x1: Math.max(...cells.map((c) => c.x1)),
            y0: Math.min(...cells.map((c) => c.y0)),
            y1: Math.max(...cells.map((c) => c.y1)),
        },
        rows: new Set(cells.map((c) => c.row)).size,
        cols: new Set(cells.map((c) => c.col)).size,
        ...extra,
    }
}

function mergeRules(list, key, from, to) {
    const sorted = [...list].sort((p, q) => p[key] - q[key])
    const groups = []
    for (const rule of sorted) {
        const group = groups.find((g) => Math.abs(g.key - rule[key]) <= RULE_MERGE_TOLERANCE)
        if (group) {
            group.items.push(rule)
            group.key = (group.key * (group.items.length - 1) + rule[key]) / group.items.length
        } else groups.push({ key: rule[key], items: [rule] })
    }
    const out = []
    for (const group of groups) {
        let current = null
        for (const rule of group.items.sort((p, q) => p[from] - q[from])) {
            if (current && rule[from] <= current[to] + RULE_MERGE_GAP) current[to] = Math.max(current[to], rule[to])
            else {
                if (current) out.push(current)
                current = { [key]: group.key, [from]: rule[from], [to]: rule[to] }
            }
        }
        if (current) out.push(current)
    }
    return out
}

function booktabsTables(horizontal, items) {
    const out = []
    const long = horizontal.filter((l) => l.x2 - l.x1 >= BOOKTABS_MIN_RULE).sort((a, b) => a.y - b.y)
    const groups = []
    for (const rule of long) {
        const group = groups.find((g) => Math.abs(g.x1 - rule.x1) <= BOOKTABS_X_TOLERANCE
            && Math.abs(g.x2 - rule.x2) <= BOOKTABS_X_TOLERANCE
            && rule.y - g.rules[g.rules.length - 1].y <= BOOKTABS_MAX_SPAN)
        if (group) group.rules.push(rule)
        else groups.push({ x1: rule.x1, x2: rule.x2, rules: [rule] })
    }
    for (const group of groups) {
        if (group.rules.length < 2 || group.rules.length > BOOKTABS_MAX_RULES) continue
        const top = group.rules[0].y
        const bottom = group.rules[group.rules.length - 1].y
        const width = group.x2 - group.x1
        const usable = items.filter((i) => i.horizontal && i.cx >= group.x1 - 2 && i.cx <= group.x2 + 2 && i.cy >= top && i.cy <= bottom
            && i.x1 - i.x0 < 0.7 * width)
        const lines = groupLines(usable)
        if (lines.length < 3) continue
        if (group.rules.length === 2 && lines.length < 4) continue
        const spans = [...usable].sort((a, b) => a.x0 - b.x0).reduce((acc, i) => {
            const last = acc[acc.length - 1]
            if (last && i.x0 <= last.x1 + 9) last.x1 = Math.max(last.x1, i.x1)
            else acc.push({ x0: i.x0, x1: i.x1 })
            return acc
        }, [])
        if (spans.length < 2 || spans.length > 14) continue
        const columnOf = (i) => spans.findIndex((sp) => i.cx >= sp.x0 - 1 && i.cx <= sp.x1 + 1)
        const arabic = usable.filter((i) => i.arabic).length > usable.length / 2
        const firstColumn = arabic ? spans.length - 1 : 0
        const anchors = lines.filter((l) => l.items.some((i) => columnOf(i) === firstColumn))
        if (anchors.length < 2) continue
        const anchorOf = (l) => anchors.reduce((best, a) => (Math.abs(a.y - l.y) < Math.abs(best.y - l.y) ? a : best))
        const rows = new Map(anchors.map((a, index) => [a, { index, top: a.top, bottom: a.bottom, items: [] }]))
        for (const l of lines) {
            const row = rows.get(anchorOf(l))
            row.top = Math.min(row.top, l.top)
            row.bottom = Math.max(row.bottom, l.bottom)
            row.items.push(...l.items)
        }
        const bounds = spans.map((sp, k) => ({
            x0: k === 0 ? sp.x0 - 2 : (spans[k - 1].x1 + sp.x0) / 2,
            x1: k === spans.length - 1 ? sp.x1 + 2 : (sp.x1 + spans[k + 1].x0) / 2,
        }))
        const grid = []
        for (const row of rows.values()) {
            for (let k = 0; k < spans.length; k++) {
                const inColumn = row.items.filter((i) => columnOf(i) === k).sort((a, b) => a.cy - b.cy || a.x0 - b.x0)
                grid.push({
                    x0: bounds[k].x0,
                    x1: bounds[k].x1,
                    y0: row.top - 1,
                    y1: row.bottom + 1,
                    row: row.index,
                    col: k,
                    text: inColumn.map((i) => i.str).join(' ').replace(/\s+/g, ' ').trim(),
                    arabic: inColumn.some((i) => i.arabic),
                })
            }
        }
        if (spans.length === 2) {
            const lastColumn = arabic ? 0 : 1
            const numeric = [...rows.values()].filter((row) => /^[\d.ivxlc]{1,6}$/i.test(grid.find((c) => c.row === row.index && c.col === lastColumn).text)).length
            if (numeric >= 0.8 * rows.size) continue
        }
        out.push(finalizeTable('booktabs', grid, []))
    }
    return out
}

function gridTables(horizontal, vertical, items, width, height) {
    const total = horizontal.length + vertical.length
    if (total < 4 || total > MAX_RULES) return []
    const set = new DisjointSet(total)
    for (let i = 0; i < horizontal.length; i++) {
        for (let j = 0; j < vertical.length; j++) {
            const h = horizontal[i]
            const v = vertical[j]
            if (v.x >= h.x1 - JOIN_TOLERANCE && v.x <= h.x2 + JOIN_TOLERANCE && h.y >= v.y1 - JOIN_TOLERANCE && h.y <= v.y2 + JOIN_TOLERANCE) set.union(i, horizontal.length + j)
        }
    }
    const components = new Map()
    for (let i = 0; i < total; i++) {
        const root = set.find(i)
        if (!components.has(root)) components.set(root, { h: [], v: [] })
        if (i < horizontal.length) components.get(root).h.push(horizontal[i])
        else components.get(root).v.push(vertical[i - horizontal.length])
    }
    const out = []
    for (const comp of components.values()) {
        if (comp.h.length < 2 || comp.v.length < 2) continue
        const xs = clusterValues(comp.v.map((l) => l.x), LATTICE_CLUSTER)
        const ys = clusterValues(comp.h.map((l) => l.y), LATTICE_CLUSTER)
        if (xs.length < 2 || ys.length < 2 || xs.length > MAX_LATTICE_COLUMNS || ys.length > MAX_LATTICE_ROWS) continue
        const rows = ys.length - 1
        const cols = xs.length - 1
        const horizontalCover = (row, col) => {
            let covered = 0
            for (const l of comp.h) if (Math.abs(l.y - ys[row]) <= JOIN_TOLERANCE) covered += overlap(l.x1, l.x2, xs[col], xs[col + 1])
            return covered / (xs[col + 1] - xs[col])
        }
        const verticalCover = (col, row) => {
            let covered = 0
            for (const l of comp.v) if (Math.abs(l.x - xs[col]) <= JOIN_TOLERANCE) covered += overlap(l.y1, l.y2, ys[row], ys[row + 1])
            return covered / (ys[row + 1] - ys[row])
        }
        const merged = new DisjointSet(rows * cols)
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                if (col + 1 < cols && verticalCover(col + 1, row) < MIN_COVERAGE) merged.union(row * cols + col, row * cols + col + 1)
                if (row + 1 < rows && horizontalCover(row + 1, col) < MIN_COVERAGE) merged.union(row * cols + col, (row + 1) * cols + col)
            }
        }
        const regions = new Map()
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const root = merged.find(row * cols + col)
                if (!regions.has(root)) regions.set(root, { x0: xs[col], x1: xs[col + 1], y0: ys[row], y1: ys[row + 1], row, col })
                const region = regions.get(root)
                region.x0 = Math.min(region.x0, xs[col])
                region.x1 = Math.max(region.x1, xs[col + 1])
                region.y0 = Math.min(region.y0, ys[row])
                region.y1 = Math.max(region.y1, ys[row + 1])
                region.row = Math.min(region.row, row)
                region.col = Math.min(region.col, col)
            }
        }
        const grid = [...regions.values()]
        if (grid.length < 4) continue
        const table = finalizeTable('grid', grid, items)
        const filled = table.cells.filter((c) => c.text).length
        if (filled < 3) continue
        if (table.cells.filter((c) => (c.text.match(/[\p{L}\p{N}]/gu) || []).length >= 2).length < 3) continue
        if (table.cells.length > 12 && filled < 0.3 * table.cells.length) continue
        if ((table.bbox.x1 - table.bbox.x0) > FRAME_SHARE * width && (table.bbox.y1 - table.bbox.y0) > FRAME_SHARE * height) continue
        if (table.rows < 2 || table.cols < 2) continue
        out.push(table)
    }
    return out
}

function filledTables(rectsRaw, items, width, height) {
    const out = []
    let rects = rectsRaw.filter((r) => {
        const w = r.x1 - r.x0
        const h = r.y1 - r.y0
        return w >= 12 && h >= 7 && h <= 160 && w * h < 0.35 * width * height
    })
    if (rects.length < 3 || rects.length > 600) return out
    rects = rects.filter((r) => items.some((i) => i.cx >= r.x0 && i.cx <= r.x1 && i.cy >= r.y0 && i.cy <= r.y1))
    rects = rects.filter((r, idx) => {
        const inner = rects.filter((o, k) => k !== idx
            && o.x0 >= r.x0 - 1 && o.x1 <= r.x1 + 1 && o.y0 >= r.y0 - 1 && o.y1 <= r.y1 + 1
            && (o.x1 - o.x0) * (o.y1 - o.y0) < 0.9 * (r.x1 - r.x0) * (r.y1 - r.y0))
        return inner.length < 2
    })
    if (rects.length < 3) return out
    const set = new DisjointSet(rects.length)
    for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
            const a = rects[i]
            const b = rects[j]
            const yOverlap = overlap(a.y0, a.y1, b.y0, b.y1)
            const xOverlap = overlap(a.x0, a.x1, b.x0, b.x1)
            const minHeight = Math.min(a.y1 - a.y0, b.y1 - b.y0)
            const minWidth = Math.min(a.x1 - a.x0, b.x1 - b.x0)
            const xGap = Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1)
            const yGap = Math.max(a.y0, b.y0) - Math.min(a.y1, b.y1)
            if (yOverlap >= 0.6 * minHeight && xGap <= 8 && xGap >= -2) set.union(i, j)
            else if (xOverlap >= 0.6 * minWidth && yGap <= 8 && yGap >= -2) set.union(i, j)
        }
    }
    const components = new Map()
    rects.forEach((r, i) => {
        const root = set.find(i)
        if (!components.has(root)) components.set(root, [])
        components.get(root).push(r)
    })
    for (const comp of components.values()) {
        if (comp.length < 3) continue
        const rowCentres = clusterValues(comp.map((r) => (r.y0 + r.y1) / 2), 4)
        const startColumns = clusterValues(comp.map((r) => r.x0), 4)
        const rowCount = rowCentres.length
        const colCount = startColumns.length
        let grid = null
        if (colCount >= 2 && rowCount >= 1 && (colCount >= 3 || rowCount >= 2)) {
            grid = comp.map((r) => ({
                ...r,
                row: rowCentres.findIndex((y) => Math.abs(y - (r.y0 + r.y1) / 2) <= 4),
                col: startColumns.findIndex((x) => Math.abs(x - r.x0) <= 4),
            }))
        } else if (colCount === 1 && rowCount >= 3) {
            grid = []
            let segmented = 0
            comp.sort((a, b) => a.y0 - b.y0).forEach((r, rowIndex) => {
                const inside = items.filter((i) => i.horizontal && i.cx >= r.x0 && i.cx <= r.x1 && i.cy >= r.y0 && i.cy <= r.y1)
                const lines = groupLines(inside)
                const segments = lines.length ? segmentLine(lines[0]) : []
                if (segments.length >= 2 && !segments.every((s) => s.mono)) segmented++
                segments.forEach((s, col) => grid.push({ x0: s.x0 - 2, x1: s.x1 + 2, y0: r.y0, y1: r.y1, row: rowIndex, col, text: s.text, arabic: s.arabic }))
            })
            if (segmented < 0.6 * comp.length || segmented < 3) grid = null
        }
        if (!grid || grid.length < 3) continue
        out.push(finalizeTable('filled', grid, items))
    }
    return out
}

function whitespaceTables(lines, width) {
    const out = []
    const rowsInfo = lines.map((line) => ({ line, cells: segmentLine(line) }))
    let i = 0
    while (i < rowsInfo.length) {
        if (rowsInfo[i].cells.length < 2) {
            i++
            continue
        }
        let j = i
        let singles = 0
        while (j + 1 < rowsInfo.length) {
            const next = rowsInfo[j + 1]
            const current = rowsInfo[j]
            if (next.line.top - current.line.bottom > Math.max(current.line.h, next.line.h) * 1.9) break
            if (next.line.h > current.line.h * 1.3 || next.line.h < current.line.h / 1.3) break
            if (next.cells.length >= 2) {
                j++
                continue
            }
            if (next.cells.length === 1 && singles < 1 && j + 2 < rowsInfo.length && rowsInfo[j + 2].cells.length >= 2) {
                j++
                singles++
                continue
            }
            break
        }
        const run = rowsInfo.slice(i, j + 1)
        const multi = run.filter((r) => r.cells.length >= 2)
        if (multi.length >= 3) {
            const table = alignedRun(run, multi, width)
            if (table) out.push(table)
        }
        i = Math.max(j + 1, i + 1)
    }
    return out
}

function alignedRun(run, multi, width) {
    const allCells = multi.flatMap((r) => r.cells)
    const lengths = allCells.map((c) => c.text.length).sort((a, b) => a - b)
    const medianLength = lengths[Math.floor(lengths.length / 2)]
    if (medianLength > 34) return null
    if (allCells.filter((c) => c.mono).length > 0.5 * allCells.length) return null
    const words = allCells.map((c) => c.text.split(/\s+/).length).sort((a, b) => a - b)
    if (words[Math.floor(words.length / 2)] >= 5) return null
    if (allCells.filter((c) => /^[a-z]/.test(c.text)).length >= 0.3 * allCells.length) return null
    if (Math.max(...allCells.map((c) => c.x1 - c.x0)) > 0.46 * width) return null
    const candidates = [
        { mode: 'start', values: allCells.map((c) => c.x0), tolerance: 4 },
        { mode: 'end', values: allCells.map((c) => c.x1), tolerance: 4 },
        { mode: 'centre', values: allCells.map((c) => (c.x0 + c.x1) / 2), tolerance: 6 },
    ]
    let best = null
    for (const cand of candidates) {
        const clusters = []
        for (const v of [...cand.values].sort((a, b) => a - b)) {
            const last = clusters[clusters.length - 1]
            if (last && v - last.high <= cand.tolerance) {
                last.values.push(v)
                last.high = v
            } else clusters.push({ values: [v], high: v })
        }
        const strong = clusters.filter((c) => c.values.length >= Math.max(3, 0.6 * multi.length))
        if (strong.length >= 2 && (!best || strong.length > best.strong.length || (cand.mode === 'start' && strong.length === best.strong.length))) best = { mode: cand.mode, strong, tolerance: cand.tolerance }
    }
    if (!best) return null
    const centres = best.strong.map((c) => c.values.reduce((a, b) => a + b, 0) / c.values.length).sort((a, b) => a - b)
    const keyOf = (c) => (best.mode === 'start' ? c.x0 : best.mode === 'end' ? c.x1 : (c.x0 + c.x1) / 2)
    const columnIndex = (c) => {
        const key = keyOf(c)
        let index = -1
        let distance = Infinity
        centres.forEach((x, k) => {
            const d = Math.abs(x - key)
            if (d < distance) {
                distance = d
                index = k
            }
        })
        return distance <= best.tolerance * 2.5 ? index : -1
    }
    const consistent = multi.filter((r) => new Set(r.cells.map(columnIndex).filter((k) => k >= 0)).size >= 2).length
    if (consistent < Math.max(3, 0.7 * multi.length)) return null
    const columnCount = centres.length
    const lastNumeric = multi.every((r) => /^[\divxlc.٠-٩]{1,6}$/i.test(r.cells[r.cells.length - 1].text))
    const firstLength = multi.map((r) => r.cells[0].text.length).reduce((a, b) => a + b, 0) / multi.length
    if (columnCount === 2 && lastNumeric && firstLength > 22) return null
    if (columnCount === 2 && Math.min(...allCells.map((c) => c.x1 - c.x0)) > 0.2 * width && medianLength > 24) return null
    const boundaries = []
    for (let k = 0; k <= columnCount; k++) {
        if (k === 0) boundaries.push(Math.min(...allCells.map((c) => c.x0)) - 2)
        else if (k === columnCount) boundaries.push(Math.max(...allCells.map((c) => c.x1)) + 2)
        else {
            const left = allCells.filter((c) => columnIndex(c) === k - 1).map((c) => c.x1)
            const right = allCells.filter((c) => columnIndex(c) === k).map((c) => c.x0)
            boundaries.push((Math.max(...left) + Math.min(...right)) / 2)
        }
    }
    const rows = []
    for (const r of run) {
        if (r.cells.length >= 2) {
            rows.push({ top: r.line.top, bottom: r.line.bottom, cells: r.cells.map((c) => ({ ...c, columnIndex: columnIndex(c) })).filter((c) => c.columnIndex >= 0) })
        } else if (rows.length) {
            const previous = rows[rows.length - 1]
            const cell = r.cells[0]
            const k = columnIndex(cell)
            previous.bottom = Math.max(previous.bottom, r.line.bottom)
            if (k >= 0) {
                const existing = previous.cells.find((x) => x.columnIndex === k)
                if (existing) existing.text += ' ' + cell.text
                else previous.cells.push({ ...cell, columnIndex: k })
            }
        }
    }
    const usedColumns = []
    for (let k = 0; k < columnCount; k++) if (rows.some((row) => row.cells.some((x) => x.columnIndex === k))) usedColumns.push(k)
    if (usedColumns.length < 2) return null
    const grid = []
    rows.forEach((row, rowIndex) => {
        usedColumns.forEach((k, col) => {
            const cell = row.cells.find((x) => x.columnIndex === k)
            grid.push({ x0: boundaries[k], x1: boundaries[k + 1], y0: row.top - 1, y1: row.bottom + 1, row: rowIndex, col, text: cell ? cell.text : '', arabic: cell ? cell.arabic : false })
        })
    })
    return finalizeTable('whitespace', grid, [])
}

function intersection(a, b) {
    const inter = overlap(a.x0, a.x1, b.x0, b.x1) * overlap(a.y0, a.y1, b.y0, b.y1)
    const areaA = (a.x1 - a.x0) * (a.y1 - a.y0)
    const areaB = (b.x1 - b.x0) * (b.y1 - b.y0)
    return { iou: inter / (areaA + areaB - inter + 1e-6), minShare: inter / (Math.min(areaA, areaB) + 1e-6), inter }
}

function dedupe(tables) {
    const kept = []
    for (const table of [...tables].sort((a, b) => PRIORITY[a.signal] - PRIORITY[b.signal])) {
        let duplicate = kept.find((k) => {
            const o = intersection(k.bbox, table.bbox)
            return o.iou > 0.35 || o.minShare > 0.7
        })
        if (!duplicate && table.signal === 'whitespace') {
            const area = (table.bbox.x1 - table.bbox.x0) * (table.bbox.y1 - table.bbox.y0)
            let covered = 0
            for (const k of kept) covered += intersection(k.bbox, table.bbox).inter
            if (covered >= 0.6 * area) duplicate = true
        }
        if (!duplicate) kept.push(table)
    }
    return kept
}

function mergeFilledHeaders(tables) {
    const consumed = new Set()
    for (const header of tables) {
        if (header.signal !== 'filled' || header.rows !== 1 || header.cols < 3) continue
        const body = tables.find((t) => t !== header && !consumed.has(t) && (t.signal === 'grid' || t.signal === 'booktabs')
            && t.bbox.y0 - header.bbox.y1 >= HEADER_MERGE_MIN_GAP && t.bbox.y0 - header.bbox.y1 <= HEADER_MERGE_MAX_GAP)
        if (!body) continue
        const bodyColumns = clusterValues(body.cells.map((c) => c.x0), COLUMN_MATCH)
        const headerColumns = header.cells.map((c) => c.x0)
        const matches = headerColumns.every((x) => bodyColumns.some((bx) => Math.abs(bx - x) <= COLUMN_MATCH))
            && bodyColumns.every((bx) => headerColumns.some((x) => Math.abs(bx - x) <= COLUMN_MATCH))
        if (!matches) continue
        const columnOf = (x) => bodyColumns.reduce((best, bx, k) => (Math.abs(bx - x) < Math.abs(bodyColumns[best] - x) ? k : best), 0)
        for (const cell of body.cells) cell.row += 1
        for (const cell of header.cells) {
            cell.row = 0
            cell.col = columnOf(cell.x0)
            body.cells.push(cell)
        }
        body.rows += 1
        body.bbox = {
            x0: Math.min(body.bbox.x0, header.bbox.x0),
            x1: Math.max(body.bbox.x1, header.bbox.x1),
            y0: Math.min(body.bbox.y0, header.bbox.y0),
            y1: Math.max(body.bbox.y1, header.bbox.y1),
        }
        body.filledHeader = true
        consumed.add(header)
    }
    return tables.filter((t) => !consumed.has(t))
}

export function pageMetrics(model, height) {
    const body = model.filter((i) => i.horizontal && i.top > CHROME_BAND * height && i.bottom < (1 - CHROME_BAND) * height)
    return {
        lineHeight: median(body.map((i) => i.h), 10),
        contentTop: body.length ? Math.min(...body.map((i) => i.top)) : 0,
        contentBottom: body.length ? Math.max(...body.map((i) => i.bottom)) : height,
    }
}

export function detectTables({ items, graphics, width, height }) {
    const model = textModel(items, height)
    const tables = []
    if (graphics) {
        const horizontal = mergeRules(graphics.horizontal.filter((l) => l.x2 - l.x1 >= MIN_LINE_LENGTH), 'y', 'x1', 'x2')
        const vertical = mergeRules(graphics.vertical.filter((l) => l.y2 - l.y1 >= MIN_LINE_LENGTH), 'x', 'y1', 'y2')
        if (horizontal.length >= 2 && horizontal.length < 400) tables.push(...booktabsTables(horizontal, model))
        tables.push(...gridTables(horizontal, vertical, model, width, height))
        tables.push(...filledTables(graphics.rects, model, width, height))
    }
    tables.push(...whitespaceTables(groupLines(model), width))
    return { tables: mergeFilledHeaders(dedupe(tables)), model, metrics: pageMetrics(model, height) }
}
