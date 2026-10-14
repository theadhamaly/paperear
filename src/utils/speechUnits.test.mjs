import assert from 'node:assert/strict'
import { buildSpeechUnits, unitRange, bandRange, narrowToClause, endsSentence } from './speechUnits.js'
import { parseToQueue, splitLongChunks } from './textToSSML.js'

const textOf = (units, range) => units.words.slice(range[0], range[1] + 1).join(' ')
const sentencesOf = (text) => {
    const units = buildSpeechUnits(text)
    return units.sentences.map((range) => textOf(units, range))
}

assert.deepEqual(
    sentencesOf('The tower is old. The garden is new. Nobody minds!'),
    ['The tower is old.', 'The garden is new.', 'Nobody minds!'],
    'plain full stops, bangs and questions end sentences',
)

assert.deepEqual(
    sentencesOf('Mr. Okafor met Dr. Lindqvist and Prof. Marsh at St. Anselm. They left.'),
    ['Mr. Okafor met Dr. Lindqvist and Prof. Marsh at St. Anselm.', 'They left.'],
    'titles and St. do not end a sentence',
)

assert.deepEqual(
    sentencesOf('Mrs. Vane and Ms. Ito agreed. Jr. Vane did not.'),
    ['Mrs. Vane and Ms. Ito agreed.', 'Jr. Vane did not.'],
    'Mrs., Ms. and Jr. stay inside',
)

assert.deepEqual(
    sentencesOf('Bring fruit, e.g. apples, pears, etc. and bread. Then rest.'),
    ['Bring fruit, e.g. apples, pears, etc. and bread.', 'Then rest.'],
    'e.g. and etc. before lowercase stay inside',
)

assert.deepEqual(
    sentencesOf('Pack the tents, tools, etc. We leave at dawn.'),
    ['Pack the tents, tools, etc.', 'We leave at dawn.'],
    'etc. before a capital can end the sentence',
)

assert.deepEqual(
    sentencesOf('That is, i.e. the plan, was sound. It worked.'),
    ['That is, i.e. the plan, was sound.', 'It worked.'],
    'i.e. stays inside',
)

assert.deepEqual(
    sentencesOf('The U.S. and the U.K. signed it. Others followed.'),
    ['The U.S. and the U.K. signed it.', 'Others followed.'],
    'dotted acronyms stay inside',
)

assert.deepEqual(
    sentencesOf('See Fig. 3 and Vol. 2 on p. 14 and pp. 20-22 and No. 7 for more. Done.'),
    ['See Fig. 3 and Vol. 2 on p. 14 and pp. 20-22 and No. 7 for more.', 'Done.'],
    'reference abbreviations stay inside',
)

assert.deepEqual(
    sentencesOf('No. I will not go. Yes. You will.'),
    ['No.', 'I will not go.', 'Yes.', 'You will.'],
    'No. before a word is an answer, not an abbreviation',
)

assert.deepEqual(
    sentencesOf('J. K. Quill wrote it. A. B. C. Dunmore read it.'),
    ['J. K. Quill wrote it.', 'A. B. C. Dunmore read it.'],
    'single letter initials stay inside',
)

assert.deepEqual(
    sentencesOf('It rose by 3.5 percent. then fell. Later it held.'),
    ['It rose by 3.5 percent. then fell.', 'Later it held.'],
    'a full stop before a lowercase word does not end a sentence, and decimals do not end one',
)

assert.deepEqual(
    sentencesOf('Wait... then go. Stop... Now move.'),
    ['Wait... then go.', 'Stop...', 'Now move.'],
    'an ellipsis before lowercase continues, before a capital ends',
)

assert.deepEqual(
    sentencesOf('He asked, "Is it ready?" She nodded. "Yes!" he said.'),
    ['He asked, "Is it ready?"', 'She nodded.', '"Yes!"', 'he said.'],
    'question and exclamation marks end even before lowercase',
)

assert.deepEqual(
    sentencesOf('ذهب الولد إلى السوق. هل وصل؟ نعم! ثم عاد.'),
    ['ذهب الولد إلى السوق.', 'هل وصل؟', 'نعم!', 'ثم عاد.'],
    'Arabic sentences end at the full stop, the Arabic question mark and the exclamation mark',
)

assert.deepEqual(
    sentencesOf('جاء الدكتور. ثم جلس، وتكلم؛ فسكت الجميع'),
    ['جاء الدكتور.', 'ثم جلس، وتكلم؛ فسكت الجميع'],
    'Arabic commas and semicolons never end a sentence',
)

assert.deepEqual(
    sentencesOf('پانی ٹھنڈا ہے۔ دروازہ بند ہے۔'),
    ['پانی ٹھنڈا ہے۔', 'دروازہ بند ہے۔'],
    'the Arabic-script full stop ends a sentence',
)

{
    const text = 'The first line has a thought that does not finish\nand the second line carries on. New sentence here.'
    assert.deepEqual(
        sentencesOf(text),
        ['The first line has a thought that does not finish', 'and the second line carries on.', 'New sentence here.'],
        'a hard line break is a wall even without a full stop',
    )
}

{
    const text = 'First paragraph ends without a stop\n\nsecond paragraph starts lowercase. Fine.'
    assert.deepEqual(
        sentencesOf(text),
        ['First paragraph ends without a stop', 'second paragraph starts lowercase.', 'Fine.'],
        'a paragraph break is a wall',
    )
}

