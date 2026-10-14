import assert from 'node:assert/strict'
import { withTablePages, carryAnnotations } from './tablePages.js'
import { buildBlockModel, alignBoxMap } from './blockModel.js'
import { blockCounts, layerItemsForPage, pageFromItems, preparedItems } from './pageModel.js'

const W = 600
const H = 800
const OPS = {
    save: 1, restore: 2, transform: 3, paintFormXObjectBegin: 4, paintFormXObjectEnd: 5, setFillRGBColor: 6, setStrokeRGBColor: 7,
    constructPath: 16, stroke: 17, fill: 19,
}

const item = (str, x, y, w = 60, h = 10) => ({ str, transform: [h, 0, 0, h, x, y], width: w, height: h, fontName: 'f', dir: 'ltr' })

const ops = () => ({ fnArray: [], argsArray: [] })
const rectangle = (list, x, y, w, h) => {
    list.fnArray.push(OPS.constructPath)
    list.argsArray.push([OPS.fill, [[0, x, y, 1, x + w, y, 1, x + w, y + h, 1, x, y + h, 4]]])
}
const line = (list, x1, y1, x2, y2) => {
    list.fnArray.push(OPS.constructPath)
    list.argsArray.push([OPS.stroke, [[0, x1, y1, 1, x2, y2]]])
}
const colour = (list, fill) => {
    list.fnArray.push(OPS.setFillRGBColor, OPS.setStrokeRGBColor)
    list.argsArray.push([fill], ['#000000'])
}

const fakePage = (items, list) => ({
    view: [0, 0, W, H],
    getTextContent: async () => ({ items, styles: {} }),
    getOperatorList: async () => list,
})
const fakePdf = (pages) => ({ numPages: pages.length, getPage: async (n) => pages[n - 1] })

const COLUMNS = [100, 250, 400, 550]
const HEADER_CUT = [
    ['Feature: Something', 'Benefit: What the', 'Value: How this maps to a goal the'],
    ['your product does or has', 'feature enables for customers', 'customer is trying to achieve'],
]
const BODY = [
    ['Round lamp', 'Bright light', 'Fits every room in the house.'],
    ['Square desk', 'Strong frame', 'Holds a heavy monitor.'],
]

const pageOne = () => {
    const list = ops()
    colour(list, '#cccccc')
    COLUMNS.slice(0, 3).forEach((x) => rectangle(list, x, 80, 150, 40))
    const items = [
        item('An introduction line before the table starts here.', 100, 700, 350),
        item('A second introduction line with more words in it.', 100, 686, 350),
        item('A third introduction line that fills the page.', 100, 672, 350),
        ...HEADER_CUT[0].map((text, k) => item(text, COLUMNS[k] + 6, 95, 138)),
    ]
    return fakePage(items, list)
}

const pageTwo = () => {
    const list = ops()
    colour(list, '#cccccc')
    COLUMNS.slice(0, 3).forEach((x) => rectangle(list, x, 690, 150, 40))
    colour(list, '#cccccc')
    const ys = [684, 644, 604]
    for (const y of ys) line(list, COLUMNS[0], y, COLUMNS[3], y)
    for (const x of COLUMNS) line(list, x, ys[ys.length - 1], x, ys[0])
    const items = HEADER_CUT[1].map((text, k) => item(text, COLUMNS[k] + 6, 705, 138))
    BODY.forEach((row, j) => row.forEach((text, k) => items.push(item(text, COLUMNS[k] + 6, ys[j + 1] + 15, 138))))
    items.push(item('Closing prose follows the table on this page.', 100, 400, 350))
    return fakePage(items, list)
}

const entry = (pageNum, text = 'x'.repeat(200)) => ({ pageNum, text, charCount: text.length, blocks: [] })

