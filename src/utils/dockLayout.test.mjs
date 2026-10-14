import assert from 'node:assert/strict'
import { dockMode, sheetCover } from './dockLayout.js'

assert.equal(dockMode(1280), 'side')
assert.equal(dockMode(900), 'side')
assert.equal(dockMode(899), 'sheet')

assert.equal(sheetCover(true, 1280, 800), 0)
assert.equal(sheetCover(false, 600, 800), 0)
assert.equal(sheetCover(true, 600, 800), 336)

console.log('dockLayout ok')
