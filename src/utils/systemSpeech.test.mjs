import assert from 'node:assert'

const { systemSpeech, hasSystemSpeech, createUtterance } = await import('./systemSpeech.js')

assert.strictEqual(hasSystemSpeech, false)
assert.deepStrictEqual(systemSpeech.getVoices(), [])
assert.doesNotThrow(() => {
    systemSpeech.cancel()
    systemSpeech.speak({})
    systemSpeech.pause()
    systemSpeech.resume()
    systemSpeech.onvoiceschanged = () => { }
    systemSpeech.onvoiceschanged = null
})
assert.strictEqual(createUtterance('x'), null)

console.log('systemSpeech ok')
