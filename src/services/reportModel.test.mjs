import assert from 'node:assert'
import { buildWordReport, clampReport, wordLang } from './reportModel.js'

assert.strictEqual(wordLang('رَفْع'), 'ar', 'Arabic script is detected')
assert.strictEqual(wordLang('sound'), 'en', 'Latin script is detected')
assert.strictEqual(wordLang('1997'), 'other', 'digits are neither')

const words = 'Say this word لَفْظ slowly so every sound in it comes through clearly today'.split(' ')
const report = buildWordReport({ words, index: 3, voice: 'Hoda', rate: 1.2, sourceKind: 'pdf', appBuild: 'production' })
assert.strictEqual(report.word, 'لَفْظ', 'the reported word is the one under the cursor')
assert.strictEqual(report.lang, 'ar', 'language follows the word, not the document')
assert.strictEqual(report.context, 'Say this word لَفْظ slowly so every sound in it', 'context is six words each side, clipped at the start')
assert.strictEqual(report.word_index, 3)
assert.strictEqual(report.report_type, 'mispronounced')
assert.ok(!('client_id' in report), 'reports carry no device number')
assert.strictEqual(report.note, null, 'no note becomes null, never an empty string')

const noted = buildWordReport({ words, index: 3, note: '  the ظ sounds like ز  ', reportType: 'missing' })
assert.strictEqual(noted.note, 'the ظ sounds like ز', 'the note is trimmed')
assert.strictEqual(noted.report_type, 'missing', 'the report type follows the caller')
assert.strictEqual(buildWordReport({ words, index: 3, note: 'x'.repeat(900) }).note.length, 500, 'a runaway note is clipped to the column limit')

const band = buildWordReport({ words, index: 3, reportType: 'highlight', unitText: 'Say this word لَفْظ slowly so every sound in it comes through clearly today' })
assert.strictEqual(band.report_type, 'highlight', 'a wrong highlight reports under the existing highlight type')
assert.strictEqual(band.context, 'Say this word لَفْظ slowly so every sound in it comes through clearly today', 'a highlight report carries the whole current unit as context')
assert.strictEqual(buildWordReport({ words, index: 3, reportType: 'highlight' }).context, report.context, 'without a unit the nearby words stand in')
assert.strictEqual(buildWordReport({ words, index: 3, unitText: 'ignored unit' }).context, report.context, 'other report types keep the nearby words')
assert.strictEqual(buildWordReport({ words, index: 3, reportType: 'highlight', unitText: 'y'.repeat(900) }).context.length, 600, 'a long unit is clipped to the context limit')

assert.strictEqual(buildWordReport({ words, index: 99 }), null, 'an index past the end reports nothing')
assert.strictEqual(buildWordReport({ words: [], index: 0 }), null, 'an empty document reports nothing')

const tail = buildWordReport({ words, index: words.length - 1, sourceKind: 'text' })
assert.ok(tail.context.endsWith('today'), 'context clips cleanly at the end')
assert.strictEqual(buildWordReport({ words: ['x'.repeat(250)], index: 0 }).word.length, 200, 'a runaway word is clipped to the column limit')

const dirty = clampReport({ client_id: 'x', report_type: 'mispronounced', word: '\u0000igure', context: 'see \u0001the\u0000 \u007Ffigure\there\nnow', note: 'a\u0008b', voice: '\u0000', source_kind: 'pdf\u0000', app_build: null, lang: 'en' })
assert.strictEqual(dirty.word, 'igure', 'a NUL left by an unmapped glyph is removed from the word')
assert.strictEqual(dirty.context, 'see the figure\there\nnow', 'control characters go, tab and newline stay')
assert.strictEqual(dirty.note, 'ab')
assert.strictEqual(dirty.voice, '', 'a field that was only control characters becomes empty')
assert.strictEqual(dirty.source_kind, 'pdf')
assert.strictEqual(dirty.app_build, null)
assert.strictEqual(clampReport({ word: '\u0000\u0000' }).word, '?', 'a word that was only control characters stays a valid report')
assert.strictEqual(clampReport({ word: '\u0000' + 'x'.repeat(250) }).word.length, 200, 'limits apply after stripping')

console.log('OK — word reports carry the word, its language, and a clipped context window')
