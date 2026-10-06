export const langCode = (id) => String(id || '').split(/[_-]/)[0].toLowerCase()

const kindRank = (name) => (String(name).startsWith('piper:') ? 0 : String(name).startsWith('cloud:') ? 1 : 2)

export function voiceSections({ ready = [], catalog = [], stored = [], first = [] } = {}) {
    const has = new Set(stored)
    const byLang = new Map()
    const other = []
    const slot = (code) => {
        if (!byLang.has(code)) byLang.set(code, { code, ready: [], free: [] })
        return byLang.get(code)
    }
    for (const code of first) slot(code)
    for (const v of ready) {
        const code = langCode(v.lang || (String(v.name || '').startsWith('piper:') ? v.name.slice(6) : ''))
        if (code) slot(code).ready.push(v)
        else other.push(v)
    }
    for (const v of catalog) if (!has.has(v.id)) slot(langCode(v.id)).free.push(v)
    for (const section of byLang.values()) section.ready.sort((a, b) => kindRank(a.name) - kindRank(b.name))
    const rank = (code) => {
        const i = first.indexOf(code)
        return i === -1 ? first.length : i
    }
    return { list: [...byLang.values()].sort((a, b) => rank(a.code) - rank(b.code) || a.code.localeCompare(b.code)), other }
}

export function languageName(code, uiLang) {
    try { return new Intl.DisplayNames([uiLang || 'en'], { type: 'language' }).of(code) || code } catch { return code }
}

const QUALITY_ORDER = { x_low: 0, low: 1, medium: 2, high: 3 }

export function lightestVoiceFor(catalog, code) {
    const options = (catalog || []).filter((v) => langCode(v.id) === code)
    const rank = (v) => QUALITY_ORDER[v.quality] ?? 4
    options.sort((a, b) => rank(a) - rank(b) || (a.bytes || 0) - (b.bytes || 0) || a.id.localeCompare(b.id))
    return options[0] || null
}

export const RECOMMENDED_VOICES = { en: ['en_US-norman-medium', 'en_US-mike-medium', 'en_US-libritts_r-medium'] }

export function offeredVoiceFor(catalog, code) {
    const offered = (RECOMMENDED_VOICES[code] || []).map((id) => (catalog || []).find((v) => v.id === id)).find(Boolean)
    return offered || lightestVoiceFor(catalog, code)
}

export const voiceReads = (voice, code) => langCode(voice.lang || (String(voice.name || '').startsWith('piper:') ? voice.name.slice(6) : '')) === code

const HIDDEN_MARKS = /[ـ؜‍-‏‪-‮⁦-⁩﻿]/gu

export function previewSample(text, voiceLang, docLang, n = 14) {
    if (!docLang || !langCode(voiceLang) || langCode(voiceLang) !== langCode(docLang)) return ''
    return String(text || '').slice(0, 400).normalize('NFKC').replace(HIDDEN_MARKS, '').trim().split(/\s+/).filter(Boolean).slice(0, n).join(' ')
}
