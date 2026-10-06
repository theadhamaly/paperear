import { languageName } from './voiceGroups.js'
export const isOpenVoice = (name) => typeof name === 'string' && name.startsWith('piper:')
export const isKeyVoice = (name) => typeof name === 'string' && name.startsWith('cloud:')

const langOfOpen = (name) => name.slice('piper:'.length, 'piper:'.length + 2).toLowerCase()

export function preferredOpenVoice({ selected, pinned, docLang, downloaded }) {
    if (pinned || isKeyVoice(selected)) return null
    const want = !docLang || docLang === 'unknown' ? 'en' : docLang
    if (isOpenVoice(selected) && langOfOpen(selected) === want) return null
    const match = (downloaded || []).find((v) => isOpenVoice(v.name) && langOfOpen(v.name) === want)
    return match && match.name !== selected ? match.name : null
}

export function groupVoices(voices) {
    const groups = { open: [], key: [], browser: [] }
    for (const v of voices || []) groups[isOpenVoice(v.name) ? 'open' : isKeyVoice(v.name) ? 'key' : 'browser'].push(v)
    return groups
}

export function dropAliasVoices(voices) {
    const names = new Set((voices || []).map((v) => v.name))
    return (voices || []).filter((v) => !v.voiceURI || v.voiceURI === v.name || !names.has(v.voiceURI))
}

export function describeVoice(voice, uiLang = 'en') {
    const name = voice?.name || ''
    if (isOpenVoice(name)) {
        const [title, ...rest] = String(voice.label || name.slice('piper:'.length)).split(' · ')
        return { kind: 'open', title, detail: rest.join(' · ') }
    }
    if (isKeyVoice(name)) return { kind: 'key', title: voice.label || name.split(':').pop(), detail: name.split(':')[1] || '' }
    const m = name.match(/^(Microsoft|Google|Apple)\s+(.+?)\s+-\s+(.+)$/)
    if (m) return { kind: 'browser', title: m[2], detail: `${voice.lang ? languageName(voice.lang, uiLang) : m[3]} · ${m[1]}` }
    return { kind: 'browser', title: name, detail: voice?.lang || '' }
}

export function voiceBars(seed, count = 14) {
    let h = 2166136261
    for (const ch of String(seed || '')) h = Math.imul(h ^ ch.codePointAt(0), 16777619)
    const bars = []
    for (let i = 0; i < count; i++) {
        h = Math.imul(h ^ (h >>> 13), 1597334677)
        const wave = Math.sin((i / (count - 1)) * Math.PI)
        bars.push(Math.round((0.25 + 0.75 * wave * (0.45 + ((h >>> 0) % 1000) / 1818)) * 100) / 100)
    }
    return bars
}

const NOVELTY_VOICES = new Set(['albert', 'bad news', 'bahh', 'bells', 'boing', 'bubbles', 'cellos', 'good news', 'jester', 'organ', 'superstar', 'trinoids', 'whisper', 'wobble', 'zarvox', 'deranged', 'hysterical', 'pipe organ'])

const isNoveltyVoice = (name) => NOVELTY_VOICES.has(String(name || '').replace(/\s*\(.*\)\s*$/, '').trim().toLowerCase())

export const usableSystemVoices = (voices) => dropAliasVoices(voices).filter((v) => !/google/i.test(`${v.name} ${v.voiceURI || ''}`) && !isNoveltyVoice(v.name))
