import assert from 'node:assert/strict'
import { isNativeRangeArrow, releaseFocusWithin } from './shortcutTarget.js'

const slider = { tagName: 'INPUT', type: 'range' }
const key = (target, code, mods = {}) => ({ target, code, ...mods })

assert.equal(isNativeRangeArrow(key(slider, 'ArrowUp')), true)
assert.equal(isNativeRangeArrow(key(slider, 'ArrowLeft')), true)
assert.equal(isNativeRangeArrow(key(slider, 'ArrowUp', { ctrlKey: true })), false)
assert.equal(isNativeRangeArrow(key(slider, 'ArrowDown', { altKey: true })), false)
assert.equal(isNativeRangeArrow(key(slider, 'KeyM')), false)
assert.equal(isNativeRangeArrow(key({ tagName: 'BUTTON' }, 'ArrowUp')), false)
assert.equal(isNativeRangeArrow(key({ tagName: 'INPUT', type: 'text' }, 'ArrowUp')), false)

{
    let blurred = 0
    const inside = { blur: () => { blurred++ } }
    const body = {}
    const doc = { body, activeElement: inside }
    releaseFocusWithin({ contains: (n) => n === inside }, doc)
    assert.equal(blurred, 1)
    releaseFocusWithin({ contains: () => false }, doc)
    assert.equal(blurred, 1)
    releaseFocusWithin({ contains: () => true }, { body, activeElement: body })
    assert.equal(blurred, 1)
}
console.log('ok')
