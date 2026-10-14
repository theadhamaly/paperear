import assert from 'node:assert'
import { canResumeHeldAudio } from './resumePlan.js'

const held = { holdToken: 3, currentToken: 3, heldWordIndex: 40, currentWordIndex: 40, hasSource: true, ended: false }

assert.strictEqual(canResumeHeldAudio(held), true)
assert.strictEqual(canResumeHeldAudio({ ...held, currentWordIndex: 12 }), false)
assert.strictEqual(canResumeHeldAudio({ ...held, holdToken: -1 }), false)
assert.strictEqual(canResumeHeldAudio({ ...held, currentToken: 4 }), false)
assert.strictEqual(canResumeHeldAudio({ ...held, hasSource: false }), false)
assert.strictEqual(canResumeHeldAudio({ ...held, ended: true }), false)
