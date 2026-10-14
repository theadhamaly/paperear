import assert from 'node:assert/strict'
import { detectTables } from './tableDetect.js'
import { graphicsFromOperatorList } from './tableGraphics.js'

const W = 600
const H = 800

const item = (str, x, y, w = 40, h = 10) => ({ str, transform: [h, 0, 0, h, x, y], width: w, height: h })
const hrule = (y, x1, x2) => ({ y: H - y, x1, x2 })
const vrule = (x, y1, y2) => ({ x, y1: H - y2, y2: H - y1 })
const fillBox = (x0, y0, x1, y1) => ({ x0, x1, y0: H - y1, y1: H - y0, fill: '#cccccc' })
const detect = (items, graphics) => detectTables({ items, graphics, width: W, height: H })

const latticeRules = (xs, ys, skip = () => false) => {
    const graphics = { horizontal: [], vertical: [], rects: [] }
    for (const y of ys) graphics.horizontal.push(hrule(y, xs[0], xs[xs.length - 1]))
    xs.forEach((x, k) => {
        const rows = ys.slice(0, -1).map((y, j) => ({ top: ys[j], bottom: ys[j + 1] }))
        const live = rows.filter((_, j) => !skip(k, j))
        for (const r of live) graphics.vertical.push(vrule(x, r.bottom, r.top))
    })
    return graphics
}

const gridWords = [
    ['Alpha', 'Beta', 'Gamma'],
    ['Delta', 'Eta', 'Theta'],
    ['Iota', 'Kappa', 'Lambda'],
    ['Sigma', 'Omega', 'Zeta'],
]

{
    const xs = [100, 250, 400, 550]
    const ys = [700, 660, 620, 580, 540]
    const graphics = latticeRules(xs, ys, (k, j) => k === 2 && j === 0)
    const items = []
    gridWords.forEach((row, j) => row.forEach((word, k) => {
        if (j === 0 && k === 2) return
        items.push(item(word, xs[k] + 10, ys[j + 1] + 15))
    }))
    const { tables } = detect(items, graphics)
    const grid = tables.filter((t) => t.signal === 'grid')
    assert.equal(grid.length, 1, 'a ruled lattice is found')
    assert.equal(grid[0].cells.length, 11, 'cells merge where the shared border is missing')
    const merged = grid[0].cells.find((c) => c.x1 - c.x0 > 250)
    assert.ok(merged && merged.row === 0 && merged.col === 1, 'the merged cell spans two columns in the top row')
    assert.equal(merged.text, 'Beta', 'the merged cell keeps its own text')
}

{
    const xs = [100, 250, 400, 550]
    const ys = [700, 660, 620, 580]
    const items = [item('Alpha', 110, 675), item('Beta', 260, 675)]
    const { tables } = detect(items, latticeRules(xs, ys))
    assert.equal(tables.filter((t) => t.signal === 'grid').length, 0, 'a lattice with too little text is not a table')
}

{
    const rules = { horizontal: [hrule(700, 100, 500), hrule(660, 100, 500), hrule(520, 100, 500)], vertical: [], rects: [] }
    const rows = [
        ['Name', 'Count', 'Notes'],
        ['Ruby', '3', 'Red'],
        ['Opal', '5', 'Blue'],
        ['Jade', '7', 'Green'],
        ['Onyx', '9', 'Black'],
    ]
    const ys = [678, 640, 610, 580, 550]
    const items = []
    rows.forEach((row, j) => row.forEach((word, k) => items.push(item(word, [110, 250, 400][k], ys[j], 30))))
    const { tables } = detect(items, rules)
    const booktabs = tables.filter((t) => t.signal === 'booktabs')
    assert.equal(booktabs.length, 1, 'long rules of equal extent frame a booktabs table')
    assert.equal(booktabs[0].cells.length, 15, 'columns come from the gaps between the text and rows from the first column')
    assert.equal(tables.filter((t) => t.signal === 'whitespace').length, 0, 'the aligned text under the rules is not counted twice')
}

