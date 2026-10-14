import assert from 'node:assert'
import { ZOOM_MIN, ZOOM_MAX, clampZoom, stepZoom } from './zoomSteps.js'

assert.strictEqual(ZOOM_MIN, 0.5, 'zoom can shrink to half size')
assert.strictEqual(ZOOM_MAX, 4, 'zoom can grow to four times')
assert.strictEqual(stepZoom(1, 1), 1.1, 'one step in from fit is ten percent')
assert.strictEqual(stepZoom(1, -1), 0.95, 'below fit the step is five percent')
assert.strictEqual(stepZoom(1.1, -1), 1, 'stepping out returns to fit exactly')
assert.strictEqual(stepZoom(0.5, -1), 0.5, 'cannot go below the minimum')
assert.strictEqual(stepZoom(4, 1), 4, 'cannot go above the maximum')
assert.strictEqual(stepZoom(0.95, 1), 1, 'five percent steps climb to fit without drifting')

let z = 1
for (let i = 0; i < 100; i++) z = stepZoom(z, 1)
assert.strictEqual(z, 4, 'repeated zoom in reaches the maximum exactly')
for (let i = 0; i < 100; i++) z = stepZoom(z, -1)
assert.strictEqual(z, 0.5, 'repeated zoom out reaches the minimum exactly')

assert.strictEqual(clampZoom(1.23), 1.25, 'slider values snap to five percent')
assert.strictEqual(clampZoom(9), 4)
assert.strictEqual(clampZoom(0.1), 0.5)
assert.strictEqual(clampZoom('abc'), 1, 'invalid values fall back to fit')
assert.strictEqual(clampZoom(undefined), 1)

console.log('zoomSteps ok')
