import assert from 'node:assert'
import { pageFromItems } from './pageModel.js'

const line = (str, y, x, width, h = 12) => ({ str, transform: [h, 0, 0, h, x, y], width, height: h })
const full = (y, tag) => line(`${tag} wrapped words fill this whole line number alpha beta gamma`, y, 72, 428)
const body = (top) => Array.from({ length: 5 }, (_, i) => full(top - i * 14, 'body'))
const textOf = (items) => pageFromItems(1, items, 612, 792).text

{
    const text = textOf([...body(700), line('A Long Centred Title Across', 560, 106, 360), line('Two More Lines', 546, 186, 200), ...body(500)])
    assert.ok(/Across\s+Two More Lines/.test(text) && !/Across\s*\n/.test(text), 'centred title lines stay together')
}

{
    const text = textOf([...body(700), line('A Long Centred Title Across', 560, 106, 360), line('Two More Lines', 546, 150, 200), ...body(500)])
    assert.ok(/Across\s*\n+\s*Two More Lines/.test(text), 'an off-centre shift still pauses')
}

{
    const text = textOf([...body(700), line('A Long Centred Statement Ends.', 560, 106, 360), line('Two More Lines', 546, 186, 200), ...body(500)])
    assert.ok(/Ends\.\s*\n+\s*Two More Lines/.test(text), 'a sentence end still pauses')
}

{
    const text = textOf([...body(700), line('1. Item text one goes here', 560, 106, 360), line('2. Second', 546, 186, 200), ...body(500)])
    assert.ok(/here\s*\n+\s*2\./.test(text), 'list items still pause')
}
const pairText = (first, second, { firstAt = [106, 360], secondAt = [186, 200], gap = 14, secondH = 12 } = {}) =>
    textOf([...body(700), line(first, 560, firstAt[0], firstAt[1]), line(second, 560 - gap, secondAt[0], secondAt[1], secondH), ...body(500)])
const stayTogether = (text, tail) => !text.includes(`${tail}\n`)

{
    const text = pairText('A Long Centred Title Across', 'Tight Label Words', { gap: 8 })
    assert.ok(/Across\s*\n+\s*Tight/.test(text), 'tightly stacked labels still pause')
}

{
    const text = pairText('A Long Centred Title Across', 'Tiny Tag Here', { secondAt: [236, 60] })
    assert.ok(/Across\s*\n+\s*Tiny/.test(text), 'a much narrower next line still pauses')
}

{
    const text = pairText('Two Words', 'Another Short Line', { firstAt: [186, 200], secondAt: [216, 140] })
    assert.ok(/Words\s*\n+\s*Another/.test(text), 'a very short first line still pauses')
}

{
    const text = pairText('A Long Centred Title Across', 'Heading', { secondAt: [236, 100] })
    assert.ok(/Across\s*\n+\s*Heading/.test(text), 'a lone mixed-case word still pauses')
}

{
    const text = pairText('A LONG CENTRED TITLE ACROSS', 'THE PAGE')
    assert.ok(stayTogether(text, 'ACROSS'), 'a short upper-case second line joins an upper-case title')
}

{
    const text = pairText('A Long Centred Title Across', '(Optional Bracketed Words)')
    assert.ok(/Across\s*\n+\s*\(Optional/.test(text), 'an opening bracket still pauses')
}

{
    const text = pairText('A Long Centred Title Across', 'عنوان فرعي طويل هنا')
    assert.ok(/Across\s*\n+\s*عنوان/.test(text), 'a script change still pauses')
}

{
    const text = pairText('A Long Centred Title Across:', 'Two More Lines')
    assert.ok(/Across:\s*\n+\s*Two/.test(text), 'a colon still pauses')
}

console.log('OK')