{
    const text = 'Chapter Title\n\nBody starts here and runs on. It ends.'
    const units = buildSpeechUnits(text)
    assert.equal(textOf(units, unitRange(units, 0, 'sentence')), 'Chapter Title', 'a heading is its own unit')
    assert.equal(textOf(units, unitRange(units, 3, 'sentence')), 'Body starts here and runs on.')
}

{
    const text = 'Total\nSales are up. Costs are down.\n2024\n\nNext row\nvalue'
    const units = buildSpeechUnits(text, { cells: [[1, 6], [7, 7]] })
    assert.equal(textOf(units, unitRange(units, 2, 'sentence')), 'Sales are up. Costs are down.', 'a table cell stays whole even with two sentences')
    assert.equal(textOf(units, unitRange(units, 0, 'sentence')), 'Total', 'a neighbouring cell is separate')
    assert.equal(textOf(units, unitRange(units, 7, 'sentence')), '2024')
    const loose = buildSpeechUnits(text)
    assert.equal(textOf(loose, unitRange(loose, 2, 'sentence')), 'Sales are up.', 'without cell marks sentences split inside the line')
}

{
    const text = 'Line one has two sentences. Here is the second.\nSecond line stands alone.\n\nNew paragraph. Two bits.'
    const units = buildSpeechUnits(text)
    assert.equal(textOf(units, unitRange(units, 1, 'paragraph')), 'Line one has two sentences. Here is the second.', 'paragraph mode stops at a hard break')
    assert.equal(textOf(units, unitRange(units, 10, 'paragraph')), 'Second line stands alone.')
    assert.equal(textOf(units, unitRange(units, 14, 'paragraph')), 'New paragraph. Two bits.')
    assert.equal(unitRange(units, 3, 'word'), null, 'word-only mode has no unit')
    assert.equal(unitRange(units, -1, 'sentence'), null, 'no current word has no unit')
    assert.equal(unitRange(units, 999, 'sentence'), null)
}

{
    const clause = 'alpha beta gamma delta epsilon zeta eta theta iota kappa'
    const long = `${clause}; ${clause}, ${clause}: ${clause}.`
    const units = buildSpeechUnits(long)
    assert.equal(units.sentences.length, 1)
    const whole = unitRange(units, 0, 'sentence')
    assert.deepEqual(whole, [0, 39], 'the whole sentence is one speech unit')
    const first = bandRange(units, 3, 'sentence', 20)
    assert.equal(textOf(units, first), `${clause};`, 'the band narrows to the clause at a semicolon')
    const second = bandRange(units, 15, 'sentence', 12)
    assert.equal(textOf(units, second), `${clause},`, 'a clause still longer than the cap splits again at its comma')
    assert.equal(textOf(units, bandRange(units, 25, 'sentence', 12)), `${clause}:`, 'a colon closes a clause')
    assert.equal(textOf(units, bandRange(units, 35, 'sentence', 12)), `${clause}.`)
    assert.deepEqual(bandRange(units, 3, 'sentence', 100), whole, 'a short enough sentence is not narrowed')
    assert.deepEqual(bandRange(units, 3, 'paragraph', 20), whole, 'paragraph bands are never narrowed')
}

{
    const words = ('one two three four five six seven eight nine ten, ' + 'a b c d e f g h i j, ' + 'k l m n o p q r s t.').split(' ')
    assert.deepEqual(narrowToClause(words, [0, words.length - 1], 12, 12), [10, 19], 'with no semicolon the comma splits the clause')
    assert.deepEqual(narrowToClause(words, [0, words.length - 1], 2, 12), [0, 9])
}

{
    const dashed = 'first part of the thing — second part of the thing — third part of the thing'
    const units = buildSpeechUnits(dashed)
    const words = units.words
    const middle = narrowToClause(words, [0, words.length - 1], 8, 6)
    assert.equal(textOf(units, middle), 'second part of the thing —', 'a lone dash closes a clause')
}

{
    const line = 'It is cold today. Dr. Weaver came by. He left a note. It was short. They read it twice. Nobody replied. The end came soon after all that. Nothing more happened. Then it rained all night long and into the morning.'
    const queue = [{ text: line, pause: 280, wordIndex: 0 }]
    const pieces = splitLongChunks(queue, { max: 12, min: 3 })
    const units = buildSpeechUnits(line)
    const pieceEnds = new Set(pieces.map((p) => p.wordIndex + p.text.split(/\s+/).length - 1))
    const unitEnds = new Set(units.sentences.map(([, end]) => end))
    for (const end of pieceEnds) assert.ok(unitEnds.has(end), 'every pause cut lands on a band unit boundary')
    assert.ok(!pieces.some((p) => p.text.endsWith('Dr.')), 'the abbreviation guard also stops a pause after Dr.')
}

{
    const text = 'Heading words\n\nA sentence that fills a line. And a second one.\nHard line two.'
    const units = buildSpeechUnits(text)
    const queue = parseToQueue(text)
    const speechLines = queue.filter((c) => !c.isSilent).map((c) => c.text)
    const bandSegments = units.segments.map((range) => textOf(units, range))
    assert.deepEqual(speechLines, bandSegments, 'the lines the voice pauses between are exactly the band walls')
}

assert.equal(endsSentence(['Done.'], 0), true, 'the last word of the text always closes')
assert.equal(endsSentence(['plain', 'word'], 0), false)

console.log('speechUnits ok')
