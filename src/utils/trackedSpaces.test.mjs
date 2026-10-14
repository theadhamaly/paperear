import assert from 'node:assert'
import { dropInventedSpaces, mayHaveInventedSpaces } from './trackedSpaces.js'
import { mergeGlyphRuns } from './pageModel.js'

const SIZE = 12
const ADVANCE = 8
const TRACK = 1
const SPACE_ADVANCE = 3

function tracked(parts) {
    const glyphs = []
    let x = 50
    let str = ''
    for (const part of parts) {
        if (part === 'real') {
            glyphs.push({ x0: x, x1: x + SPACE_ADVANCE, y: 700, u: ' ', space: true })
            x += SPACE_ADVANCE + TRACK
            str += ' '
        } else if (part === 'fake') {
            x += 0.2
            str += ' '
        } else if (typeof part === 'number') {
            x += part
            str += ' '
        } else {
            for (const ch of part) {
                glyphs.push({ x0: x, x1: x + ADVANCE, y: 700, u: ch, space: false })
                x += ADVANCE + TRACK
                str += ch
            }
        }
    }
    const item = { str, transform: [SIZE, 0, 0, SIZE, 50, 700], width: x - TRACK - 50, height: SIZE }
    return { item, glyphs }
}

const repaired = (parts) => {
    const { item, glyphs } = tracked(parts)
    return dropInventedSpaces([item], glyphs)[0].str
}

assert.equal(repaired(['BRAVE', 'real', 'WILD', 'real', 'O', 'fake', 'AKS']), 'BRAVE WILD OAKS', 'a space the document never drew is removed from tracked capitals')
assert.equal(repaired(['BRAVE', 'real', 'WILD', 'real', 'OAKS']), 'BRAVE WILD OAKS', 'spaces the document drew stay')
assert.equal(repaired(['MOSS', 'fake', 'Y', 'real', 'FERN']), 'MOSSY FERN', 'a drawn space survives next to a removed one')
assert.equal(repaired(['TALL', 14, 'PINES']), 'TALL PINES', 'a clearly wide gap stays a word break')
assert.equal(repaired(['TO', 'real', 'KELP']), 'TO KELP', 'ordinary words are untouched')

{
    const { item, glyphs } = tracked(['BRAVE', 'real', 'O', 'fake', 'AKS'])
    const other = { str: 'plain words here', transform: [12, 0, 0, 12, 50, 600], width: 90, height: 12 }
    const out = dropInventedSpaces([other, item], glyphs)
    assert.equal(out[0], other, 'items that cannot be tracked capitals are returned as they were')
    assert.equal(out[1].width, item.width, 'geometry is kept so later words stay where they were')
}

{
    const { item, glyphs } = tracked(['BRAVE', 'real', 'WILD'])
    assert.equal(dropInventedSpaces([{ ...item, str: 'BRAVE X WILD' }], glyphs)[0].str, 'BRAVE X WILD', 'text that does not match the drawn letters is left alone')
}

assert.ok(mayHaveInventedSpaces('THE G OOD NEWS'), 'capital lines with a stray fragment are candidates')
assert.ok(!mayHaveInventedSpaces('THE END OF TIME'), 'capital lines made of ordinary words are not')
assert.ok(!mayHaveInventedSpaces('Plain text A B'), 'mixed case lines are not')
