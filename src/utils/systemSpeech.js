const native = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null

const inert = {
    onvoiceschanged: null,
    speaking: false,
    pending: false,
    paused: false,
    getVoices: () => [],
    cancel: () => { },
    speak: () => { },
    pause: () => { },
    resume: () => { },
}

export const hasSystemSpeech = Boolean(native) && typeof SpeechSynthesisUtterance !== 'undefined'

export const systemSpeech = native || inert

export const createUtterance = (text) => (hasSystemSpeech ? new SpeechSynthesisUtterance(text) : null)
