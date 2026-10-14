import assert from 'node:assert/strict'
import { anchoredScroll, fractionScroll, makeAnchor, intersectsBox, needsMove } from './viewAnchor.js'

const box = { top: 100, left: 50, bottom: 700, right: 850 }

const anchor = makeAnchor({ top: 300, left: 200 }, box, { top: 1000, left: 0 }, { height: 5000, width: 800 })
assert.equal(anchor.top, 200)
assert.equal(anchor.left, 150)
assert.equal(anchor.fracY, 1200 / 5000)
assert.equal(anchor.fracX, 150 / 800)

const moved = anchoredScroll(anchor, { top: 600, left: 260 }, box, { top: 1000, left: 0 })
assert.deepEqual(moved, { top: 1300, left: 60 })

const byFraction = fractionScroll(anchor, { height: 10000, width: 1600 }, { top: 0, left: 0 })
assert.deepEqual(byFraction, { top: 2400 - 200, left: 300 - 150 })

const rtl = makeAnchor({ top: 300, left: 200 }, box, { top: 0, left: -40 }, { height: 5000, width: 800 })
assert.equal(rtl.fracX, null)
assert.equal(fractionScroll(rtl, { height: 5000, width: 800 }, { top: 0, left: -40 }).left, -40)

assert.equal(intersectsBox({ top: 120, bottom: 140, left: 60, right: 90 }, box), true)
assert.equal(intersectsBox({ top: 800, bottom: 820, left: 60, right: 90 }, box), false)

assert.equal(needsMove({ top: 10, left: 0 }, { top: 10.3, left: 0 }), false)
assert.equal(needsMove({ top: 10, left: 0 }, { top: 12, left: 0 }), true)

console.log('viewAnchor ok')
