import assert from 'node:assert'
import { documentBusyReason, unlessBusy } from './documentBusy.js'

const idle = { docLoading: null, ocrBusy: null, rangeLoading: false }

assert.strictEqual(documentBusyReason(idle), null)
assert.strictEqual(documentBusyReason({ ...idle, docLoading: { name: 'a' } }), 'opening')
assert.strictEqual(documentBusyReason({ ...idle, ocrBusy: { done: 0, total: 2 } }), 'ocr')
assert.strictEqual(documentBusyReason({ ...idle, rangeLoading: true }), 'pages')
assert.strictEqual(documentBusyReason({ ...idle, docLoading: {}, rangeLoading: true }), 'opening')

let busy = true
const calls = []
const guarded = unlessBusy(() => busy, (value) => { calls.push(value); return value })
assert.strictEqual(guarded(1), undefined)
assert.deepStrictEqual(calls, [])
busy = false
assert.strictEqual(guarded(2), 2)
assert.deepStrictEqual(calls, [2])
