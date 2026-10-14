import { WPM_MIN, WPM_MAX, clampWpm } from './wpm.js'

export const PACE_KEY = 'paperear_voice_pace_v1'
export const BASE_WPM = 150
export const MIN_SAMPLE_WORDS = 6

const MAX_SAMPLE_WEIGHT = 60
const MAX_HISTORY_WORDS = 200
const SAMPLE_WPM_RANGE = [60, 450]

export const ENGINES = {
    piper: { prior: 165, min: 0.6, max: 1.8 },
    cloud: { prior: 155, min: 0.6, max: 1.8 },
    system: { prior: 170, min: 0.5, max: 2 },
    android: { prior: 160, min: 0.5, max: 2.5 },
}

export function paceKind(voiceName, { android = false } = {}) {
    if (typeof voiceName === 'string' && voiceName.startsWith('piper:')) return 'piper'
    if (typeof voiceName === 'string' && voiceName.startsWith('cloud:')) return 'cloud'
    return android ? 'android' : 'system'
}

export function readPaces(storage) {
    try {
        const parsed = JSON.parse(storage.getItem(PACE_KEY) || '{}')
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    } catch {
        return {}
    }
}

export function writePaces(storage, paces) {
    try { storage.setItem(PACE_KEY, JSON.stringify(paces)) } catch { return }
}

export function naturalWpm(paces, voiceId, kind) {
    const entry = paces?.[voiceId]
    if (entry && Number.isFinite(entry.wpm) && entry.wpm > 0) return entry.wpm
    return ENGINES[kind].prior
}

export function recordPace(paces, voiceId, { words, seconds, rate = 1 }) {
    if (!voiceId || !(words >= MIN_SAMPLE_WORDS) || !(seconds > 0) || !(rate > 0)) return paces
    const sample = (words / seconds) * 60 / rate
    if (sample < SAMPLE_WPM_RANGE[0] || sample > SAMPLE_WPM_RANGE[1]) return paces
    const previous = paces[voiceId]
    const weight = Math.min(words, MAX_SAMPLE_WEIGHT)
    if (!previous) return { ...paces, [voiceId]: { wpm: Math.round(sample * 10) / 10, words } }
    const priorWeight = Math.min(previous.words, MAX_HISTORY_WORDS)
    const wpm = (previous.wpm * priorWeight + sample * weight) / (priorWeight + weight)
    return { ...paces, [voiceId]: { wpm: Math.round(wpm * 10) / 10, words: previous.words + words } }
}

export function speedFor(targetWpm, natural, kind) {
    const { min, max } = ENGINES[kind]
    const raw = targetWpm / natural
    if (raw > max) return { rate: max, limited: 'max', limitWpm: Math.round(natural * max) }
    if (raw < min) return { rate: min, limited: 'min', limitWpm: Math.round(natural * min) }
    return { rate: raw, limited: null, limitWpm: null }
}

export function speechSpan(timings, duration) {
    if (Array.isArray(timings) && timings.length) {
        const span = timings[timings.length - 1].end - timings[0].start
        if (span > 0) return span
    }
    return duration > 0 ? duration : 0
}

export function startingWpm(paces, voiceId, kind) {
    return clampWpm(naturalWpm(paces, voiceId, kind), WPM_MIN, WPM_MAX)
}
