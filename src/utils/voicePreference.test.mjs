import assert from 'node:assert/strict'
import { groupVoices, isKeyVoice, isOpenVoice, preferredOpenVoice } from './voicePreference.js'

const downloaded = [{ name: 'piper:en_US-joe-medium' }, { name: 'piper:de_DE-thorsten-medium' }]

assert.equal(isOpenVoice('piper:x'), true)
assert.equal(isKeyVoice('cloud:elevenlabs:abc'), true)
assert.equal(isOpenVoice(undefined), false)

assert.equal(preferredOpenVoice({ selected: 'Microsoft David', docLang: 'en', downloaded }), 'piper:en_US-joe-medium')
assert.equal(preferredOpenVoice({ selected: '', docLang: 'unknown', downloaded }), 'piper:en_US-joe-medium')
assert.equal(preferredOpenVoice({ selected: 'Microsoft David', docLang: 'en', downloaded, pinned: true }), null)
assert.equal(preferredOpenVoice({ selected: 'cloud:elevenlabs:abc', docLang: 'en', downloaded }), null)
assert.equal(preferredOpenVoice({ selected: 'piper:en_US-joe-medium', docLang: 'en', downloaded }), null)
assert.equal(preferredOpenVoice({ selected: 'piper:en_US-joe-medium', docLang: 'de', downloaded }), 'piper:de_DE-thorsten-medium')
assert.equal(preferredOpenVoice({ selected: 'Microsoft Hoda', docLang: 'ar', downloaded }), null)
assert.equal(preferredOpenVoice({ selected: 'x', docLang: 'en', downloaded: [] }), null)

const groups = groupVoices([{ name: 'piper:a' }, { name: 'cloud:b' }, { name: 'Microsoft David' }])
assert.deepEqual([groups.open.length, groups.key.length, groups.browser.length], [1, 1, 1])

console.log('voicePreference ok')

{
    const { dropAliasVoices, describeVoice, voiceBars } = await import('./voicePreference.js')
    const system = [
        { name: 'Microsoft David - English (United States)', voiceURI: 'Microsoft David - English (United States)', lang: 'en-US' },
        { name: 'Microsoft Hoda - Arabic (Egypt)', voiceURI: 'Microsoft Hoda - Arabic (Egypt)', lang: 'ar-EG' },
        { name: 'Hubert', voiceURI: 'Microsoft David - English (United States)', lang: 'en-US' },
        { name: 'Samantha', voiceURI: 'com.apple.voice.compact.en-US.Samantha', lang: 'en-US' },
    ]
    assert.deepEqual(dropAliasVoices(system).map((v) => v.name), ['Microsoft David - English (United States)', 'Microsoft Hoda - Arabic (Egypt)', 'Samantha'], 'a voice that only points at another voice under a new name is dropped')
    assert.deepEqual(describeVoice(system[1]), { kind: 'browser', title: 'Hoda', detail: 'Arabic (Egypt) · Microsoft' })
    assert.deepEqual(describeVoice({ name: 'piper:en_GB-cori-high', label: 'Cori · Great Britain · high' }), { kind: 'open', title: 'Cori', detail: 'Great Britain · high' })
    assert.equal(describeVoice({ name: 'cloud:elevenlabs:abc', label: 'Rachel' }).kind, 'key')
    const bars = voiceBars('Cori')
    assert.equal(bars.length, 14)
    assert.deepEqual(bars, voiceBars('Cori'), 'the same voice always gets the same mark')
    assert.notDeepEqual(bars, voiceBars('Hoda'), 'different voices get different marks')
    assert.ok(bars.every((b) => b > 0 && b <= 1))
}
console.log('voice helpers ok')

{
    const { usableSystemVoices } = await import('./voicePreference.js')
    const list = [
        { name: 'Microsoft Hoda - Arabic (Egypt)', voiceURI: 'Microsoft Hoda - Arabic (Egypt)' },
        { name: 'Google US English', voiceURI: 'Google US English' },
        { name: 'Irving', voiceURI: 'Microsoft Hoda - Arabic (Egypt)' },
    ]
    assert.deepEqual(usableSystemVoices(list).map((v) => v.name), ['Microsoft Hoda - Arabic (Egypt)'])
    const novelty = ['Albert', 'Bad News', 'Bahh', 'Bells', 'Boing', 'Bubbles', 'Cellos', 'Good News', 'Jester', 'Organ', 'Superstar', 'Trinoids', 'Whisper', 'Wobble', 'Zarvox', 'Deranged', 'Hysterical', 'Pipe Organ', 'zarvox (English (United States))', 'Albert (en-US)']
    const kept = ['Daniel', 'Eddy (English (US))', 'Flo', 'Grandma', 'Grandpa', 'Reed', 'Rocko', 'Sandy', 'Shelley', 'Samantha']
    const apple = [...novelty, ...kept].map((name) => ({ name, voiceURI: name }))
    assert.deepEqual(usableSystemVoices(apple).map((v) => v.name), kept)
}
console.log('usable system voices ok')
