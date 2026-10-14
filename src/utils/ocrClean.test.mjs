import assert from 'node:assert/strict'
import { cleanOcrItems, isArtPage, groupLines, leadScript, scriptOf } from './ocrClean.js'
import { mergeBilingual, langOfItems } from '../services/ocr.js'

const word = (str, conf, x, y, w = 40, h = 12, fontName = 'ocr') => ({ str, conf, transform: [h, 0, 0, h, x, y], width: w, height: h, fontName })
const row = (y, pairs) => pairs.map(([str, conf], i) => word(str, conf, 20 + i * 50, y))
const kept = (items, opts) => cleanOcrItems(items, opts).map((it) => it.str)
const sameSet = (a, b) => assert.deepEqual([...a].sort(), [...b].sort())

{
    assert.equal(scriptOf('BLAKE'), 'lat')
    assert.equal(scriptOf('الوهاب'), 'ar')
    assert.equal(scriptOf('١٢'), '')
    assert.equal(groupLines([word('a', 90, 0, 0), word('b', 90, 50, 0)]).length, 1)
    assert.equal(groupLines([word('a', 90, 0, 0), word('b', 90, 400, 0)]).length, 2)
    assert.equal(groupLines([word('a', 90, 0, 0), word('b', 90, 0, 100)]).length, 2)
}

{
    const cover = [
        ...row(700, [['NOTES', 93], ['ON', 95], ['STARTUPS,', 92], ['OR', 96]]),
        ...row(650, [['Peter', 96], ['Thiel', 93]]),
        ...row(600, [['ج', 54], ['“ام', 76], ['MASTERS', 92]]),
        word('4', 90, 400, 300),
        word('ض', 91, 100, 200),
        word('الله', 64, 300, 100),
    ]
    sameSet(kept(cover), ['NOTES', 'ON', 'STARTUPS,', 'OR', 'Peter', 'Thiel', 'MASTERS'])
}

{
    const junk = Array.from({ length: 60 }, (_, i) => word(['الال', 'نباي', 'لا', 'ال', 'سر'][i % 5], 20 + (i % 50), (i * 37) % 500, (i * 53) % 700))
    assert.deepEqual(kept(junk, { vouch: (s) => s === 'الال' }), [])
}

{
    const credit = [
        ...row(100, [['تحقيق', 68], ['حسن', 91], ['حسني', 49], ['عبد', 93], ['الوهاب', 89]]),
        ...row(400, [['التبصر', 86], ['بالتجارة', 74]]),
        word('RTH', 44, 300, 250),
        word('N', 79, 100, 300),
        word('LIEN', 27, 20, 330),
        word('1', 60, 200, 600),
        word('في', 51, 200, 200),
    ]
    sameSet(kept(credit), ['تحقيق', 'حسن', 'حسني', 'عبد', 'الوهاب', 'التبصر', 'بالتجارة'])
}

{
    const body = []
    for (let n = 0; n < 8; n++) body.push(...row(700 - n * 20, [['الكلمة', 88], ['الثانية', 75], ['كتابة', 92], ['في', 48], ['من', 35], ['و', 66]]))
    body.push(...row(500, [['كتابة', 90], ['ا', 22], ['١', 30], ['gill', 64], ['الكلمة', 85]]))
    body.push(word('i', 57, 2, 640, 3, 16))
    const out = kept(body)
    assert.ok(out.includes('في'))
    assert.ok(out.includes('من'))
    assert.ok(out.includes('و'))
    assert.ok(!out.includes('ا'))
    assert.ok(!out.includes('١'))
    assert.ok(!out.includes('gill'))
    assert.ok(!out.includes('i'))
}

{
    const mixed = []
    for (let n = 0; n < 6; n++) mixed.push(...row(700 - n * 20, [['The', 95], ['second', 96], ['radical', 94], ['is', 91]]))
    mixed.push(...row(560, [['from', 96], ['زال', 86], ['يزول', 83], ['طال', 45]]))
    const out = kept(mixed)
    assert.ok(out.includes('زال'))
    assert.ok(out.includes('يزول'))
    assert.ok(out.includes('طال'))
}

{
    const list = []
    for (let n = 1; n <= 5; n++) list.push(...row(700 - n * 20, [[`${n}.`, 85], ['Pictures', 95], ['of', 96], ['several', 95]]))
    assert.equal(kept(list).filter((s) => /^\d\.$/.test(s)).length, 5)
}

