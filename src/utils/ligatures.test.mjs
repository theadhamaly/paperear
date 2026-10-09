import assert from 'node:assert/strict'
import { ligatureFor, repairUnmappedGlyphs, repairUnmappedGlyphBoxes } from './ligatures.js'
import { glyphsFromOperatorList } from './glyphBoxes.js'
import { mergeGlyphRuns } from './pageModel.js'

const item = (str, x, w, extra = {}) => ({ str, transform: [10, 0, 0, 10, x, 500], width: w, height: 10, dir: 'ltr', ...extra })
const joined = (items) => mergeGlyphRuns(items).map((it) => it.str)

assert.equal(ligatureFor({ em: 0.35, before: 'n', after: 'l' }), 'f', 'a narrow glyph inside a word is an f')
assert.equal(ligatureFor({ em: 0.35, before: ' ', after: 'i' }), 'f', 'a narrow glyph at the start of a word is an f')
assert.equal(ligatureFor({ em: 0.65, before: 'a', after: 'l' }), 'ff', 'a double-width glyph before l after a letter is ff')
assert.equal(ligatureFor({ em: 0.65, before: ' ', after: 'l' }), '', 'ff never starts a word')
assert.equal(ligatureFor({ em: 0.35, before: ' ', after: ' ' }), '', 'a glyph with no letter beside it is dropped')
assert.equal(ligatureFor({ em: 1.2, before: 'a', after: 'b' }), '', 'a glyph that is not an f shape is dropped')

{
    const items = [item('an in', 0, 25), item('\u0000', 25, 3.5), item('luence end', 28.5, 55)]
    const fixed = repairUnmappedGlyphs(items)
    assert.equal(fixed.length, 3, 'the glyph keeps its own item and geometry')
    assert.equal(fixed[1].str, 'f')
    assert.equal(fixed[1].width, 3.5)
    assert.deepEqual(joined(fixed), ['an influence end'], 'the word is whole again')
}

{
    const items = [item('a ba', 0, 25), item('\u0000', 25, 6.5), item('ling day', 31.5, 50)]
    assert.deepEqual(joined(repairUnmappedGlyphs(items)), ['a baffling day'], 'a double-width glyph between letters becomes ff')
}

{
    const items = [item('a ', 0, 5), item('\u0000', 5, 3.5), item('igure out', 8.5, 40)]
    assert.deepEqual(joined(repairUnmappedGlyphs(items)), ['a figure out'], 'the f before an i at a word start is recovered')
}

{
    const items = [item('word', 0, 20), item('\u0000', 40, 3.5), item('other', 60, 25)]
    const fixed = repairUnmappedGlyphs(items)
    assert.deepEqual(fixed.map((it) => it.str), ['word', 'other'], 'a stray glyph far from any letter is dropped')
}

{
    const items = [item('word', 0, 20), item('\u0000', 20, 12), item('more', 32, 20)]
    const fixed = repairUnmappedGlyphs(items)
    assert.deepEqual(joined(fixed), ['wordmore'], 'a dropped glyph leaves its width with the word before it so the word stays whole')
    assert.ok(fixed.every((it) => !it.str.includes('\u0000')))
}

{
    const embedded = repairUnmappedGlyphs([item('speci\u0000ic', 0, 40)])
    assert.equal(embedded[0].str, 'speciic', 'an unmapped glyph inside a longer run is removed')
    assert.deepEqual(repairUnmappedGlyphs([item('\u0000', 0, 3.5)]), [], 'a lone unmapped glyph with nothing beside it disappears')
}

{
    const arabic = repairUnmappedGlyphs([item('\u0000ﺎ', 0, 8, { dir: 'rtl' })])
    assert.equal(arabic[0].str, 'ﺎ', 'Arabic runs lose the unmapped glyph and keep their letters')
}

{
    const clean = [item('nothing to fix', 0, 60)]
    assert.equal(repairUnmappedGlyphs(clean), clean, 'text without unmapped glyphs is returned untouched')
    assert.equal(repairUnmappedGlyphs(undefined), undefined)
}

{
    const OPS = { save: 10, restore: 11, transform: 12, beginText: 31, setCharSpacing: 33, setWordSpacing: 34, setHScale: 35, setLeading: 36, setFont: 37, setTextRise: 39, moveText: 40, setLeadingMoveText: 41, setTextMatrix: 42, nextLine: 43, showText: 44, setGState: 9, paintFormXObjectBegin: 74, paintFormXObjectEnd: 75 }
    const glyph = (unicode, width) => ({ unicode, width, isSpace: false })
    const opList = {
        fnArray: [OPS.beginText, OPS.setFont, OPS.setTextMatrix, OPS.showText],
        argsArray: [[], ['f1', 10], [[1, 0, 0, 1, 100, 500]], [[glyph(' ', 250), glyph('\u0000', 350), glyph('i', 250), glyph('t', 300)]]],
    }
    const glyphs = glyphsFromOperatorList(opList, () => ({ fontMatrix: [0.001, 0, 0, 0.001, 0, 0] }), OPS)
    assert.deepEqual(glyphs.map((g) => g.u), [' ', 'f', 'i', 't'], 'the glyph boxes spell the same letters as the repaired text')
    assert.equal(glyphs[1].space, false, 'the recovered glyph still occupies its box')
    assert.ok(glyphs.every((g) => !('em' in g)))

    const lone = [{ x0: 0, x1: 3.5, y: 500, u: '\u0000', space: false, em: 0.35 }]
    assert.equal(repairUnmappedGlyphBoxes(lone)[0].u, '', 'a glyph with no neighbours is emptied, never left as NUL')
}

console.log('OK — unmapped ligature glyphs are recovered or dropped before they reach words and highlights')
