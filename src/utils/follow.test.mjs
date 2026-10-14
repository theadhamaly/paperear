import assert from 'node:assert/strict'
import { FOLLOW_MODES, DEFAULT_FOLLOW, readFollow, saveFollow, cellRanges, unitsForText, bandFor, unitTextAt } from './follow.js'

assert.deepEqual(FOLLOW_MODES, ['word', 'sentence', 'paragraph'])
assert.equal(DEFAULT_FOLLOW, 'sentence')
Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('storage blocked') } })
assert.equal(readFollow(), 'sentence', 'without storage the default is word plus sentence')
saveFollow('word')

const store = new Map()
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v) } })
assert.equal(readFollow(), 'sentence')
saveFollow('paragraph')
assert.equal(readFollow(), 'paragraph', 'the choice persists')
saveFollow('word')
assert.equal(readFollow(), 'word')
store.set('paperear_follow', 'nonsense')
assert.equal(readFollow(), 'sentence', 'an unknown stored value falls back to the default')

const pages = [
    { blocks: [{ type: 'para', words: [{ word: 'a', index: 0 }] }, { type: 'para', cell: true, words: [{ word: 'b', index: 1 }, { word: 'c.', index: 2 }] }] },
    { blocks: [{ type: 'chrome', words: [] }, { type: 'para', cell: true, words: [{ word: 'd', index: 3 }] }] },
]
assert.deepEqual(cellRanges(pages), [[1, 2], [3, 3]], 'cells are read from the page blocks')
assert.deepEqual(cellRanges(null), [])

{
    const text = 'Intro line\nSales rise. Costs fall.\nTotal'
    const units = unitsForText(text, [{ blocks: [{ type: 'para', words: [{ index: 0 }, { index: 1 }] }, { type: 'para', cell: true, words: [{ index: 2 }, { index: 3 }, { index: 4 }, { index: 5 }] }] }])
    assert.deepEqual(bandFor(units, 3, 'sentence').range, [2, 5], 'a cell is covered whole even with two sentences')
    assert.deepEqual(bandFor(units, 3, 'paragraph').range, [2, 5])
    assert.equal(bandFor(units, 3, 'word'), null, 'word only draws no band')
    assert.equal(unitTextAt(units, 3), 'Sales rise. Costs fall.')
}

{
    const clause = 'one two three four five six seven eight nine ten'
    const text = `${Array(4).fill(clause).join('; ')}; ${clause}.`
    const units = unitsForText(text, [])
    const band = bandFor(units, 5, 'sentence')
    assert.deepEqual(band.range, [0, 9], 'a sentence past the word cap narrows to its clause')
    assert.deepEqual(band.short, null, 'no further narrowing when the clause is already short')
    const longClause = `${clause} ${clause} ${clause}, ${clause}.`
    const second = unitsForText(longClause, [])
    const wide = bandFor(second, 5, 'sentence')
    assert.deepEqual(wide.range, [0, 39], 'under the word cap the whole sentence is kept')
    assert.deepEqual(wide.short, [0, 29], 'a shorter clause is ready for pages where the sentence would run past three lines')
}

console.log('follow ok')