{
    const xs = [100, 250, 400, 550]
    const ys = [694, 654, 614, 574]
    const graphics = latticeRules(xs, ys)
    graphics.rects.push(fillBox(100, 700, 250, 740), fillBox(250, 700, 400, 740), fillBox(400, 700, 550, 740))
    const items = [item('Head One', 110, 715, 60), item('Head Two', 260, 715, 60), item('Head Three', 410, 715, 60)]
    const body = [['Apple', 'Pear', 'Plum'], ['Lime', 'Fig', 'Date'], ['Kiwi', 'Peach', 'Mango']]
    body.forEach((row, j) => row.forEach((word, k) => items.push(item(word, xs[k] + 10, ys[j + 1] + 15))))
    const { tables } = detect(items, graphics)
    assert.equal(tables.length, 1, 'a filled header row joins the ruled body below it')
    assert.equal(tables[0].filledHeader, true, 'the merged table remembers its filled header')
    assert.equal(tables[0].rows, 4, 'the header becomes the first row')
    assert.equal(tables[0].cells.filter((c) => c.row === 0).map((c) => c.text).join('|'), 'Head One|Head Two|Head Three', 'the header cells line up with the body columns')
}

{
    const graphics = { horizontal: [], vertical: [], rects: [fillBox(100, 700, 250, 740), fillBox(250, 700, 400, 740), fillBox(400, 700, 550, 740)] }
    const items = [item('Head One', 110, 715, 60), item('Head Two', 260, 715, 60), item('Head Three', 410, 715, 60)]
    const { tables } = detect(items, graphics)
    assert.equal(tables.length, 1, 'a header-only row of three filled cells counts as a table')
    assert.equal(tables[0].signal, 'filled')
}

{
    const graphics = latticeRules([2, 300, 598], [798, 400, 2])
    const items = [item('Alpha', 20, 600), item('Beta', 320, 600), item('Gamma', 20, 200), item('Delta', 320, 200)]
    assert.equal(detect(items, graphics).tables.filter((t) => t.signal === 'grid').length, 0, 'a frame around the whole page is not a table')
}

{
    const items = []
    gridWords.forEach((row, j) => row.forEach((word, k) => items.push(item(word, [100, 250, 400][k], 700 - j * 20, 40))))
    const { tables } = detect(items, { horizontal: [], vertical: [], rects: [] })
    assert.equal(tables.length, 1, 'text aligned in columns is still detected')
    assert.equal(tables[0].signal, 'whitespace', 'and labelled as whitespace aligned')
}

{
    const OPS = { save: 1, restore: 2, transform: 3, paintFormXObjectBegin: 4, paintFormXObjectEnd: 5, setFillRGBColor: 6, setStrokeRGBColor: 7, constructPath: 16, stroke: 17, fill: 19 }
    const line = (x1, y1, x2, y2) => ({ paint: OPS.stroke, data: [0, x1, y1, 1, x2, y2] })
    const opList = {
        fnArray: [OPS.setStrokeRGBColor, OPS.save, OPS.transform, OPS.constructPath, OPS.constructPath, OPS.restore],
        argsArray: [['#000000'], [], [2, 0, 0, 2, 10, 20], [line(0, 0, 50, 0).paint, [line(0, 0, 50, 0).data]], [line(0, 0, 0, 30).paint, [line(0, 0, 0, 30).data]], []],
    }
    const { horizontal, vertical } = graphicsFromOperatorList(opList, OPS, 800)
    assert.deepEqual(horizontal.map((l) => [l.y, l.x1, l.x2]), [[780, 10, 110]], 'rules follow the current transform and sit in top-down page space')
    assert.deepEqual(vertical.map((l) => [l.x, l.y1, l.y2]), [[10, 720, 780]], 'vertical rules do too')
}

console.log('tableDetect ok')