{
    const hybrid = [
        ...Array.from({ length: 10 }, (_, i) => word('English', 95, 20 + i * 50, 700, 40, 12, 'Times')),
        word('رفع', 20, 20, 600),
        word('بلا', 35, 80, 600),
    ]
    const out = kept(hybrid, { vouch: (s) => s === 'رفع' })
    assert.ok(out.includes('رفع'))
    assert.ok(out.includes('بلا'))
}

{
    const sacred = { ...word('بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ', 99, 100, 400, 200, 30), fontName: 'basmala' }
    const art = [sacred, word('ذ', 42, 10, 10), word('bv', 36, 300, 50), word('dt]', 38, 200, 700)]
    assert.deepEqual(kept(art), [sacred.str])
}

{
    const noise = Array.from({ length: 200 }, (_, i) => word(['a', 'i', 'Es', 'ال', 'اا', '1'][i % 6], 15 + (i % 25), (i * 29) % 500, (i * 41) % 700))
    const cover = [...noise, ...row(760, [['HOW', 92], ['MONEY', 95], ['WORKS', 90]])]
    assert.equal(isArtPage(cover), true)
    sameSet(kept(cover), ['HOW', 'MONEY', 'WORKS'])
    assert.equal(kept([word('ا', 10, 0, 0), word('ب', 12, 60, 0)]).length, 0)
}

{
    const en = [word('NOTES', 93, 0, 100), word('STARTUPS', 92, 60, 100), word('BLAKE', 96, 100, 0, 50)]
    const ar = [word('“ام', 76, 100, 0, 50)]
    assert.equal(leadScript(en, ar), 'lat')
    const merged = mergeBilingual(en, ar).map((it) => it.str)
    assert.ok(merged.includes('BLAKE'))
    assert.ok(!merged.includes('“ام'))
}

{
    const ar = [word('الكلمة', 90, 0, 200), word('كتابة', 92, 60, 200), word('الذى', 28, 0, 100)]
    const en = [word('gill', 64, 0, 100)]
    assert.equal(leadScript(en, ar), 'ar')
    const merged = mergeBilingual(en, ar).map((it) => it.str)
    assert.ok(merged.includes('الذى'))
    assert.ok(!merged.includes('gill'))
}

{
    const en = [word('word', 80, 0, 0), word('English', 90, 0, 300), word('text', 88, 60, 300)]
    const ar = [word('كلمة', 65, 0, 0), word('الكلمة', 90, 0, 200), word('كتابة', 92, 60, 200)]
    assert.equal(leadScript(en, ar), '')
    const merged = mergeBilingual(en, ar).map((it) => it.str)
    assert.ok(merged.includes('كلمة'))
    assert.ok(!merged.includes('word'))
}

{
    const coverJunk = Array.from({ length: 30 }, (_, i) => word(['SIG', 'CLS', 'الال', 'Maw'][i % 4], 30 + (i % 30), i * 10, 0))
    assert.equal(langOfItems(coverJunk), null)
    const body = Array.from({ length: 12 }, () => word('الكلمة', 88, 0, 0))
    assert.equal(langOfItems([...body, ...coverJunk]), 'ara')
    const english = Array.from({ length: 10 }, () => word('reading', 91, 0, 0))
    assert.equal(langOfItems(english), 'eng')
}

{
    const en = []
    for (let n = 0; n < 8; n++) en.push(...row(700 - n * 20, [['another', 94], ['page', 95], ['of', 96], ['dense', 93], ['text', 94]]))
    const ar = [word('الكتب', 82, 20, 700), word('المدرسة', 84, 70, 680), word('بالقلم', 81, 120, 660)]
    const merged = mergeBilingual(en, ar).map((it) => it.str)
    assert.equal(merged.filter((s) => s === 'another').length, 8, 'confident English words survive Arabic hallucinations on a dense English page')
    assert.ok(!merged.includes('الكتب') && !merged.includes('المدرسة') && !merged.includes('بالقلم'), 'the invented Arabic anchors are dropped')
}

{
    const contents = [
        ...row(700, [['الفصل', 88], ['الأول', 86], ['في', 55], ['البيان', 90]]),
        ...row(660, [['الفصل', 87], ['الثاني', 85], ['من', 50], ['الأدب', 91]]),
        word('ـ', 30, 400, 400),
    ]
    const out = kept(contents)
    for (const w of ['الفصل', 'الأول', 'في', 'البيان', 'الثاني', 'من', 'الأدب']) assert.ok(out.includes(w), `a short Arabic page keeps ${w}`)
    assert.ok(!out.includes('ـ'), 'the stray tatweel is dropped')
}

