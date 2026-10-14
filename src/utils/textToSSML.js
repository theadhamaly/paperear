import { endsSentence } from './speechUnits.js'






export function sliceTextFromWord(text, wordIndex) {
    if (!text || wordIndex <= 0) return text || ''
    const re = /\S+/g
    let m, count = 0
    while ((m = re.exec(text)) !== null) {
        if (count === wordIndex) return text.slice(m.index)
        count++
    }
    return ''
}

export function parseToQueue(text, opts = {}) {
  const linePause = Number.isFinite(opts.linePause) ? opts.linePause : 280
  const paragraphPause = Number.isFinite(opts.paragraphPause) ? opts.paragraphPause : 800
  const queue = [];
  let currentWordIndex = 0;
  

  const paragraphs = text.split(/\n\s*\n/);
  
  paragraphs.forEach(para => {
    const trimmedPara = para.trim();
    if (!trimmedPara) return;


    if (/^(Chapter|Part|Book)\s+\d+/i.test(trimmedPara)) {
      queue.push({ 
        text: trimmedPara, 
        pause: 1500,
        rate: 0.9,
        pitch: 1.0,
        wordIndex: currentWordIndex
      });

      currentWordIndex += trimmedPara.split(/\s+/).length;
      return;
    }





    const parts = para.split(/([^\s"]*".*?"\S*)/g);

    let buffer = '';
    const flushNarration = () => {
      const t = buffer.trim();
      buffer = '';
      if (!t) return;
      const lines = t.split('\n').map((l) => l.trim()).filter(Boolean);
      lines.forEach((line, i) => {
        queue.push({ text: line, pause: i < lines.length - 1 ? linePause : Math.min(150, linePause), pitch: 1.0, rate: 1.0, wordIndex: currentWordIndex });
        currentWordIndex += line.split(/\s+/).length;
      });
    };

    parts.forEach((part, i) => {
      if (!part) return;
      const trimmedPart = part.trim();
      const isQuote = i % 2 === 1;
      const wordCount = trimmedPart.split(/\s+/).filter(Boolean).length;
      if (isQuote && wordCount >= 4) {
        flushNarration();
        queue.push({ text: trimmedPart, pause: 250, pitch: 1.2, rate: 1.0, wordIndex: currentWordIndex });
        currentWordIndex += wordCount;
      } else {
        buffer += part;
      }
    });
    flushNarration();


    queue.push({ text: "", pause: paragraphPause, isSilent: true, wordIndex: currentWordIndex });
  });
  
  return queue;
}


const wordScript = (w) => (/[؀-ۿ]/.test(w) ? 'ar' : /[A-Za-z]/.test(w) ? 'en' : null)


const AR_MARK = /[ً-ٰٕ]/
const KEEPS_BARE_AT_WAQF = /[اويىآأإةء]/

export function applyWaqf(text) {
    const words = text.split(/(\s+)/)
    for (let i = words.length - 1; i >= 0; i--) {
        const w = words[i]
        if (!w.trim() || !/[؀-ۿ]/.test(w)) continue
        const core = w.replace(new RegExp(`${AR_MARK.source}+$`), '')
        const last = core[core.length - 1]
        if (!last) break
        words[i] = KEEPS_BARE_AT_WAQF.test(last) ? core : core + 'ْ'
        break
    }
    return words.join('')
}

export function splitQueueByScript(queue, opts = {}) {
    const keep = opts.keep
    const only = opts.only === 'ar' || opts.only === 'en' ? opts.only : null
    const out = []
    for (const chunk of queue) {
        if (chunk.isSilent || !chunk.text) { out.push(chunk); continue }
        const words = chunk.text.split(/\s+/).filter(Boolean)
        const scripts = words.map(wordScript)
        for (let i = 0; i < scripts.length; i++) {
            if (scripts[i] !== null) continue
            let left = null
            for (let j = i - 1; j >= 0; j--) if (scripts[j] !== null) { left = scripts[j]; break }
            let right = null
            for (let j = i + 1; j < scripts.length; j++) if (scripts[j] !== null) { right = scripts[j]; break }
            scripts[i] = (left === 'ar' && right === 'ar') ? 'ar' : 'en'
        }
        const runs = []
        for (let i = 0; i < words.length; i++) {
            const last = runs[runs.length - 1]
            if (last && last.script === scripts[i]) last.words.push(words[i])
            else runs.push({ script: scripts[i], words: [words[i]] })
        }
        const stripStops = (s) => s.replace(/[.,!?;:،؛؟…\s]+$/u, '')
        const isPickedSpelling = (t) => {
            if (!keep || !keep.size) return false
            const tail = stripStops(t.trim())
            for (const picked of keep) {
                const bare = stripStops(picked)
                if (bare && (tail === bare || tail.endsWith(' ' + bare))) return true
            }
            return false
        }
        const arSpeech = (t) => {
            if (isPickedSpelling(t)) return t.trim()
            const bare = t.replace(/^[^؀-ۿ]+/, '').replace(/[^؀-ۿ]+$/, '').replace(/[،؛]+$/, '')
            if (!bare) return t
            if (/[.!?؟…]\s*$/.test(bare)) return bare
            return applyWaqf(bare) + '.'
        }
        const silenced = (script) => only && script && script !== only
        if (runs.length <= 1) {
            const lang = runs[0]?.script || null
            if (silenced(lang)) {
                out.push({ ...chunk, text: '', lang, isSilent: true, skippedWords: words.length })
                continue
            }
            const text = lang === 'ar' && words.length <= 2 ? arSpeech(chunk.text) : chunk.text
            out.push({ ...chunk, text, lang })
            continue
        }
        let idx = chunk.wordIndex
        runs.forEach((run, i) => {
            const text = run.words.join(' ')
            const pause = i === runs.length - 1 ? chunk.pause : 0
            if (silenced(run.script)) {
                out.push({ ...chunk, text: '', wordIndex: idx, lang: run.script, pause, isSilent: true, skippedWords: run.words.length })
            } else {
                out.push({
                    ...chunk,
                    text: run.script === 'ar' ? arSpeech(text) : text,
                    wordIndex: idx,
                    lang: run.script,
                    pause,
                })
            }
            idx += run.words.length
        })
    }
    return out
}


export function parseToSSML(text) {


  let ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">\n`;


  text = text.replace(/\r\n/g, '\n');




  text = text.replace(/^((?:Chapter|Part|Book)\s+\w+.*)$/gim, 
    '<break time="1s"/><emphasis level="strong">$1</emphasis><break time="500ms"/>');





  text = text.replace(/"([^"]+)"/g, 
    '<prosody pitch="+5%">"$1"</prosody>');




  text = text.replace(/\n\s*\n/g, '<break time="800ms"/>\n');




  text = text.replace(/^(\s*[-*•]|\d+\.)\s+(.*)$/gm, 
    '<break time="300ms"/>$1 $2');







  ssml += text + "\n</speak>";

  return ssml;
}


export function stripSSML(ssml) {
  return ssml.replace(/<[^>]+>/g, '');
}


export function mergeShortChunks(queue, { min = 220, max = 600 } = {}) {
    const countWords = (s) => s.trim().split(/\s+/).filter(Boolean).length
    const closed = (s) => /[.!?\u2026:;\u060C\u061B\u061F]["'\u201D\u2019)]*\s*$/.test(s)
    const out = []
    for (const chunk of queue || []) {
        const last = out[out.length - 1]
        const joinable = !!last && !last.isSilent && !chunk.isSilent && !!last.text && !!chunk.text
            && last.lang === chunk.lang && (last.rate || 1) === (chunk.rate || 1)
            && last.wordIndex !== undefined && chunk.wordIndex === last.wordIndex + countWords(last.text)
            && last.text.length < min && last.text.length + chunk.text.length <= max
        if (joinable) out[out.length - 1] = { ...last, text: last.text + (closed(last.text) ? ' ' : '. ') + chunk.text, pause: chunk.pause }
        else out.push({ ...chunk })
    }
    return out
}

export function mergeLoneShortChunks(queue, { maxWords = 2 } = {}) {
    const countWords = (s) => s.trim().split(/\s+/).filter(Boolean).length
    const speakable = (c) => !!c && !c.isSilent && !!c.text && c.wordIndex !== undefined
    const adjacent = (a, b) => speakable(a) && speakable(b) && a.lang === b.lang
        && (a.rate || 1) === (b.rate || 1) && b.wordIndex === a.wordIndex + countWords(a.text)
    const items = [...(queue || [])]
    const out = []
    for (let i = 0; i < items.length; i++) {
        const chunk = items[i]
        if (!speakable(chunk) || countWords(chunk.text) > maxWords) { out.push(chunk); continue }
        let nextIndex = i + 1
        while (items[nextIndex] && items[nextIndex].isSilent) nextIndex++
        const next = items[nextIndex]
        if (adjacent(chunk, next)) {
            items.splice(i + 1, nextIndex - i - 1)
            items[i + 1] = { ...chunk, text: chunk.text + ' ' + next.text, pause: next.pause }
            continue
        }
        if (!next) {
            let lastIndex = out.length - 1
            while (lastIndex >= 0 && out[lastIndex].isSilent) lastIndex--
            const last = out[lastIndex]
            if (adjacent(last, chunk)) {
                out.length = lastIndex + 1
                out[lastIndex] = { ...last, text: last.text + ' ' + chunk.text, pause: chunk.pause }
                continue
            }
        }
        out.push(chunk)
    }
    return out
}

const SOFT_BREAK = /[,;:،؛]["'”’)»]*$/

export function splitLongChunks(queue, { max = 28, min = 4 } = {}) {
    const out = []
    for (const chunk of queue || []) {
        const words = chunk.isSilent || !chunk.text ? [] : chunk.text.trim().split(/\s+/).filter(Boolean)
        if (words.length <= max || chunk.wordIndex === undefined) { out.push(chunk); continue }
        const pieces = []
        let start = 0
        let soft = -1
        for (let i = 0; i < words.length; i++) {
            const length = i - start + 1
            if (endsSentence(words, i) && length >= min) {
                pieces.push([start, i])
                start = i + 1
                soft = -1
                continue
            }
            if (SOFT_BREAK.test(words[i]) && length >= min) soft = i
            if (length >= max) {
                const cut = soft >= start ? soft : i
                pieces.push([start, cut])
                start = cut + 1
                soft = -1
            }
        }
        if (start < words.length) pieces.push([start, words.length - 1])
        pieces.forEach(([a, b], k) => out.push({
            ...chunk,
            text: words.slice(a, b + 1).join(' '),
            wordIndex: chunk.wordIndex + a,
            pause: k === pieces.length - 1 ? chunk.pause : 0,
        }))
    }
    return out
}