{
    const pdf = fakePdf([pageOne(), pageTwo()])
    const { pages, fresh } = await withTablePages(pdf, [entry(1), entry(2)], 1, 2, OPS)
    assert.equal(fresh.size, 2, 'both pages are laid out with tables')
    const [first, second] = pages
    const phrases = first.text.split('\n').filter((t) => t.includes(':'))
    assert.deepEqual(phrases, [
        'Feature: Something your product does or has',
        'Benefit: What the feature enables for customers',
        'Value: How this maps to a goal the customer is trying to achieve',
    ], 'a header cut by the page break reads as one cell per column')
    assert.ok(!second.text.includes('your product'), 'the continuation is not read a second time')
    assert.ok(second.text.startsWith('Round lamp\nBright light\nFits every room in the house.\n\nSquare desk'), 'the body reads cell by cell after the header')
    assert.equal(second.tables[0].cells.filter((c) => c.consumed).length, 3, 'the continued header cells are marked as consumed')
    assert.equal(first.tables[0].cells.filter((c) => c.after).length, 3, 'the cut header cells carry the text that continues')

    for (const p of pages) {
        const page = await pdf.getPage(p.pageNum)
        const raw = await layerItemsForPage(page, OPS)
        const model = buildBlockModel(preparedItems(p.pageNum, raw), { pageWidth: W, pageHeight: H, tables: p.tables })
        const { readingIndexToBox } = alignBoxMap(model, blockCounts(p))
        assert.deepEqual(
            readingIndexToBox.map((g) => model.words[g].text),
            p.text.trim().split(/\s+/).filter(Boolean),
            'the highlight stays in step with the voice across the join',
        )
        if (p.pageNum === 1) {
            const foreign = readingIndexToBox.filter((g) => model.words[g].foreign).length
            assert.equal(foreign, HEADER_CUT[1].join(' ').split(' ').length, 'words that continue on the next page have no box on this one')
        }
    }
}

{
    const pdf = fakePdf([pageOne(), pageTwo()])
    const lone = await withTablePages(pdf, [entry(1), entry(2)], 2, 2, OPS)
    assert.ok(!lone.pages[1].text.includes('your product'), 'a window that starts on the continuation still skips the text read on the page before')
    assert.equal(lone.pages[0].text, 'x'.repeat(200), 'pages outside the window are left alone')
}

{
    const pdf = fakePdf([pageOne(), pageTwo()])
    const scanned = await withTablePages(pdf, [{ ...entry(1), charCount: 5 }, { ...entry(2), ocr: true }], 1, 2, OPS)
    assert.equal(scanned.fresh.size, 0, 'scanned and recognised pages are never laid out as tables')
}

{
    const rows = [
        item('A paragraph of ordinary prose with a few words.', 100, 700, 350),
        item('Another line continues the same paragraph here.', 100, 688, 350),
    ]
    const pdf = fakePdf([fakePage(rows, ops())])
    const plain = pageFromItems(1, rows, W, H)
    const { pages, fresh } = await withTablePages(pdf, [plain], 1, 1, OPS)
    assert.equal(fresh.size, 0)
    assert.equal(pages[0].text, plain.text, 'a prose page reads the same after the table pass')
}

{
    const previous = {
        blocks: [
            { type: 'para', text: 'Running head', geo: 'para', chrome: { signature: 'head', position: 'header', type: 'info' }, skip: true },
            { type: 'para', text: 'Body words stay here.', geo: 'para' },
        ],
    }
    const fresh = {
        pageNum: 1,
        blocks: [
            { type: 'para', text: 'Running head', geo: 'para' },
            { type: 'para', text: 'Body words stay here.', geo: 'para' },
            { type: 'para', text: 'Cell', geo: 'cell', row: '0:0' },
        ],
    }
    const carried = carryAnnotations(previous, fresh)
    assert.equal(carried.blocks[0].skip, true, 'running heads that were skipped stay skipped')
    assert.equal(carried.blocks[0].chrome.signature, 'head')
    assert.equal(carried.text, 'Body words stay here.\n\nCell', 'the page text is rebuilt without skipped blocks')
}

console.log('tablePages ok')