{
    const page = []
    for (let n = 0; n < 6; n++) page.push(...row(700 - n * 20, [['الكلمة', 88], ['الثانية', 85], ['كتابة', 92], ['في', 70]]))
    page.push(word('‎٠‏', 78, 20, 700), word('٠', 78, 20, 560), word('1', 70, 480, 400), word('٠', 44, 70, 700))
    page.push(...row(540, [['سنة', 90], ['1937', 86], ['الأدب', 91]]))
    const out = kept(page)
    assert.ok(!out.includes('٠') && !out.includes('‎٠‏'), 'a speck read as an Arabic zero is dropped, direction marks or not')
    assert.ok(!out.includes('1'), 'a lone digit in the margin is dropped')
    assert.ok(out.includes('1937'), 'a year inside a line of text is kept')
}

console.log('ocrClean ok')

{
    const { isUnreadableCover } = await import('./ocrClean.js')
    const garbage = [
        ...row(700, [['Xq', 31], ['lll', 22], ['Wv', 45], ['oo', 28]]),
        ...row(650, [['Hrtk', 40], ['zz', 20], ['Plmn', 52]]),
        ...row(600, [['Ab', 66], ['Cdefg', 61]]),
    ]
    assert.equal(isUnreadableCover(garbage, 1), true)
    assert.equal(isUnreadableCover(garbage, 3), false)
    const readable = [
        ...row(700, [['Quiet', 93], ['Harbour', 95], ['Stories', 92], ['Of', 96]]),
        ...row(650, [['Written', 96], ['By', 93], ['Someone', 94], ['Else', 95], ['Entirely', 91]]),
    ]
    assert.equal(isUnreadableCover(readable, 1), false)
    const fewWords = row(700, [['Quiet', 93], ['Harbour', 95], ['Stories', 92]])
    assert.equal(isUnreadableCover(fewWords, 2), true)
    const lowMedian = Array.from({ length: 12 }, (_, i) => word('Word' + i, i < 8 ? 72 : 20, 20 + i * 50, 700))
    assert.equal(isUnreadableCover(lowMedian, 1), false)
    const noisy = Array.from({ length: 30 }, (_, i) => word('Word' + i, i < 9 ? 75 : 30, 20 + i * 50, 700))
    assert.equal(isUnreadableCover(noisy, 1), true)
    assert.equal(isUnreadableCover([], 1), true)
}

{
    const { isJunkWord, confidentWords } = await import('./ocrClean.js')
    const known = confidentWords([[word('harbour', 90, 0, 0), word('harbour', 88, 0, 0), word('lanterns', 91, 0, 0)]])
    assert.ok(known.has('harbour') && !known.has('lanterns'))
    assert.equal(isJunkWord(word('Xq7z', 40, 0, 0), known), true)
    assert.equal(isJunkWord(word('tHxR', 45, 0, 0), known), true)
    assert.equal(isJunkWord(word('Sd', 32, 0, 0), known), true)
    assert.equal(isJunkWord(word('brtnks', 55, 0, 0), known), true)
    assert.equal(isJunkWord(word('w|th', 60, 0, 0), known), true)
    assert.equal(isJunkWord(word('the', 54, 0, 0), known), false)
    assert.equal(isJunkWord(word('harbour', 30, 0, 0), known), false)
    assert.equal(isJunkWord(word('Xq7z', 92, 0, 0), known), false)
    assert.equal(isJunkWord(word('I', 60, 0, 0), known), false)
    assert.equal(isJunkWord(word('ل', 36, 0, 0), known), true)
    assert.equal(isJunkWord(word('ممم', 50, 0, 0), known), true)
    assert.equal(isJunkWord(word('من', 35, 0, 0), known), false)
    assert.equal(isJunkWord(word('كتاب', 30, 0, 0), known), false)
    assert.equal(isJunkWord(word('ب', 36, 0, 0), known, 'lat'), true)

    const page = []
    for (let n = 0; n < 8; n++) page.push(...row(700 - n * 20, [['The', 95], ['quiet', 96], ['harbour', 94], ['lantern', 91]]))
    page.push(...row(520, [['Sd', 32], ['harbour', 40], ['Xq7z', 38], ['ل', 50], ['lanterns', 88]]))
    const out = kept(page, { known })
    assert.ok(out.includes('harbour'))
    assert.ok(out.includes('lanterns'))
    assert.ok(!out.includes('Sd'))
    assert.ok(!out.includes('Xq7z'))
    assert.ok(!out.includes('ل'))
}
