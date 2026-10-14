const BASELINE_LIFT = 0.3

export const itemCentre = (item) => ({ x: item.x + item.w / 2, y: item.y + item.h * BASELINE_LIFT })

const inside = (cell, point) => point.x >= cell.x0 && point.x <= cell.x1 && point.y >= cell.y0 && point.y <= cell.y1

export function cellReadingOrder(slots, rtl) {
    return [...slots].sort((a, b) => a.cell.row - b.cell.row || (rtl ? b.cell.col - a.cell.col : a.cell.col - b.cell.col))
}

export function splitByTables(items, tables) {
    const groups = tables.map((table) => ({ table, cells: table.cells.map((cell) => ({ cell, items: [] })) }))
    const rest = []
    for (const item of items) {
        const point = itemCentre(item)
        let placed = false
        for (const group of groups) {
            const slot = group.cells.find((c) => inside(c.cell, point))
            if (slot) {
                slot.items.push(item)
                placed = true
                break
            }
        }
        if (!placed) rest.push(item)
    }
    return { rest, groups }
}

export function tableAnchor(group) {
    return Math.max(...group.table.cells.map((c) => c.y1))
}
