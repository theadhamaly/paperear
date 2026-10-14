import assert from 'node:assert/strict'
import { mergeLoneShortChunks, parseToQueue, splitQueueByScript } from './textToSSML.js'

const line = (text, wordIndex, extra = {}) => ({ text, wordIndex, pause: 280, lang: 'en', ...extra })

{
    const out = mergeLoneShortChunks([line('By', 0, { pause: 900 }), line('Jane Doe', 1, { pause: 700 }), line('Opening sentence here today.', 3)])
    assert.equal(out.length, 2)
    assert.equal(out[0].text, 'By Jane Doe')
    assert.equal(out[0].wordIndex, 0)
    assert.equal(out[0].pause, 700)
    assert.equal(out[1].wordIndex, 3)
}

{
    const out = mergeLoneShortChunks([line('A longer line of text.', 0), line('SOURCE NAME', 5, { pause: 500 })])
    assert.equal(out.length, 1)
    assert.equal(out[0].text, 'A longer line of text. SOURCE NAME')
    assert.equal(out[0].pause, 500)
}

{
    const out = mergeLoneShortChunks([line('Hi', 0), line('Three words here now.', 1, { lang: 'ar' })])
    assert.equal(out.length, 2)
}

{
    const out = mergeLoneShortChunks([line('Hi', 0), { text: '', isSilent: true, pause: 300, lang: 'en', wordIndex: 1 }, line('Later text here.', 1)])
    assert.equal(out.length, 1)
    assert.equal(out[0].text, 'Hi Later text here.')
    assert.equal(out[0].wordIndex, 0)
}

{
    const silent = { text: '', isSilent: true, pause: 800, lang: 'en', wordIndex: 1 }
    const out = mergeLoneShortChunks([line('By', 0, { pause: 150 }), silent, line('Mary Smith', 1), line('A full sentence follows here.', 3)])
    assert.equal(out.length, 2)
    assert.equal(out[0].text, 'By Mary Smith')
    assert.equal(out[1].wordIndex, 3)
}

{
    const silent = { text: '', isSilent: true, pause: 800, lang: 'en', wordIndex: 4 }
    const out = mergeLoneShortChunks([line('A full sentence ends here.', 0), silent, line('Fin', 5)])
    assert.equal(out.length, 1)
    assert.equal(out[0].text, 'A full sentence ends here. Fin')
}

{
    const silent = { text: '', isSilent: true, pause: 300, lang: 'en', wordIndex: 1 }
    const out = mergeLoneShortChunks([line('Hi', 0), silent, line('Later text here.', 1, { lang: 'ar' })])
    assert.equal(out.length, 3)
}

{
    const input = [line('One', 0), line('Two', 1), line('Three words follow this.', 2), line('Four word long line.', 6)]
    const out = mergeLoneShortChunks(input)
    assert.equal(out.length, 2)
    assert.equal(out[0].text, 'One Two Three words follow this.')
    assert.equal(out[1].wordIndex, 6)
}

{
    const out = mergeLoneShortChunks([line('Alone', 0)])
    assert.equal(out.length, 1)
}

{
    const queue = splitQueueByScript(parseToQueue('Start here today. مرحبا بكم في المكان الجميل. End now.'), { only: 'en' })
    const silenced = queue.filter((c) => c.isSilent && c.skippedWords)
    assert.equal(silenced.length, 1)
    assert.equal(silenced[0].skippedWords, 5)
    assert.equal(silenced[0].wordIndex, 3)
    assert.ok(queue.filter((c) => !c.isSilent).every((c) => c.skippedWords === undefined))
}
