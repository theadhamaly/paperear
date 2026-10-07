import assert from 'node:assert'

const { track } = await import('./track.js')

assert.doesNotThrow(() => track('document-opened'))

const calls = []
globalThis.window = { umami: { track: (name) => calls.push(name) } }
track('document-opened')
track('document-opened')
track('reading-started')
track('reading-started')
assert.deepStrictEqual(calls, ['document-opened', 'reading-started'])

delete globalThis.window
console.log('track ok')
