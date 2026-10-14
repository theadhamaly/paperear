import assert from 'node:assert/strict'
import { buildBlockModel, alignBoxMap } from './blockModel.js'
import { bandBoxesForRange, pickBandBoxes } from './bandRects.js'

const item = (str, x, y, w, h) => ({ str, transform: [h, 0, 0, h, x, y], width: w, height: h, dir: 'ltr' })
const PAGE = { pageWidth: 600, pageHeight: 800 }

const model = buildBlockModel([
    item('alpha beta gamma delta', 60, 700, 220, 10),
    item('epsilon zeta eta theta', 60, 686, 220, 10),
    item('iota kappa lambda mu', 60, 672, 200, 10),
    item('nu xi omicron pi', 60, 658, 180, 10),
], PAGE)
const align = alignBoxMap(model, null)
const textOfBox = (index) => model.words[align.readingIndexToBox[index]].text

assert.equal(textOfBox(0), 'alpha')
assert.equal(align.readingIndexToBox.length, 16, 'every word of the page is read')

{
    const boxes = bandBoxesForRange(model, align, [1, 6])
    assert.equal(boxes.length, 2, 'a range over two lines gives one strip per line')
    const first = model.words[align.readingIndexToBox[1]]
    const lineEnd = model.words[align.readingIndexToBox[3]]
    assert.ok(Math.abs(boxes[0].x - first.x) < 1e-9, 'the first strip starts at the first word of the unit')
    assert.ok(Math.abs(boxes[0].x + boxes[0].w - (lineEnd.x + lineEnd.w)) < 1e-9, 'the first strip runs to the end of its line')
    const secondStart = model.words[align.readingIndexToBox[4]]
    const secondEnd = model.words[align.readingIndexToBox[6]]
    assert.ok(Math.abs(boxes[1].x - secondStart.x) < 1e-9, 'the second strip starts at the line start')
    assert.ok(Math.abs(boxes[1].x + boxes[1].w - (secondEnd.x + secondEnd.w)) < 1e-9, 'the second strip stops at the last word of the unit')
    assert.ok(boxes[0].y > boxes[1].y, 'strips follow the lines down the page')
}

assert.equal(bandBoxesForRange(model, align, [5, 5]).length, 1, 'a single word is one strip')
assert.deepEqual(bandBoxesForRange(model, align, null), [], 'no range, no band')
assert.deepEqual(bandBoxesForRange(model, align, [40, 50]), [], 'a range beyond the page draws nothing')
assert.equal(bandBoxesForRange(model, align, [-5, 2]).length, 1, 'a unit that began on the previous page starts at the top of this one')

{
    const all = pickBandBoxes(model, align, [0, 15], [4, 9], 3)
    assert.equal(all.length, 2, 'more lines than the cap switch to the narrower clause')
    const kept = pickBandBoxes(model, align, [0, 7], [4, 7], 3)
    assert.equal(kept.length, 2, 'within the cap the whole unit keeps its band')
    assert.equal(pickBandBoxes(model, align, [0, 15], null, 3).length, 4, 'with no narrower clause the whole unit stays')
}

{
    const skipped = { readingIndexToBox: align.readingIndexToBox, skipByBox: align.skipByBox.map((_, i) => i === align.readingIndexToBox[2]) }
    const boxes = bandBoxesForRange(model, skipped, [0, 3])
    const covered = boxes[0].x + boxes[0].w
    const gamma = model.words[align.readingIndexToBox[2]]
    const delta = model.words[align.readingIndexToBox[3]]
    assert.ok(Math.abs(covered - (delta.x + delta.w)) < 1e-9 && gamma.x < covered, 'struck words add no strip of their own')
}

console.log('bandRects ok')
