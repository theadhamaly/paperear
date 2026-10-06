import assert from 'node:assert/strict'
import { langCode, languageName, voiceSections } from './voiceGroups.js'

assert.equal(langCode('de_DE-thorsten-medium'), 'de')
assert.equal(langCode('en-US'), 'en')
assert.equal(langCode(''), '')

const sections = voiceSections({
    ready: [
        { name: 'Microsoft Hoda - Arabic (Egypt)', lang: 'ar-EG' },
        { name: 'Microsoft David - English (United States)', lang: 'en-US' },
        { name: 'piper:en_GB-cori-high', lang: 'en-GB' },
        { name: 'cloud:elevenlabs:abc', lang: '' },
    ],
    catalog: [{ id: 'en_GB-cori-high' }, { id: 'en_GB-alba-medium' }, { id: 'de_DE-thorsten-medium' }, { id: 'ca_ES-upc_ona-medium' }],
    stored: ['en_GB-cori-high'],
    first: ['en', 'ar'],
})
assert.deepEqual(sections.list.map((s) => s.code), ['en', 'ar', 'ca', 'de'], 'featured languages first, then the rest')
assert.deepEqual(sections.list[0].ready.map((v) => v.name), ['piper:en_GB-cori-high', 'Microsoft David - English (United States)'], 'open voices lead their language')
assert.deepEqual(sections.list[0].free.map((v) => v.id), ['en_GB-alba-medium'], 'a downloaded voice is not offered again')
assert.deepEqual([sections.list[1].ready.length, sections.list[1].free.length], [1, 0], 'Arabic keeps its section with the device voice')
assert.deepEqual(sections.other.map((v) => v.name), ['cloud:elevenlabs:abc'], 'a voice with no language stays outside the language sections')
assert.deepEqual(voiceSections({ first: ['ar'] }).list.map((s) => s.code), ['ar'], 'a featured language shows even when empty')

assert.equal(languageName('de', 'en'), 'German')
assert.equal(typeof languageName('xx-invalid-tag-!!', 'en'), 'string')

console.log('voiceGroups ok')

{
    const { lightestVoiceFor, voiceReads } = await import('./voiceGroups.js')
    const shelf = [
        { id: 'en_US-ljspeech-high', quality: 'high', bytes: 114e6 },
        { id: 'en_GB-vctk-medium', quality: 'medium', bytes: 77e6 },
        { id: 'en_US-joe-medium', quality: 'medium', bytes: 63.2e6 },
        { id: 'en_US-sam-medium', quality: 'medium', bytes: 63.1e6 },
        { id: 'de_DE-eva_k-x_low', quality: 'x_low', bytes: 21e6 },
        { id: 'ar_AE-emirati_female-medium', quality: 'medium', bytes: 64e6 },
    ]
    assert.equal(lightestVoiceFor(shelf, 'en').id, 'en_US-sam-medium', 'lowest quality first, then the smallest file')
    assert.equal(lightestVoiceFor(shelf, 'de').id, 'de_DE-eva_k-x_low')
    assert.equal(lightestVoiceFor(shelf, 'ar').id, 'ar_AE-emirati_female-medium')
    assert.equal(lightestVoiceFor(shelf, 'fr'), null, 'no free voice means the device voice keeps reading')
    const { offeredVoiceFor } = await import('./voiceGroups.js')
    assert.equal(offeredVoiceFor(shelf, 'en').id, 'en_US-sam-medium', 'no recommended voice on the shelf falls back to the lightest')
    const norman = { id: 'en_US-norman-medium', quality: 'medium', bytes: 63.5e6 }
    const mike = { id: 'en_US-mike-medium', quality: 'medium', bytes: 63.2e6 }
    assert.equal(offeredVoiceFor([...shelf, mike, norman], 'en').id, 'en_US-norman-medium', 'the first recommended English voice is offered first')
    assert.equal(offeredVoiceFor([...shelf, mike], 'en').id, 'en_US-mike-medium', 'the next recommended voice is offered when the first is absent')
    assert.equal(offeredVoiceFor(shelf, 'de').id, 'de_DE-eva_k-x_low')
    assert.equal(voiceReads({ name: 'piper:en_US-joe-medium' }, 'en'), true)
    assert.equal(voiceReads({ name: 'Microsoft Hoda - Arabic (Egypt)', lang: 'ar-EG' }, 'ar'), true)
    assert.equal(voiceReads({ name: 'cloud:elevenlabs:x', lang: '' }, 'en'), false)
}
console.log('lightest voice ok')

{
    const { previewSample } = await import('./voiceGroups.js')
    assert.equal(previewSample('قرأت الكتاب أمس', 'en-US', 'ar'), '', 'an English voice never previews Arabic page text')
    assert.equal(previewSample('Every page, read to you.', 'ar-AE', 'en'), '', 'an Arabic voice never previews English page text')
    assert.equal(previewSample('ﺍﻟﻜﺘﺎﺏ أمس', 'ar_AE', 'ar'), 'الكتاب أمس', 'the preview reads plain letters, not joined shapes')
    assert.equal(previewSample('one two three', 'en_US', 'en', 2), 'one two', 'the preview stays short')
    assert.equal(previewSample('anything', 'ar', ''), '', 'no page language means the stock line')
}
console.log('preview sample ok')
