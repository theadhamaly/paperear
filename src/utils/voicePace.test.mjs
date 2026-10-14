import assert from 'node:assert/strict'
import { WPM_MIN, WPM_MAX } from './wpm.js'
import { ENGINES, MIN_SAMPLE_WORDS, PACE_KEY, paceKind, naturalWpm, readPaces, recordPace, speechSpan, speedFor, writePaces } from './voicePace.js'
import { audibleSeconds } from './wavTrim.js'

assert.equal(paceKind('piper:en_US-x'), 'piper')
assert.equal(paceKind('cloud:elevenlabs:abc'), 'cloud')
assert.equal(paceKind('Some Voice'), 'system')
assert.equal(paceKind('Some Voice', { android: true }), 'android')

assert.equal(naturalWpm({}, 'v', 'piper'), ENGINES.piper.prior)
assert.equal(naturalWpm({ v: { wpm: 190, words: 40 } }, 'v', 'piper'), 190)
assert.equal(naturalWpm({ v: { wpm: 190, words: 40 } }, 'other', 'system'), ENGINES.system.prior)

const first = recordPace({}, 'v', { words: 30, seconds: 10 })
assert.equal(first.v.wpm, 180)
assert.equal(first.v.words, 30)

assert.equal(recordPace({}, 'v', { words: MIN_SAMPLE_WORDS - 1, seconds: 2 }) .v, undefined)
const same = {}
assert.equal(recordPace(same, 'v', { words: 3, seconds: 1 }), same)
assert.equal(recordPace(same, 'v', { words: 20, seconds: 0 }), same)
assert.equal(recordPace(same, 'v', { words: 20, seconds: 1 }), same)
assert.equal(recordPace(same, '', { words: 20, seconds: 8 }), same)

const normalised = recordPace({}, 'v', { words: 40, seconds: 10, rate: 2 })
assert.equal(normalised.v.wpm, 120)

const blended = recordPace({ v: { wpm: 160, words: 100 } }, 'v', { words: 50, seconds: 15 })
assert.ok(blended.v.wpm > 160 && blended.v.wpm < 200)
assert.equal(blended.v.words, 150)
const heavy = recordPace({ v: { wpm: 160, words: 400 } }, 'v', { words: 10, seconds: 3 })
assert.ok(Math.abs(heavy.v.wpm - 160) < Math.abs(blended.v.wpm - 160), 'a long history moves less than a short one')

const store = new Map()
const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) }
writePaces(storage, { a: { wpm: 170, words: 20 }, b: { wpm: 150, words: 50 } })
assert.ok(store.has(PACE_KEY))
assert.deepEqual(readPaces(storage), { a: { wpm: 170, words: 20 }, b: { wpm: 150, words: 50 } })
store.set(PACE_KEY, 'not json')
assert.deepEqual(readPaces(storage), {})
assert.deepEqual(readPaces({ getItem: () => { throw new Error('blocked') } }), {})

assert.deepEqual(speedFor(150, 150, 'piper'), { rate: 1, limited: null, limitWpm: null })
assert.equal(speedFor(180, 120, 'piper').rate, 1.5)
assert.deepEqual(speedFor(400, 160, 'piper'), { rate: 1.8, limited: 'max', limitWpm: 288 })
assert.deepEqual(speedFor(60, 160, 'system'), { rate: 0.5, limited: 'min', limitWpm: 80 })
assert.equal(speedFor(300, 160, 'android').limited, null)
assert.equal(speedFor(400, 160, 'system').limited, 'max')
assert.equal(speedFor(400, 160, 'system').rate, 2)

assert.equal(speechSpan([{ start: 0.2, end: 0.6 }, { start: 0.6, end: 4.2 }], 5), 4)
assert.equal(speechSpan(null, 5), 5)
assert.equal(speechSpan([], 0), 0)

const wav = (samples, rate = 1000) => {
    const view = new DataView(new ArrayBuffer(44 + samples.length * 2))
    view.setUint32(24, rate, true)
    view.setUint16(34, 16, true)
    samples.forEach((s, i) => view.setInt16(44 + i * 2, s, true))
    return view.buffer
}
const silence = new Array(100).fill(0)
const speech = new Array(500).fill(8000)
assert.equal(audibleSeconds(wav([...silence, ...speech, ...silence])), 0.5)
assert.equal(audibleSeconds(wav(silence)), 0)
assert.equal(audibleSeconds(new ArrayBuffer(10)), 0)

console.log('voicePace ok')

{
    const { startingWpm } = await import('./voicePace.js')
    assert.equal(startingWpm({}, 'v', 'piper'), ENGINES.piper.prior)
    assert.equal(startingWpm({ v: { wpm: 187.4, words: 40 } }, 'v', 'piper'), 187)
    assert.equal(startingWpm({ v: { wpm: 5, words: 40 } }, 'v', 'system'), WPM_MIN)
    assert.equal(startingWpm({ v: { wpm: 2000, words: 40 } }, 'v', 'system'), WPM_MAX)
    const natural = startingWpm({ v: { wpm: 187.4, words: 40 } }, 'v', 'piper')
    assert.equal(speedFor(natural, 187.4, 'piper').rate.toFixed(2), '1.00')
}
