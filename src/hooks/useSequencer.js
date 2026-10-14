import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { buildSpeechUnits } from '../utils/speechUnits'
import { parseToQueue, splitQueueByScript, sliceTextFromWord, mergeShortChunks, mergeLoneShortChunks, splitLongChunks } from '../utils/textToSSML'
import { applyPronunciationOverrides, buildReadingModel, loadOverrides, protectedSpellings } from '../engine/index.js'
import { detectLanguage } from '../utils/languageDetector'
import { canResumeHeldAudio } from '../utils/resumePlan'
import { documentBusyReason } from '../utils/documentBusy'
import { buildPagesFromPdf, buildPagesFromText, buildPagesFromMarkdown, pageFromItems, recommendedBudget, rangeText, fitRange, joinPages, detectChrome, applyChromeSkip, applySkippable, detectPageNumbers, detectPromoLines, remapChromeToggleIndex, skipToggleRuns, shiftWindow, firstContentPage, blockCounts, markPageSkippable } from '../utils/pageModel'
import { isUnreadableCover } from '../utils/ocrClean'
import { recognizePages, prefetchPages, isScannedPage } from '../services/ocr'
import { withTablePages, carryAnnotations } from '../utils/tablePages'
import { isAllowedVoice, isDropped, isPiperVoice, piperId, piperLang, synthesize as piperSynthesize } from '../services/piperEngine'
import { isCloudVoice, synthesize as cloudSynthesize } from '../services/cloudVoices'
import { isDocx, isEpub, textFromDocx, textFromEpub } from '../utils/otherFormats'
import welcomeEn from '../content/welcome.en.md?raw'
import welcomeAr from '../content/welcome.ar.md?raw'
import i18n from '../i18n'
import { wordTimings } from '../utils/wordTimings'
import { detectRtlItems } from '../utils/blockModel'
import { languageName } from '../utils/voiceGroups'
import { usableSystemVoices } from '../utils/voicePreference'

const OCR_MAX_WINDOW = 20
const OCR_FIRST_WINDOW = 10
const OCR_AHEAD = 5
const SKIP_PASS_WORD_MS = 90
const SKIP_PASS_MAX_MS = 4000
import * as docStore from '../services/docStore'
import { track } from '../utils/track'
import { BASE_WPM, naturalWpm, paceKind, readPaces, recordPace, speechSpan, speedFor, startingWpm, writePaces } from '../utils/voicePace'
import { audibleSeconds } from '../utils/wavTrim'
import { systemSpeech, createUtterance } from '../utils/systemSpeech'
import { useTranslation } from 'react-i18next'
import { anchorAt, resolveSavedWord, savedPlaceFor, prunedRanges } from '../utils/savedPlace'





const READING_RULES_PRONUNCIATION = true


const readPauses = () => { try { return JSON.parse(localStorage.getItem('paperear_pauses') || '{}') } catch { return {} } }
const readMixedVoices = () => { try { return localStorage.getItem('paperear_mixed_voices') !== '0' } catch { return true } }
const readRanges = () => { try { return JSON.parse(localStorage.getItem('paperear_doc_ranges') || '{}') } catch { return {} } }
const getDocRange = (key) => readRanges()[key] || null
const saveDocRange = (key, from, to) => { try { const a = prunedRanges(readRanges(), key); a[key] = { from, to }; localStorage.setItem('paperear_doc_ranges', JSON.stringify(a)) } catch { } }
const readWords = () => { try { return JSON.parse(localStorage.getItem('paperear_doc_words') || '{}') } catch { return {} } }
const getDocWord = (id) => readWords()[id] || null
const saveDocWord = (id, from, to, word, anchor) => { try { const a = readWords(); a[id] = { from, to, word, anchor }; localStorage.setItem('paperear_doc_words', JSON.stringify(a)) } catch { } }

export function useSequencer(initialText = '') {
    const [text, setText] = useState(() => {
        if (initialText) return initialText;
        try {
            if (sessionStorage.getItem('paperear_entry_mode') === 'write') return localStorage.getItem('paperear_draft_text') || ''
            return ''
        } catch { return '' }
    })
    const { t } = useTranslation()


    useEffect(() => {
        try {
            if (sessionStorage.getItem('paperear_entry_mode') !== 'write') return
            localStorage.setItem('paperear_draft_text', text || '')
        } catch { }
    }, [text])


    const [playbackQueue, setPlaybackQueue] = useState([])
    const [queueIndex, setQueueIndex] = useState(0)
    const queueIndexRef = useRef(0)


    const [isPlaying, setIsPlaying] = useState(false)
    const [isPaused, setIsPaused] = useState(false)
    const [voices, setVoices] = useState([])
    const [selectedVoice, setSelectedVoice] = useState(() => {
        try { return localStorage.getItem('paperear_voice') || '' } catch { return '' }
    })
    useEffect(() => {
        try { localStorage.setItem('paperear_voice', selectedVoice || '') } catch { }
    }, [selectedVoice])
    const [playbackRate, setPlaybackRate] = useState(1.0)
    const [currentWPM, setCurrentWPM] = useState(150)
    const [isSliding, setIsSliding] = useState(false)
    const [userSetPosition, setUserSetPosition] = useState(false)
    const [isSpeedChanging, setIsSpeedChanging] = useState(false)
    const [isNavigating, setIsNavigating] = useState(false)
    const [navigationTimer, setNavigationTimer] = useState(null)
    const speedChangeTimerRef = useRef(null)
    const [sentences, setSentences] = useState([])
    const [words, setWords] = useState([])
    const [paragraphs, setParagraphs] = useState([])
    const [currentSentenceIndex, setCurrentSentenceIndex] = useState(0)
    const [currentWordIndex, setCurrentWordIndex] = useState(0)
    const [currentParagraphIndex, setCurrentParagraphIndex] = useState(0)
    const [currentUtterance, setCurrentUtterance] = useState(null)
    const [wordTimer, setWordTimer] = useState(null)
    const [notification, setNotification] = useState('')
    const [totalWords, setTotalWords] = useState(0)


    const [docPages, setDocPages] = useState([])
    const [docChrome, setDocChrome] = useState([])
    const [hasSkippable, setHasSkippable] = useState(false)
    const [docPagesRaw, setDocPagesRaw] = useState([])
    const [dropChrome, setDropChrome] = useState(() => {
        try { const v = localStorage.getItem('paperear_drop_chrome'); return v === null ? false : JSON.parse(v) } catch { return false }
    })
    const [docMeta, setDocMeta] = useState(null)
    const [pendingRange, setPendingRange] = useState(null)
    const [loadedPages, setLoadedPages] = useState(() => {
        try { return JSON.parse(localStorage.getItem('paperear_loaded_pages') || '[]') } catch { return [] }
    })
    const [docPdf, setDocPdf] = useState(null)
    const [ocrItemsByPage, setOcrItemsByPage] = useState({})
    const [ocrBusy, setOcrBusy] = useState(null)
    const [buffering, setBuffering] = useState(false)
    const [continuing, setContinuing] = useState(false)
    const [rangeLoading, setRangeLoading] = useState(false)
    const [docLoading, setDocLoading] = useState(() => {
        try {
            if (sessionStorage.getItem('paperear_entry_mode') !== 'read') return null
            const last = JSON.parse(localStorage.getItem('paperear_last_source') || 'null')
            return last?.kind === 'file' && last.id ? { name: String(last.id).replace(/:\d+$/, '') } : null
        } catch { return null }
    })
    const docPdfRef = useRef(null)
    const docIdRef = useRef('')
    const loadGenRef = useRef(0)
    const rangeRunRef = useRef(0)
    const ocrRunRef = useRef(0)

    useEffect(() => {
        try { localStorage.setItem('paperear_loaded_pages', JSON.stringify(loadedPages)) } catch { }
    }, [loadedPages])


    const currentSpeechStartIndex = useRef(0)
    const allowBoundaryUpdates = useRef(true)
    const rapidNavigationTimer = useRef(null)
    const keyRepeatTimer = useRef(null)
    const isKeyHeld = useRef(false)
    const manualSeekIntentTimer = useRef(null)
    const manualSeekUntilRef = useRef(0)
    const boundaryFallbackRef = useRef(null)
    const paceStorage = () => { try { return localStorage } catch { return null } }
    const pacesRef = useRef(null)
    if (pacesRef.current === null) pacesRef.current = readPaces(paceStorage())
    const [paces, setPaces] = useState(() => pacesRef.current)
    const isAndroid = typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent)
    const paceKindOf = (voiceId) => paceKind(voiceId, { android: isAndroid })
    const learnPace = (voiceId, sample) => {
        const next = recordPace(pacesRef.current, voiceId, sample)
        if (next === pacesRef.current) return
        pacesRef.current = next
        writePaces(paceStorage(), next)
        setPaces(next)
    }
    const voiceSpeed = (voiceId) => {
        const kind = paceKindOf(voiceId)
        return speedFor(currentPlaybackRateRef.current * BASE_WPM, naturalWpm(pacesRef.current, voiceId, kind), kind)
    }
    const seekHoldDelayTimerRef = useRef(null)
    const seekHoldIntervalRef = useRef(null)
    const keyboardSeekActiveRef = useRef(false)
    const pendingKeyboardSeekIndexRef = useRef(null)


    const currentTextRef = useRef(text)
    const currentWordsRef = useRef(words)
    const currentParagraphsRef = useRef(paragraphs)
    const currentIsPlayingRef = useRef(isPlaying)
    const currentIsPausedRef = useRef(isPaused)
    const currentWordIndexRef = useRef(currentWordIndex)
    const currentWPMRef = useRef(currentWPM)
    const currentSelectedVoiceRef = useRef(selectedVoice)
    const currentVoicesRef = useRef(voices)
    const currentPlaybackRateRef = useRef(playbackRate)
    const volumeRef = useRef(1)
    const startSequencerRef = useRef(null)
    const rapidNavigateRef = useRef(null)
    const skipForwardWordRef = useRef(null)
    const skipBackwardWordRef = useRef(null)
    const skipForwardParagraphRef = useRef(null)
    const skipBackwardParagraphRef = useRef(null)
    const debouncedSettingsChangeRef = useRef(null)
    const requestSeamlessApplyRef = useRef(null)
    const pendingSeamlessRef = useRef(false)
    const seamlessTimerRef = useRef(null)


    const playbackQueueRef = useRef([])
    const isPlayingRef = useRef(false)
    const loadedPagesRef = useRef([])
    const shiftTimerRef = useRef(null)
    const entitledRef = useRef(false)
    const resumeRef = useRef(false)
    const openingPlaceRef = useRef(null)
    const pendingPlaceRef = useRef(null)
    const [restoreTick, setRestoreTick] = useState(0)
    const restoredRef = useRef(false)
    const openGenRef = useRef(0)
    const isPausedRef = useRef(false)
    const isSeekingRef = useRef(false)
    const piperAudioRef = useRef(null)
    const piperTokenRef = useRef(0)
    const piperHoldRef = useRef(-1)
    const piperHoldWordRef = useRef(-1)





    const speedLimit = useMemo(() => {
        const voiceId = selectedVoice || 'default'
        const kind = paceKind(voiceId, { android: isAndroid })
        const speed = speedFor(currentWPM, naturalWpm(paces, voiceId, kind), kind)
        return speed.limited ? { kind: speed.limited, wpm: speed.limitWpm } : null
    }, [currentWPM, selectedVoice, paces, isAndroid])

    const wpmToRate = (wpm) => {
        const baseWPM = 150
        return wpm / baseWPM
    }

    const rateToWPM = (rate) => {
        const baseWPM = 150
        return Math.round(rate * baseWPM)
    }

    const handleWPMChange = (wpm) => {
        const newRate = wpmToRate(wpm)
        setCurrentWPM(wpm)
        setPlaybackRate(newRate)
        currentPlaybackRateRef.current = newRate
    }





    const chooseVoice = (name) => {
        setSelectedVoice(name)
        if (name) handleWPMChange(startingWpm(pacesRef.current, name, paceKindOf(name)))
    }

    useEffect(() => {
        const loadVoices = () => {
            const compatibleVoices = usableSystemVoices(systemSpeech.getVoices() || [])
            setNotification('')

            if (compatibleVoices.length > 0) {
                setVoices(compatibleVoices)


                if (isPiperVoice(currentSelectedVoiceRef.current) || isCloudVoice(currentSelectedVoiceRef.current)) return
                const stillValid = compatibleVoices.find(v => v.name === currentSelectedVoiceRef.current)
                if (stillValid) {
                    setSelectedVoice(stillValid.name)
                    return
                }

                const defaultVoice = compatibleVoices.find(v =>
                    /microsoft|samantha|alex|zira|david|mark/i.test(v.name)
                ) || compatibleVoices[0]

                setSelectedVoice(defaultVoice.name)
                return
            }


            setVoices([])
            setSelectedVoice('')
            setNotification('')
        }

        setCurrentWPM(rateToWPM(playbackRate))
        loadVoices()
        systemSpeech.onvoiceschanged = loadVoices
        return () => { systemSpeech.onvoiceschanged = null }
    }, [])





    useEffect(() => {
        if (!text.trim()) {
            if (isPlayingRef.current) {
                systemSpeech.cancel()
                stopWordTimer()
                setIsPlaying(false)
                setIsPaused(false)
                setCurrentUtterance(null)
            }
            setSentences([])
            setWords([])
            setParagraphs([])
            setCurrentSentenceIndex(0)
            setCurrentWordIndex(0)
            setCurrentParagraphIndex(0)
            setTotalWords(0)
            return
        }

        const wordArray = text.split(/\s+/).filter(word => word.length > 0)
        setSentences(buildSpeechUnits(text).sentences.map(([from, to]) => wordArray.slice(from, to + 1).join(' ')))
        setWords(wordArray)

        const paragraphArray = text.split(/\n{2,}/).filter(p => p.trim().length > 0)
        setParagraphs(paragraphArray)

        setTotalWords(wordArray.length)

        const wasEmpty = !currentTextRef.current || !currentTextRef.current.trim()
        const lengthDiff = Math.abs(text.length - (currentTextRef.current?.length || 0))
        const isMassiveChange = currentTextRef.current && lengthDiff > Math.max(1000, currentTextRef.current.length * 0.6)
        
        const pendingPlace = pendingPlaceRef.current
        pendingPlaceRef.current = null
        const targetIndex = pendingPlace
            ? resolveSavedWord(wordArray, pendingPlace)
            : (wasEmpty || isMassiveChange) ? 0 : Math.min(currentWordIndexRef.current, Math.max(0, wordArray.length - 1))
        
        setCurrentWordIndex(targetIndex)
        currentWordIndexRef.current = targetIndex
        if (pendingPlace && targetIndex > 0) setRestoreTick((n) => n + 1)

        if (isPlayingRef.current && !isPausedRef.current) {
            debouncedSettingsChangeRef.current?.()
        }
    }, [text])


    useEffect(() => {
        currentTextRef.current = text
        currentWordsRef.current = words
        currentParagraphsRef.current = paragraphs
        currentIsPlayingRef.current = isPlaying
        currentIsPausedRef.current = isPaused
        currentWordIndexRef.current = currentWordIndex
        loadedPagesRef.current = loadedPages
        currentWPMRef.current = currentWPM
        currentSelectedVoiceRef.current = selectedVoice
        currentVoicesRef.current = voices
        currentPlaybackRateRef.current = playbackRate
    })

    useEffect(() => {
        if (!isPlaying && wordTimer) {
            stopWordTimer()
        }
    }, [isPlaying, wordTimer])





    const beginManualSeekIntent = (ms = 160) => {
        allowBoundaryUpdates.current = false
        manualSeekUntilRef.current = Date.now() + ms
        if (manualSeekIntentTimer.current) {
            clearTimeout(manualSeekIntentTimer.current)
        }
        manualSeekIntentTimer.current = setTimeout(() => {
            if (!keyboardSeekActiveRef.current) {
                allowBoundaryUpdates.current = true
            }
        }, ms)
    }

    const startKeyboardSeek = () => {
        keyboardSeekActiveRef.current = true
        allowBoundaryUpdates.current = false

        manualSeekUntilRef.current = Date.now() + 60_000
        if (manualSeekIntentTimer.current) {
            clearTimeout(manualSeekIntentTimer.current)
            manualSeekIntentTimer.current = null
        }
    }

    const stopKeyboardSeek = () => {
        const hadKeyboardSeek = keyboardSeekActiveRef.current
        keyboardSeekActiveRef.current = false

        const targetIndex = pendingKeyboardSeekIndexRef.current
        pendingKeyboardSeekIndexRef.current = null

        beginManualSeekIntent(120)


        if (hadKeyboardSeek && targetIndex !== null && isPlayingRef.current && !isPausedRef.current) {
            systemSpeech.cancel()
            setTimeout(() => {
                if (isPlayingRef.current && !isPausedRef.current) {
                    startSequencer(targetIndex)
                }
            }, 40)
        }
    }

    const stopSeekHold = () => {
        if (seekHoldDelayTimerRef.current) {
            clearTimeout(seekHoldDelayTimerRef.current)
            seekHoldDelayTimerRef.current = null
        }
        if (seekHoldIntervalRef.current) {
            clearInterval(seekHoldIntervalRef.current)
            seekHoldIntervalRef.current = null
        }
    }

    const startSeekHold = (action) => {
        stopSeekHold()
        seekHoldDelayTimerRef.current = setTimeout(() => {
            action()
            seekHoldIntervalRef.current = setInterval(() => {
                action()
            }, 80)
        }, 260)
    }

    const getSeekHoldHandlers = (action) => ({
        onMouseDown: () => {
            startKeyboardSeek()
            startSeekHold(action)
        },
        onMouseUp: () => {
            stopSeekHold()
            stopKeyboardSeek()
        },
        onMouseLeave: () => {
            stopSeekHold()
            stopKeyboardSeek()
        },
        onTouchStart: (e) => {
            e.preventDefault()
            startKeyboardSeek()
            startSeekHold(action)
        },
        onTouchEnd: () => {
            stopSeekHold()
            stopKeyboardSeek()
        },
        onTouchCancel: () => {
            stopSeekHold()
            stopKeyboardSeek()
        },
    })





    const debouncedSettingsChange = () => {
        beginManualSeekIntent(120)
        if (speedChangeTimerRef.current) {
            clearTimeout(speedChangeTimerRef.current)
        }
        if (isPlaying && !isPaused) {
            speedChangeTimerRef.current = setTimeout(() => {
                if (!isPlayingRef.current || isPausedRef.current) return
                systemSpeech.cancel()
                setTimeout(() => {
                    if (!isPlayingRef.current || isPausedRef.current) return
                    startSequencer(currentWordIndexRef.current)
                }, 40)
            }, 90)
        }
    }

    const requestSeamlessSettingsApply = () => {
        if (seamlessTimerRef.current) clearTimeout(seamlessTimerRef.current)
        seamlessTimerRef.current = setTimeout(() => {
            if (isPlayingRef.current && !isPausedRef.current) pendingSeamlessRef.current = true
        }, 150)
    }





    const debouncedNavigate = (newWordIndex) => {
        beginManualSeekIntent(180)
        if (navigationTimer) {
            clearTimeout(navigationTimer)
        }
        setCurrentWordIndex(newWordIndex)
        currentWordIndexRef.current = newWordIndex
        setUserSetPosition(true)
        setIsNavigating(true)

        if (isPlaying && !isPaused) {
            const timer = setTimeout(() => {
                systemSpeech.cancel()
                setTimeout(() => {
                    if (isPlaying && !isPaused) {
                        startSequencer(newWordIndex)
                    }
                    setIsNavigating(false)
                }, 50)
            }, 150)
            setNavigationTimer(timer)
        } else {
            setIsNavigating(false)
        }
    }

    const keyboardNavigateWord = (direction) => {
        const newIndex = direction === 'forward'
            ? Math.min(currentWordIndexRef.current + 1, words.length - 1)
            : Math.max(currentWordIndexRef.current - 1, 0)

        setCurrentWordIndex(newIndex)
        currentWordIndexRef.current = newIndex
        allowBoundaryUpdates.current = false

        if (rapidNavigationTimer.current) {
            clearTimeout(rapidNavigationTimer.current)
        }

        rapidNavigationTimer.current = setTimeout(() => {
            if (isPlaying && !isPaused) {
                startSequencer(newIndex)
            } else {
                allowBoundaryUpdates.current = true
            }
            rapidNavigationTimer.current = null
        }, 1000)
    }

    const keyboardNavigateParagraph = (direction) => {
        const currentParagraph = findCurrentParagraph(currentWordIndexRef.current)
        const newParagraphIndex = direction === 'forward'
            ? Math.min(currentParagraph + 1, paragraphs.length - 1)
            : Math.max(currentParagraph - 1, 0)

        if ((direction === 'forward' && newParagraphIndex > currentParagraph) ||
            (direction === 'backward' && newParagraphIndex < currentParagraph)) {
            const newWordIndex = getWordIndexForParagraph(newParagraphIndex)
            setCurrentParagraphIndex(newParagraphIndex)
            setCurrentWordIndex(newWordIndex)
            currentWordIndexRef.current = newWordIndex
            allowBoundaryUpdates.current = false

            if (rapidNavigationTimer.current) {
                clearTimeout(rapidNavigationTimer.current)
            }

            rapidNavigationTimer.current = setTimeout(() => {
                if (isPlaying && !isPaused) {
                    startSequencer(newWordIndex)
                } else {
                    allowBoundaryUpdates.current = true
                }
                rapidNavigationTimer.current = null
            }, 1000)
        }
    }

    const skipForwardWord = () => {
        const newIndex = Math.min(currentWordIndexRef.current + 1, words.length - 1)


        if (isPlayingRef.current && !isPausedRef.current && keyboardSeekActiveRef.current) {
            pendingKeyboardSeekIndexRef.current = newIndex
            setCurrentWordIndex(newIndex)
            currentWordIndexRef.current = newIndex
            return
        }

        jumpToWord(newIndex)
    }

    const skipBackwardWord = () => {
        const newIndex = Math.max(currentWordIndexRef.current - 1, 0)


        if (isPlayingRef.current && !isPausedRef.current && keyboardSeekActiveRef.current) {
            pendingKeyboardSeekIndexRef.current = newIndex
            setCurrentWordIndex(newIndex)
            currentWordIndexRef.current = newIndex
            return
        }

        jumpToWord(newIndex)
    }

    const rapidNavigate = (newWordIndex) => {
        beginManualSeekIntent(180)
        setCurrentWordIndex(newWordIndex)
        currentWordIndexRef.current = newWordIndex
        allowBoundaryUpdates.current = false

        if (rapidNavigationTimer.current) {
            clearTimeout(rapidNavigationTimer.current)
        }

        rapidNavigationTimer.current = setTimeout(() => {
            jumpToWord(newWordIndex)
            allowBoundaryUpdates.current = true
            rapidNavigationTimer.current = null
        }, 500)
    }

    const skipForwardParagraph = () => {
        const currentParagraph = findCurrentParagraph(currentWordIndexRef.current)
        const newParagraphIndex = Math.min(currentParagraph + 1, paragraphs.length - 1)
        if (newParagraphIndex > currentParagraph) {
            const newWordIndex = getWordIndexForParagraph(newParagraphIndex)
            setCurrentParagraphIndex(newParagraphIndex)


            if (isPlayingRef.current && !isPausedRef.current && keyboardSeekActiveRef.current) {
                pendingKeyboardSeekIndexRef.current = newWordIndex
                setCurrentWordIndex(newWordIndex)
                currentWordIndexRef.current = newWordIndex
                return
            }

            jumpToWord(newWordIndex)
        }
    }

    const skipBackwardParagraph = () => {
        const currentParagraph = findCurrentParagraph(currentWordIndexRef.current)
        const newParagraphIndex = Math.max(currentParagraph - 1, 0)
        if (newParagraphIndex < currentParagraph) {
            const newWordIndex = getWordIndexForParagraph(newParagraphIndex)
            setCurrentParagraphIndex(newParagraphIndex)


            if (isPlayingRef.current && !isPausedRef.current && keyboardSeekActiveRef.current) {
                pendingKeyboardSeekIndexRef.current = newWordIndex
                setCurrentWordIndex(newWordIndex)
                currentWordIndexRef.current = newWordIndex
                return
            }

            jumpToWord(newWordIndex)
        }
    }

    const findCurrentParagraph = (wordIndex) => {
        let wordCount = 0
        for (let i = 0; i < paragraphs.length; i++) {
            const paragraphWords = paragraphs[i].split(/\s+/).filter(word => word.length > 0)
            if (wordIndex < wordCount + paragraphWords.length) {
                return i
            }
            wordCount += paragraphWords.length
        }
        return paragraphs.length - 1
    }

    const getWordIndexForParagraph = (paragraphIndex) => {
        let wordCount = 0
        for (let i = 0; i < paragraphIndex; i++) {
            const paragraphWords = paragraphs[i].split(/\s+/).filter(word => word.length > 0)
            wordCount += paragraphWords.length
        }
        return wordCount
    }








    const spokenMapRef = useRef(null)
    const spokenOffsetRef = useRef(0)
    const toDisplayWord = (spokenIdx) => {
        if (spokenIdx === undefined) return undefined
        const map = spokenMapRef.current
        const d = map ? (map[spokenIdx] != null ? map[spokenIdx] : spokenIdx) : spokenIdx
        return d + spokenOffsetRef.current
    }

    const piperAudio = () => {
        if (!piperAudioRef.current) {
            const audio = new Audio()
            audio.preload = 'auto'
            audio.preservesPitch = true
            audio.mozPreservesPitch = true
            audio.webkitPreservesPitch = true
            piperAudioRef.current = audio
        }
        return piperAudioRef.current
    }

    const piperVoiceFor = (chunk) => {
        const selected = currentSelectedVoiceRef.current
        if (!isPiperVoice(selected)) return null
        const id = piperId(selected)
        if (!isAllowedVoice(id)) return null
        if (chunk.lang && piperLang(id) !== chunk.lang) return null
        return id
    }

    const advanceAfter = (delay) => {
        const go = () => {
            if (!isPlayingRef.current || isPausedRef.current) return
            queueIndexRef.current++
            setQueueIndex(queueIndexRef.current)
            playNextChunk()
        }
        if (delay > 0) setTimeout(go, delay)
        else go()
    }

    const synthFor = (chunk, { urgent = false } = {}) => {
        const selected = currentSelectedVoiceRef.current
        if (isCloudVoice(selected)) return (text) => cloudSynthesize(text, selected)
        const piperVoice = piperVoiceFor(chunk)
        if (piperVoice) return (text) => piperSynthesize(text, piperVoice, { urgent }).then((blob) => ({ blob }))
        return null
    }

    const playChunkWithAudio = async (chunk, index, synth) => {
        const token = ++piperTokenRef.current
        const audio = piperAudio()
        audio.pause()
        const chunkWords = chunk.text.trim().split(/\s+/).filter(Boolean)
        let made = null
        setBuffering(true)
        const madePromise = synth(chunk.text)
        prefetchAhead(playbackQueueRef.current, index + 1, isCloudVoice(currentSelectedVoiceRef.current) ? 2 : 3)
        try { made = await madePromise } catch (error) {
            if (!isDropped(error)) {
                console.warn('[paperear] voice failed:', error?.message)
                setNotification(error?.code === 'voice-not-on-device' ? t('sequencer.voiceMissing', 'This voice is not on this device. Add it again from the voice list.') : t('sequencer.voiceFailed', 'The voice could not read this line.'))
                setTimeout(() => setNotification(''), 5000)
            }
        }
        if (token !== piperTokenRef.current || !isPlayingRef.current || isPausedRef.current) return
        const blob = made?.blob
        if (!blob) { setBuffering(false); advanceAfter(chunk.pause || 0); return }
        const url = URL.createObjectURL(blob)
        await new Promise((resolve) => {
            audio.onloadedmetadata = resolve
            audio.onerror = resolve
            audio.src = url
        })
        if (token !== piperTokenRef.current || !isPlayingRef.current) { URL.revokeObjectURL(url); return }
        const exact = made.timings && made.timings.length === chunkWords.length ? made.timings : null
        const timings = exact || wordTimings(chunkWords, audio.duration || 0)
        const paceId = currentSelectedVoiceRef.current
        const rateNow = () => (chunk.rate || 1.0) * voiceSpeed(paceId).rate
        const measure = async () => {
            const seconds = isCloudVoice(paceId) ? speechSpan(exact, audio.duration) : (audibleSeconds(await made.blob.arrayBuffer()) || audio.duration)
            learnPace(paceId, { words: chunkWords.length, seconds })
        }
        measure().catch(() => { })
        const volumeNow = () => Math.max(0, Math.min(1, volumeRef.current ?? 1))
        let lastIdx = -1
        const tick = () => {
            if (token !== piperTokenRef.current) return
            if (!audio.ended) requestAnimationFrame(tick)
            if (audio.paused) return
            audio.playbackRate = rateNow()
            audio.volume = volumeNow()
            if (chunk.wordIndex === undefined || keyboardSeekActiveRef.current) return
            if (!allowBoundaryUpdates.current || Date.now() < manualSeekUntilRef.current) return
            const t = audio.currentTime
            const idx = timings.findIndex((w) => t >= w.start && t < w.end)
            if (idx < 0 || idx === lastIdx) return
            lastIdx = idx
            const absolute = toDisplayWord(chunk.wordIndex + idx)
            if (absolute >= 0 && absolute < words.length) {
                setCurrentWordIndex(absolute)
                currentWordIndexRef.current = absolute
            }
        }
        audio.onended = () => {
            URL.revokeObjectURL(url)
            if (token !== piperTokenRef.current) return
            if (!isPlayingRef.current || isPausedRef.current) return
            advanceAfter(chunk.pause || 0)
        }
        audio.playbackRate = rateNow()
        audio.volume = volumeNow()
        try { await audio.play() } catch { URL.revokeObjectURL(url); setBuffering(false); advanceAfter(chunk.pause || 0); return }
        setBuffering(false)
        setIsPlaying(true)
        isPlayingRef.current = true
        tick()
    }

    const playNextChunk = () => {
        const queue = playbackQueueRef.current
        const index = queueIndexRef.current

        if (index >= queue.length || !isPlayingRef.current) {
            if (index >= queue.length) {
                const lp = loadedPagesRef.current
                const total = docPdfRef.current?.numPages || 0
                const lastLoaded = lp.length ? lp[lp.length - 1].pageNum : 0
                if (isPlayingRef.current && total && lastLoaded && lastLoaded < total) {
                    shiftRange(lp.length)
                    return
                }
                setIsPlaying(false)
                setIsPaused(false)
            }
            return
        }

        if (isPausedRef.current) return

        piperTokenRef.current++
        setBuffering(false)
        piperAudioRef.current?.pause()
        const chunk = queue[index]

        if (chunk.isSilent) {
            const skipped = chunk.wordIndex !== undefined && !keyboardSeekActiveRef.current ? chunk.skippedWords || 0 : 0
            const duration = skipped ? Math.min(SKIP_PASS_MAX_MS, Math.max(chunk.pause, skipped * SKIP_PASS_WORD_MS)) : chunk.pause
            if (skipped) {
                const ownerToken = piperTokenRef.current
                for (let k = 0; k < skipped; k++) {
                    setTimeout(() => {
                        if (ownerToken !== piperTokenRef.current || !isPlayingRef.current || isPausedRef.current) return
                        const di = toDisplayWord(chunk.wordIndex + k)
                        setCurrentWordIndex(di)
                        currentWordIndexRef.current = di
                    }, Math.floor((k * duration) / skipped))
                }
            }
            setTimeout(() => {
                if (!isPlayingRef.current || isPausedRef.current) return
                queueIndexRef.current++
                setQueueIndex(queueIndexRef.current)
                playNextChunk()
            }, duration)
            return
        }

        if (chunk.wordIndex !== undefined && !keyboardSeekActiveRef.current) {
            const di = toDisplayWord(chunk.wordIndex)
            setCurrentWordIndex(di)
            currentWordIndexRef.current = di
        }

        systemSpeech.cancel()

        const synth = synthFor(chunk, { urgent: true })
        if (synth) {
            setIsPlaying(true)
            isPlayingRef.current = true
            playChunkWithAudio(chunk, index, synth)
            return
        }

        const utterance = createUtterance(chunk.text)
        if (!utterance) {
            setIsPlaying(false)
            isPlayingRef.current = false
            setBuffering(false)
            return
        }

        const voiceList = currentVoicesRef.current?.length ? currentVoicesRef.current : voices
        let voice = currentSelectedVoiceRef.current
            ? voiceList.find(v => v.name === currentSelectedVoiceRef.current) || null
            : null
        if (chunk.lang) {
            const prefix = chunk.lang === 'ar' ? 'ar' : 'en'
            if (!voice || !(voice.lang || '').toLowerCase().startsWith(prefix)) {
                const alt = voiceList.find(v => (v.lang || '').toLowerCase().startsWith(prefix))
                if (alt) voice = alt
            }
        }
        if (voice) utterance.voice = voice
        const paceKey = voice?.name || 'default'

        utterance.pitch = chunk.pitch || 1.0
        let effectiveRate = (chunk.rate || 1.0) * voiceSpeed(paceKey).rate
        if (chunk.lang === 'ar' && chunk.text.trim().split(/\s+/).length <= 2) {
            effectiveRate = 1.0
        }
        utterance.rate = effectiveRate
        utterance.volume = Math.max(0, Math.min(1, volumeRef.current ?? 1))

        let chunkStartedAt = Date.now()
        let started = false
        const speechToken = piperTokenRef.current
        let lastBoundaryAt = chunkStartedAt
        let boundariesSeen = 0
        let firstBoundaryMark = null
        let lastBoundaryMark = null
        const chunkSpokenWords = chunk.text.trim().split(/\s+/).filter(Boolean).length

        utterance.onboundary = (event) => {
            if (!isPlayingRef.current || isPausedRef.current) return
            if (keyboardSeekActiveRef.current) return
            if (!allowBoundaryUpdates.current || Date.now() < manualSeekUntilRef.current) return
            if (typeof event.charIndex !== 'number' || chunk.wordIndex === undefined) return

            if (!started) {
                started = true
                chunkStartedAt = Date.now()
                setBuffering(false)
            }
            boundariesSeen += 1
            lastBoundaryAt = Date.now()
            const spokenPart = chunk.text.slice(0, event.charIndex)
            const wordsBefore = spokenPart.trim().split(/\s+/).filter(Boolean).length
            if (event.name !== 'sentence') {
                const mark = { at: performance.now(), words: wordsBefore }
                if (!firstBoundaryMark) firstBoundaryMark = mark
                lastBoundaryMark = mark
            }
            const absoluteWordIndex = toDisplayWord(chunk.wordIndex + wordsBefore)

            if (absoluteWordIndex >= 0 && absoluteWordIndex < words.length) {
                setCurrentWordIndex(absoluteWordIndex)
                currentWordIndexRef.current = absoluteWordIndex
            }

            if (pendingSeamlessRef.current) {
                pendingSeamlessRef.current = false
                beginManualSeekIntent(140)
                systemSpeech.cancel()
                setTimeout(() => {
                    if (!isPlayingRef.current || isPausedRef.current) return
                    startSequencer(currentWordIndexRef.current)
                }, 30)
            }
        }

        clearInterval(boundaryFallbackRef.current)
        if (chunk.wordIndex !== undefined && chunkSpokenWords > 1) {
            boundaryFallbackRef.current = setInterval(() => {
                if (!started) return
                if (!isPlayingRef.current || isPausedRef.current) return
                if (keyboardSeekActiveRef.current) return
                if (!allowBoundaryUpdates.current || Date.now() < manualSeekUntilRef.current) return
                const now = Date.now()
                if (boundariesSeen >= 3) return
                if (now - lastBoundaryAt < (boundariesSeen > 0 ? 900 : 450)) return
                const wordsPerSec = (naturalWpm(pacesRef.current, paceKey, paceKindOf(paceKey)) / 60) * utterance.rate
                const estimated = Math.min(
                    chunkSpokenWords - 1,
                    Math.floor(((now - chunkStartedAt) / 1000) * wordsPerSec),
                )
                const absoluteWordIndex = toDisplayWord(chunk.wordIndex + estimated)
                if (
                    absoluteWordIndex > currentWordIndexRef.current &&
                    absoluteWordIndex < words.length
                ) {
                    setCurrentWordIndex(absoluteWordIndex)
                    currentWordIndexRef.current = absoluteWordIndex
                }
            }, 200)
        }

        utterance.onend = () => {
            clearInterval(boundaryFallbackRef.current)
            pendingSeamlessRef.current = false

            const elapsedSec = (Date.now() - chunkStartedAt) / 1000
            if (!isPausedRef.current && elapsedSec > 0.6) {
                if (boundariesSeen >= 3 && firstBoundaryMark && lastBoundaryMark) {
                    learnPace(paceKey, {
                        words: lastBoundaryMark.words - firstBoundaryMark.words,
                        seconds: (lastBoundaryMark.at - firstBoundaryMark.at) / 1000,
                        rate: utterance.rate,
                    })
                } else {
                    learnPace(paceKey, { words: chunkSpokenWords, seconds: elapsedSec, rate: utterance.rate })
                }
            }

            if (!isPlayingRef.current || isPausedRef.current) return

            const nextDelay = chunk.pause || 0
            if (nextDelay > 0) {
                setTimeout(() => {
                    if (!isPlayingRef.current || isPausedRef.current) return
                    queueIndexRef.current++
                    setQueueIndex(queueIndexRef.current)
                    playNextChunk()
                }, nextDelay)
            } else {
                queueIndexRef.current++
                setQueueIndex(queueIndexRef.current)
                playNextChunk()
            }
        }

        utterance.onerror = (e) => {
            if (e.error === 'interrupted') return
            if (speechToken === piperTokenRef.current) setBuffering(false)
            console.error('Playback Error:', e)
        }

        setIsPlaying(true)
        isPlayingRef.current = true
        setCurrentUtterance(utterance)
        utterance.onstart = () => { started = true; setBuffering(false); chunkStartedAt = Date.now(); lastBoundaryAt = chunkStartedAt }
        setBuffering(true)
        systemSpeech.speak(utterance)
    }

    const warmedVoicesRef = useRef(new Set())

    const warmVoicesForText = (text) => {
        const needsAr = /[؀-ۿ]/.test(text)
        const needsEn = /[A-Za-z]/.test(text)
        if (!needsAr || !needsEn) return
        const list = currentVoicesRef.current?.length ? currentVoicesRef.current : voices
        for (const prefix of ['ar', 'en']) {
            const voice = list.find((v) => (v.lang || '').toLowerCase().startsWith(prefix))
            if (!voice || warmedVoicesRef.current.has(voice.name)) continue
            warmedVoicesRef.current.add(voice.name)
            const u = createUtterance('.')
            if (!u) continue
            u.voice = voice
            u.volume = 0
            u.rate = 2
            try { systemSpeech.speak(u) } catch { }
        }
    }


    const overridesRef = useRef(null)
    const keepSpellingsRef = useRef(null)
    useEffect(() => {
        let dead = false
        loadOverrides().then((map) => {
            if (dead) return
            overridesRef.current = map
            keepSpellingsRef.current = protectedSpellings(map)
        }).catch(() => {})
        return () => { dead = true }
    }, [text])

    const buildQueue = (startFromIndex = 0) => {
        const activeText = currentTextRef.current || text
        const allWords = activeText.split(/\s+/).filter(Boolean)
        const safeStartIndex = Math.max(0, Math.min(startFromIndex, Math.max(allWords.length - 1, 0)))
        const textFromStart = sliceTextFromWord(activeText, safeStartIndex)
        const model = READING_RULES_PRONUNCIATION
            ? buildReadingModel(textFromStart, { overrides: overridesRef.current })
            : { spokenText: applyPronunciationOverrides(textFromStart), spokenToDisplay: null }
        const lines = splitQueueByScript(parseToQueue(model.spokenText, readPauses()), {
            keep: keepSpellingsRef.current,
            only: readMixedVoices() ? null : detectLanguage(activeText),
        })
        const selected = currentSelectedVoiceRef.current
        const queue = isCloudVoice(selected) ? mergeShortChunks(lines) : isPiperVoice(selected) ? splitLongChunks(mergeLoneShortChunks(lines)) : lines
        return { queue, model, safeStartIndex }
    }

    const prefetchAhead = (queue, index, depth) => {
        const ownerToken = piperTokenRef.current
        let chain = Promise.resolve()
        for (let k = 0; k < depth; k++) {
            const chunk = queue[index + k]
            if (!chunk || chunk.isSilent || !chunk.text) continue
            const synth = synthFor(chunk)
            if (!synth) continue
            chain = chain.then(() => (ownerToken === piperTokenRef.current ? synth(chunk.text) : null)).catch(() => {})
        }
        return chain
    }

    const warmVoice = () => {
        if (isPlayingRef.current) return
        const selected = currentSelectedVoiceRef.current
        const cloud = isCloudVoice(selected)
        if (!cloud && !isPiperVoice(selected)) return
        if (cloud && !docIdRef.current) return
        if (!(currentTextRef.current || text).trim()) return
        const { queue } = buildQueue(currentWordIndexRef.current)
        prefetchAhead(queue, 0, 2)
    }

    useEffect(() => {
        const timer = setTimeout(warmVoice, 900)
        return () => clearTimeout(timer)
    }, [text, selectedVoice])

    const startSequencer = (startFromIndex = 0) => {
        track('reading-started')
        const { queue, model, safeStartIndex } = buildQueue(startFromIndex)
        spokenMapRef.current = model.spokenToDisplay
        spokenOffsetRef.current = safeStartIndex

        setPlaybackQueue(queue)
        playbackQueueRef.current = queue

        queueIndexRef.current = 0
        setQueueIndex(0)
        setCurrentWordIndex(safeStartIndex)
        currentWordIndexRef.current = safeStartIndex

        setIsPlaying(true)
        setIsPaused(false)
        isPlayingRef.current = true
        isPausedRef.current = false
        isSeekingRef.current = false

        playNextChunk()
    }

    const pause = () => {
        if (isPlaying && !isPaused) {
            beginManualSeekIntent(120)
            systemSpeech.cancel()
            const audio = piperAudioRef.current
            piperHoldRef.current = audio && !audio.paused && !audio.ended ? piperTokenRef.current : -1
            piperHoldWordRef.current = currentWordIndexRef.current
            audio?.pause()
            setIsPaused(true)
            isPausedRef.current = true
        }
    }

    const resume = () => {
        if (!isPaused) return
        const audio = piperAudioRef.current
        const heldAudioIsCurrent = audio && canResumeHeldAudio({
            holdToken: piperHoldRef.current,
            currentToken: piperTokenRef.current,
            heldWordIndex: piperHoldWordRef.current,
            currentWordIndex: currentWordIndexRef.current,
            hasSource: audio.src,
            ended: audio.ended
        })
        if (heldAudioIsCurrent) {
            piperHoldRef.current = -1
            piperHoldWordRef.current = -1
            setIsPaused(false)
            isPausedRef.current = false
            setIsPlaying(true)
            isPlayingRef.current = true
            audio.play().catch(() => speak())
            return
        }
        speak()
    }

    const speak = () => {
        const activeText = currentTextRef.current || text
        if (!activeText.trim()) return

        const lang = detectLanguage(activeText)
        const currentVoiceObj = voices.find(v => v.name === currentSelectedVoiceRef.current)
        let needsNewVoice = !currentSelectedVoiceRef.current

        if (currentVoiceObj && lang !== 'unknown') {
            const voiceLang = currentVoiceObj.lang.toLowerCase()
            const voiceName = currentVoiceObj.name.toLowerCase()
            const named = { ar: 'arabic', en: 'english' }[lang]
            if (!voiceLang.startsWith(lang) && !(named && voiceName.includes(named))) needsNewVoice = true
        }

        if (needsNewVoice) {
            autoSelectVoice(text)
        }

        beginManualSeekIntent(120)
        startSequencer(currentWordIndexRef.current)
    }

    const restartFromTop = () => {
        systemSpeech.cancel()
        setCurrentWordIndex(0)
        currentWordIndexRef.current = 0
        setUserSetPosition(true)
        setIsPaused(false)
        isPausedRef.current = false
        beginManualSeekIntent(150)
        setTimeout(() => startSequencer(0), 40)
    }

    const stopWordTimer = () => {
        if (wordTimer) {
            clearInterval(wordTimer)
            setWordTimer(null)
        }
    }

    const stop = () => {
        systemSpeech.cancel()
        piperTokenRef.current++
        piperHoldRef.current = -1
        piperHoldWordRef.current = -1
        piperAudioRef.current?.pause()
        stopWordTimer()
        clearInterval(boundaryFallbackRef.current)
        setIsPlaying(false)
        setIsPaused(false)
        isPlayingRef.current = false
        isPausedRef.current = false
        setCurrentUtterance(null)
    }

    const jumpToWord = (index) => {
        beginManualSeekIntent(200)
        if (navigationTimer) {
            clearTimeout(navigationTimer)
            setNavigationTimer(null)
        }

        const safeIndex = Math.max(0, Math.min(index, Math.max(words.length - 1, 0)))
        setCurrentWordIndex(safeIndex)
        currentWordIndexRef.current = safeIndex
        setUserSetPosition(true)
        setIsNavigating(false)

        if (isPlaying && !isPaused) {
            systemSpeech.cancel()
            setTimeout(() => startSequencer(safeIndex), 40)
        }
    }

    const scrollToCurrentWord = () => {

        const activeWord = document.querySelector('.td-word--current')
        if (activeWord) {
            activeWord.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
        }
        window.dispatchEvent(new CustomEvent('re-engage-autoscroll'))
    }

    const setCurrentWordIndexFromAudio = useCallback((index) => {
        const safeIndex = Math.max(0, Math.min(index, Math.max(currentWordsRef.current.length - 1, 0)))
        setCurrentWordIndex(safeIndex)
        currentWordIndexRef.current = safeIndex
    }, [])





    useEffect(() => {
        if (currentUtterance && isPlaying && !isPaused && !isSpeedChanging && !isNavigating) {
            systemSpeech.cancel()
            const timeoutId = setTimeout(() => {
                if (isPlaying && !isPaused) {
                    startSequencer(currentWordIndex)
                }
            }, 50)
            return () => clearTimeout(timeoutId)
        }
    }, [selectedVoice])


    useEffect(() => {
        startSequencerRef.current = startSequencer
        rapidNavigateRef.current = rapidNavigate
        skipForwardWordRef.current = skipForwardWord
        skipBackwardWordRef.current = skipBackwardWord
        skipForwardParagraphRef.current = skipForwardParagraph
        skipBackwardParagraphRef.current = skipBackwardParagraph
        debouncedSettingsChangeRef.current = debouncedSettingsChange
        requestSeamlessApplyRef.current = requestSeamlessSettingsApply
    })





    const formatProgress = (currentWord, total) => {
        if (total === 0) return '0%'
        const percentage = Math.round((currentWord / total) * 100)
        return `${percentage}% (${currentWord}/${total} words)`
    }





    const handleProgressSliderInput = (e) => {
        beginManualSeekIntent(200)
        const newWordIndex = parseInt(e.target.value)
        setCurrentWordIndex(newWordIndex)
        setUserSetPosition(true)
    }

    const handleProgressSliderChange = (e) => {
        const newWordIndex = parseInt(e.target.value)
        setCurrentWordIndex(newWordIndex)
        setUserSetPosition(true)
        if (!isSliding && isPlaying && !isPaused) {
            startSequencer(newWordIndex)
        }
    }

    const handleProgressSliderMouseDown = () => {
        beginManualSeekIntent(240)
        setIsSliding(true)
        setUserSetPosition(true)
        allowBoundaryUpdates.current = false
    }

    const handleProgressSliderMouseUp = (e) => {
        beginManualSeekIntent(180)
        setIsSliding(false)
        const newWordIndex = parseInt(e.target.value)
        setCurrentWordIndex(newWordIndex)
        setUserSetPosition(true)
        if (isPlaying && !isPaused) {
            startSequencer(newWordIndex)
        } else {
            allowBoundaryUpdates.current = true
        }
    }

    const handleProgressSliderTouchEnd = (e) => {
        beginManualSeekIntent(180)
        setIsSliding(false)
        const newWordIndex = parseInt(e.target.value)
        setCurrentWordIndex(newWordIndex)
        setUserSetPosition(true)
        if (isPlaying && !isPaused) {
            startSequencer(newWordIndex)
        } else {
            allowBoundaryUpdates.current = true
        }
    }





    const autoSelectVoice = (content) => {
        const lang = detectLanguage(content)
        const chosen = currentSelectedVoiceRef.current
        if (isCloudVoice(chosen)) return chosen
        const want = lang === 'unknown' ? 'en' : lang
        if (isPiperVoice(chosen) && piperLang(piperId(chosen)) === want) return chosen
        const reads = (v) => (v.lang || '').toLowerCase().startsWith(want)
        const named = { ar: 'arabic', en: 'english' }[want]
        const bestVoice = voices.find((v) => reads(v) && /google|microsoft/i.test(v.name))
            || voices.find(reads)
            || (named ? voices.find((v) => v.name.toLowerCase().includes(named)) : null)

        if (want !== 'en') {
            const language = languageName(want, i18n.language)
            setNotification(bestVoice
                ? t('sequencer.detectedSwitched', 'Detected {{lang}}. Switched to: {{voice}}').replace('{{lang}}', language).replace('{{voice}}', bestVoice.name)
                : t('sequencer.detectedNoVoice', 'Detected {{lang}}, but this device has no {{lang}} voice. Pick one from the voice list.').replaceAll('{{lang}}', language))
            setTimeout(() => setNotification(''), bestVoice ? 3000 : 4000)
        }

        if (bestVoice && bestVoice.name !== currentSelectedVoiceRef.current) {
            chooseVoice(bestVoice.name)
            currentSelectedVoiceRef.current = bestVoice.name
            return bestVoice.name
        }

        return currentSelectedVoiceRef.current
    }











    const applyDocument = (pages, totalChars, fileName) => {
        if (fileName !== welcomeNames.en && fileName !== welcomeNames.ar) track('document-opened')


        stop()
        setCurrentWordIndex(0)
        currentWordIndexRef.current = 0
        const resuming = resumeRef.current
        resumeRef.current = false
        const budget = recommendedBudget()
        const scannedDoc = docPdfRef.current && totalChars < pages.length * 5
        setDocPages(pages)
        setDocMeta({ fileName, totalPages: pages.length, totalChars, budget, scannedDoc })

        if (pages.length <= 10) {
            const all = joinPages(pages)
            setPendingRange(null)
            const place = savedPlaceFor(getDocWord(docIdRef.current), pages[0]?.pageNum ?? 1)
            if (place) pendingPlaceRef.current = place
            const lp = pages.map((p) => ({ pageNum: p.pageNum, count: (p.text || '').trim().split(/\s+/).filter(Boolean).length, blocks: blockCounts(p), tables: p.tables }))
            loadedPagesRef.current = lp
            setLoadedPages(lp)
            setText(all)
            autoSelectVoice(all)
            setNotification(
                t('sequencer.loadedDoc', 'Loaded: {{file}} ({{pages}} pages)')
                    .replace('{{file}}', fileName)
                    .replace('{{pages}}', pages.length)
            )
            setTimeout(() => setNotification(''), 3000)
        } else {
            const saved = getDocRange(docIdRef.current)
            const lastPlace = getDocWord(docIdRef.current)
            const placeRange = lastPlace && lastPlace.word > 0 ? { from: lastPlace.from, to: lastPlace.to } : null
            openingPlaceRef.current = placeRange ? lastPlace : null
            const clampPage = (n) => Math.max(1, Math.min(pages.length, n || 1))


            const range = placeRange || (resuming && typeof resuming === 'object' ? resuming : (resuming && saved ? saved : null))
            if (range) {

                loadPageRange(clampPage(range.from), clampPage(range.to), pages)
            } else {





                setText('')
                loadedPagesRef.current = []
                setLoadedPages([])
                const contentStart = clampPage(firstContentPage(pages))
                const fit = fitRange(pages, contentStart, budget)
                const autoTo = scannedDoc
                    ? clampPage(contentStart + OCR_FIRST_WINDOW - 1)
                    : clampPage(Math.max(fit.toPage, contentStart + 9))
                const savedTo = saved && scannedDoc
                    ? clampPage(Math.min(saved.to, saved.from + OCR_MAX_WINDOW - 1))
                    : saved ? clampPage(saved.to) : null
                const bm = readBookmarks()[docIdRef.current]
                const opening = placeRange
                    ? { from: clampPage(placeRange.from), to: clampPage(placeRange.to) }
                    : bm
                    ? { from: clampPage(bm), to: clampPage(bm + (scannedDoc ? OCR_FIRST_WINDOW : 10) - 1) }
                    : saved
                        ? { from: clampPage(saved.from), to: savedTo }
                        : { from: contentStart, to: autoTo }
                setPendingRange(null)
                setNotification('')
                loadPageRange(opening.from, opening.to, pages)
            }
        }
    }


    const ocrFillPages = async (pdf, pages, nums) => {
        if (!nums.length) return pages
        const ocrRun = ++ocrRunRef.current
        setOcrBusy({ done: 0, total: nums.length, pages: nums })
        try {
            const progress = (done, total) => {
                setOcrBusy({ done, total, pages: nums })
                setNotification(
                    t('sequencer.ocrProgress', 'Preparing scanned pages… {{done}}/{{total}}')
                        .replace('{{done}}', done)
                        .replace('{{total}}', total)
                )
            }
            progress(0, nums.length)
            const itemsMap = await recognizePages(pdf, nums, docIdRef.current, progress)
            if (import.meta.env.DEV) console.log('[paperear] OCR ran for pages:', nums.join(','))
            setOcrItemsByPage((prev) => ({ ...prev, ...itemsMap }))
            const byNum = new Map()
            for (const n of nums) {
                const pg = await pdf.getPage(n)
                const [, , pw, ph] = pg.view
                const items = itemsMap[n] || []
                const built = { ...pageFromItems(n, items, pw, ph, { rtl: detectRtlItems(items) }), ocr: true }
                byNum.set(n, isUnreadableCover(items, n) ? markPageSkippable(built) : built)
            }
            setNotification('')
            return pages.map((p) => byNum.get(p.pageNum) || p)
        } catch (err) {
            console.error('OCR Error:', err)
            setNotification(t('sequencer.ocrFailed', 'Could not read the scanned pages.'))
            setTimeout(() => setNotification(''), 5000)
            return pages
        } finally {
            if (ocrRun === ocrRunRef.current) setOcrBusy(null)
        }
    }


    const loadPageRange = async (start, end, pagesOverride) => {
        const run = ++rangeRunRef.current
        const superseded = () => run !== rangeRunRef.current
        const openingPlace = openingPlaceRef.current
        openingPlaceRef.current = null
        setRangeLoading(true)
        try {
            let pages = pagesOverride || docPages
            const pdf = docPdfRef.current
            const lo = Math.min(start, end)
            let hi = Math.max(start, end)
            if (pdf) {
                const scannedIn = (a, b) => pages
                    .filter((p) => p.pageNum >= a && p.pageNum <= b && isScannedPage(p))
                    .map((p) => p.pageNum)
                if (scannedIn(lo, hi).length > OCR_MAX_WINDOW) hi = lo + OCR_MAX_WINDOW - 1
                const nums = scannedIn(lo, hi)
                if (nums.length) {
                    pages = await ocrFillPages(pdf, pages, nums)
                    if (superseded()) return false
                    setDocPages(pages)
                    setDocPagesRaw((prev) => (prev?.length ? prev.map((p) => pages.find((q) => q.pageNum === p.pageNum) || p) : prev))
                }
                const ahead = scannedIn(hi + 1, hi + OCR_AHEAD)
                if (ahead.length) prefetchPages(pdf, ahead, docIdRef.current)
            }
            if (pdf) {
                const { OPS } = await import('pdfjs-dist/build/pdf.mjs')
                const filled = await withTablePages(pdf, pages, lo, hi, OPS)
                if (superseded()) return false
                if (filled.fresh.size) {
                    pages = filled.pages
                    setDocPages(pages)
                    setDocPagesRaw((prev) => (prev?.length ? prev.map((p) => (filled.fresh.has(p.pageNum) ? { ...carryAnnotations(p, filled.fresh.get(p.pageNum)), tableScan: true } : p)) : prev))
                }
            }
            const { text: rt, fromPage, toPage } = rangeText(pages, lo, hi)
            if (import.meta.env.DEV) console.log('[paperear] spoken text starts:', JSON.stringify(rt.slice(0, 200)))
            const lp = pages.filter((p) => p.pageNum >= fromPage && p.pageNum <= toPage).map((p) => ({ pageNum: p.pageNum, count: (p.text || '').trim().split(/\s+/).filter(Boolean).length, blocks: blockCounts(p), tables: p.tables }))
            loadedPagesRef.current = lp
            setPendingRange(null)
            setLoadedPages(lp)
            const place = savedPlaceFor(openingPlace, fromPage)
            if (place) pendingPlaceRef.current = place
            setText(rt.trim())
            autoSelectVoice(rt)
            warmVoicesForText(rt)
            if (docIdRef.current) saveDocRange(docIdRef.current, fromPage, toPage)


            try { const ls = JSON.parse(localStorage.getItem('paperear_last_source') || 'null'); if (ls && ls.kind === 'file') { ls.from = fromPage; ls.to = toPage; localStorage.setItem('paperear_last_source', JSON.stringify(ls)) } } catch { }
            setNotification(
                t('sequencer.loadedRange', 'Loaded pages {{from}}–{{to}}.')
                    .replace('{{from}}', fromPage)
                    .replace('{{to}}', toPage)
            )
            setTimeout(() => setNotification(''), 3000)
            return true
        } catch (error) {
            if (superseded()) return false
            console.error('Page load error:', error)
            setNotification(t('sequencer.rangeFailed', 'Those pages could not be loaded.'))
            setTimeout(() => setNotification(''), 5000)
            return false
        } finally {
            if (!superseded()) setRangeLoading(false)
        }
    }




    const toggleDropChrome = () => {
        if (!entitledRef.current) return
        const next = !dropChrome
        setDropChrome(next)
        try { localStorage.setItem('paperear_drop_chrome', JSON.stringify(next)) } catch { }
        if (!docPagesRaw.length) return



        const from = loadedPages.length ? loadedPages[0].pageNum : 1
        const to = loadedPages.length ? loadedPages[loadedPages.length - 1].pageNum : 1
        const runs = skipToggleRuns(docPagesRaw, docChrome, from, to)
        const newIdx = remapChromeToggleIndex(runs, currentWordIndexRef.current || 0, dropChrome, next)

        const withSkippable = next && entitledRef.current ? applySkippable(docPagesRaw, true) : docPagesRaw
        const active = next && entitledRef.current && docChrome.length ? applyChromeSkip(withSkippable, docChrome) : withSkippable
        setDocPages(active)
        stop()
        setCurrentWordIndex(newIdx)
        currentWordIndexRef.current = newIdx
        if (loadedPages.length) {
            loadPageRange(from, to, active)


            setTimeout(() => scrollToCurrentWord(), 200)
        }
    }



    const setDropChromeEntitled = (value) => {
        if (entitledRef.current === !!value) return
        entitledRef.current = !!value
        if (!docPagesRaw.length) return
        const withSkippable = dropChrome && entitledRef.current ? applySkippable(docPagesRaw, true) : docPagesRaw
        const active = dropChrome && entitledRef.current && docChrome.length ? applyChromeSkip(withSkippable, docChrome) : withSkippable
        setDocPages(active)
        if (loadedPages.length) {
            loadPageRange(loadedPages[0].pageNum, loadedPages[loadedPages.length - 1].pageNum, active)
        }
    }

    const wordCountOf = (p) => (p.text || '').trim().split(/\s+/).filter(Boolean).length








    const shiftRange = (delta) => {
        const lp = loadedPagesRef.current
        if (!lp.length || !docMeta?.totalPages) return
        const from = lp[0].pageNum
        const to = lp[lp.length - 1].pageNum
        const cur = currentWordIndexRef.current || 0
        const wasPlaying = isPlayingRef.current && !isPausedRef.current



        const next = shiftWindow(from, to, delta, docMeta.totalPages)
        if (next.from === from && next.to === to) return
        const nf = next.from, nt = next.to

        let acc = 0, curPage = from, offset = 0
        for (const pg of lp) { const c = pg.count || 0; if (cur < acc + c) { curPage = pg.pageNum; offset = cur - acc; break } acc += c }

        const startIdx = (curPage >= nf && curPage <= nt)
            ? docPages.filter((p) => p.pageNum >= nf && p.pageNum < curPage).reduce((s, p) => s + wordCountOf(p), 0) + offset
            : 0

        stop()
        if (wasPlaying) setContinuing(true)
        const openedAt = openGenRef.current
        Promise.resolve(loadPageRange(nf, nt)).then((loaded) => {
            if (openedAt !== openGenRef.current || loaded === false) { setContinuing(false); return }
            clearTimeout(shiftTimerRef.current)
            shiftTimerRef.current = setTimeout(() => {
                if (openedAt !== openGenRef.current) { setContinuing(false); return }
                setContinuing(false)
                setCurrentWordIndex(startIdx)
                currentWordIndexRef.current = startIdx
                if (wasPlaying) startSequencer(startIdx)
                else scrollToCurrentWord()
            }, 180)
        }).catch(() => setContinuing(false))
    }





    const ingest = (pages, fileName) => {
        setDocLoading(null)
        const bands = detectChrome(pages)
        const extra = [detectPageNumbers(pages), detectPromoLines(pages)].filter(Boolean)
        const allBands = [...bands, ...extra]
        setDocChrome(allBands)
        setDocPagesRaw(pages)
        setHasSkippable(allBands.length > 0 || pages.some((p) => (p.blocks || []).some((b) => b.skippable || b.cleanText)))
        const withSkippable = dropChrome && entitledRef.current ? applySkippable(pages, true) : pages
        const active = dropChrome && entitledRef.current && allBands.length ? applyChromeSkip(withSkippable, allBands) : withSkippable
        const totalChars = active.reduce((s, p) => s + p.charCount, 0)
        applyDocument(active, totalChars, fileName)
    }




    const rememberFile = (file) => {
        if (!file) return
        const id = `${file.name}:${file.size}`
        try { localStorage.setItem('paperear_last_source', JSON.stringify({ kind: 'file', id })) } catch { }
        docStore.saveDoc({ id, name: file.name, size: file.size, type: file.type, blob: file })
    }

    const handleFileUpload = async (file) => {
        if (!file) return
        const loadGen = ++loadGenRef.current
        pendingPlaceRef.current = null
        const superseded = () => loadGen !== loadGenRef.current
        rangeRunRef.current += 1
        setRangeLoading(false)
        setDocLoading({ name: file.name })
        if (docPdfRef.current || loadedPagesRef.current.length || currentTextRef.current.trim()) {
            openGenRef.current += 1
            clearTimeout(shiftTimerRef.current)
            setContinuing(false)
            stop()
            setText('')
            setDocPdf(null)
            docPdfRef.current = null
            setDocPages([])
            setDocPagesRaw([])
            setDocChrome([])
            setDocMeta(null)
            setPendingRange(null)
            setLoadedPages([])
            loadedPagesRef.current = []
            setOcrItemsByPage({})
            setHasSkippable(false)
            setCurrentWordIndex(0)
            currentWordIndexRef.current = 0
        }
        const name = (file.name || '').toLowerCase()

        if (name.endsWith('.md') || name.endsWith('.markdown') || file.type === 'text/markdown') {
            const reader = new FileReader()
            reader.onload = (e) => {
                if (superseded()) return
                setDocPdf(null)
                docPdfRef.current = null
                const { pages } = buildPagesFromMarkdown(e.target.result)
                ingest(pages, file.name)
                rememberFile(file)
            }
            reader.onerror = () => {
                if (superseded()) return
                setDocLoading(null)
                setNotification(t('sequencer.fileFailed', 'This file could not be opened.'))
                setTimeout(() => setNotification(''), 5000)
            }
            reader.readAsText(file)
        } else if (file.type === 'text/plain' || name.endsWith('.txt')) {
            const reader = new FileReader()
            reader.onload = (e) => {
                if (superseded()) return
                setDocPdf(null)
                docPdfRef.current = null
                const { pages } = buildPagesFromText(e.target.result)
                ingest(pages, file.name)
                rememberFile(file)
            }
            reader.onerror = () => {
                if (superseded()) return
                setDocLoading(null)
                setNotification(t('sequencer.fileFailed', 'This file could not be opened.'))
                setTimeout(() => setNotification(''), 5000)
            }
            reader.readAsText(file)
        } else if (file.type === 'application/pdf' || name.endsWith('.pdf')) {
                                    try {
                setNotification(t('sequencer.loadingPdf', 'Loading PDF: {{file}}...').replace('{{file}}', file.name))
                

                const pdfjsModule = await import('pdfjs-dist/build/pdf.mjs');
                const pdfjsLib = pdfjsModule.default || pdfjsModule;
                
                const workerUrl = await import('pdfjs-dist/build/pdf.worker.mjs?url');
                pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl.default;

                const arrayBuffer = await file.arrayBuffer()
                const pdf = await pdfjsLib.getDocument({
                    data: arrayBuffer,
                    wasmUrl: new URL('pdfjs/wasm/', window.location.origin + import.meta.env.BASE_URL).href,
                    standardFontDataUrl: new URL('pdfjs/standard_fonts/', window.location.origin + import.meta.env.BASE_URL).href,
                    isEvalSupported: false,
                }).promise
                if (superseded()) { pdf.destroy?.(); return }
                setDocPdf(pdf)
                docPdfRef.current = pdf
                docIdRef.current = `${file.name}:${file.size}`
                setOcrItemsByPage({})
                setBookmark(readBookmarks()[docIdRef.current] ?? null)

                let { pages } = await buildPagesFromPdf(pdf, (done, total) => { if (!superseded() && (done % 20 === 0 || done === total)) setDocLoading({ name: file.name, done, total }) }, pdfjsModule.OPS)
                if (superseded()) return
                if (import.meta.env.DEV) console.log('[paperear] parsed', pages.length, 'pages | needing OCR:', pages.filter(isScannedPage).length, '| p5 chars:', pages[4]?.charCount)
                if (pages.length <= 10) {
                    const nums = pages.filter(isScannedPage).map((p) => p.pageNum)
                    if (nums.length) pages = await ocrFillPages(pdf, pages, nums)
                    if (superseded()) return
                    pages = (await withTablePages(pdf, pages, 1, pages.length, pdfjsModule.OPS)).pages
                    if (superseded()) return
                }
                ingest(pages, file.name)
                rememberFile(file)
            } catch (err) {
                if (superseded()) return
                console.error('PDF Error:', err)
                setDocLoading(null)
                setNotification(t('sequencer.failedPdf', 'Failed to load PDF. Is it encrypted?'))
                setTimeout(() => setNotification(''), 5000)
            }
        } else if (isEpub(file) || isDocx(file)) {
            try {
                setNotification(t('sequencer.loadingFile', 'Opening {{file}}…').replace('{{file}}', file.name))
                const markdown = isEpub(file) ? await textFromEpub(file) : await textFromDocx(file)
                if (superseded()) return
                setDocPdf(null)
                docPdfRef.current = null
                docIdRef.current = `${file.name}:${file.size}`
                const { pages } = buildPagesFromMarkdown(markdown)
                ingest(pages, file.name)
                rememberFile(file)
            } catch (err) {
                if (superseded()) return
                setDocLoading(null)
                setNotification(err?.message || t('sequencer.fileFailed', 'This file could not be opened.'))
                setTimeout(() => setNotification(''), 5000)
            }
        } else {
            setDocLoading(null)
            setNotification(t('sequencer.onlyTxtPdf', 'Only .pdf, .epub, .docx, .md and .txt files can be opened.'))
            setTimeout(() => setNotification(''), 3000)
        }
    }




    const readBookmarks = () => {
        try { return JSON.parse(localStorage.getItem('paperear_bookmarks') || '{}') } catch { return {} }
    }

    const [bookmark, setBookmark] = useState(null)

    const toggleBookmark = (pageNum) => {
        const all = readBookmarks()
        const id = docIdRef.current
        if (!id) return
        const next = all[id] === pageNum ? null : pageNum
        if (next === null) delete all[id]
        else all[id] = next
        try { localStorage.setItem('paperear_bookmarks', JSON.stringify(all)) } catch { }
        setBookmark(next)
    }


    const openRangePicker = () => {
        if (!docPages.length || !docMeta) return
        const from = loadedPages.length ? loadedPages[0].pageNum : 1
        const to = loadedPages.length ? loadedPages[loadedPages.length - 1].pageNum : Math.min(10, docPages.length)
        setPendingRange({ fromPage: from, toPage: to, rec: { fromPage: from, toPage: to } })
    }

    const cancelRangePicker = () => setPendingRange(null)


    const closeDocument = () => {
        openGenRef.current += 1
        loadGenRef.current += 1
        rangeRunRef.current += 1
        setRangeLoading(false)
        clearTimeout(shiftTimerRef.current)
        setContinuing(false)
        setDocLoading(null)
        stop()
        setText('')
        setDocPdf(null)
        docPdfRef.current = null
        docIdRef.current = ''
        setDocPages([])
        setDocPagesRaw([])
        setDocChrome([])
        setDocMeta(null)
        setPendingRange(null)
        setLoadedPages([])
        loadedPagesRef.current = []
        setOcrItemsByPage({})
        setHasSkippable(false)
        setCurrentWordIndex(0)
        currentWordIndexRef.current = 0
        try { localStorage.removeItem('paperear_last_source') } catch { }
        try { localStorage.removeItem('paperear_loaded_pages') } catch { }
    }


    const welcomeNames = { en: 'Start here', ar: 'ابدأ من هنا' }

    const welcomeFiles = () => ({
        en: new File([welcomeEn], welcomeNames.en, { type: 'text/markdown' }),
        ar: new File([welcomeAr], welcomeNames.ar, { type: 'text/markdown' }),
    })

    const shelveWelcome = (file) => docStore.saveDoc({ id: `${file.name}:${file.size}`, name: file.name, size: file.size, type: file.type, blob: file, savedAt: Date.now() - 60000 })

    const welcomeOnce = () => {
        try {
            if (localStorage.getItem('paperear_welcomed')) return
            localStorage.setItem('paperear_welcomed', '1')
            localStorage.setItem('paperear_welcome_both', '1')
        } catch { return }
        const arabic = String(i18n.language || '').startsWith('ar')
        const files = welcomeFiles()
        shelveWelcome(arabic ? files.en : files.ar)
        handleFileUpload(arabic ? files.ar : files.en)
    }

    useEffect(() => {
        try {
            if (!localStorage.getItem('paperear_welcomed') || localStorage.getItem('paperear_welcome_both')) return
            localStorage.setItem('paperear_welcome_both', '1')
        } catch { return }
        docStore.recentDocs().then((docs) => {
            const onShelf = new Set(docs.map((d) => d.name))
            Object.values(welcomeFiles()).filter((f) => !onShelf.has(f.name)).forEach(shelveWelcome)
        })
    }, [])

    const uploadRef = useRef(handleFileUpload)
    uploadRef.current = handleFileUpload
    useEffect(() => {
        const followLanguage = (lng) => {
            let last
            try { last = JSON.parse(localStorage.getItem('paperear_last_source') || 'null') } catch { return }
            const want = String(lng || '').startsWith('ar') ? 'ar' : 'en'
            const other = want === 'ar' ? 'en' : 'ar'
            if (!String(last?.id || '').startsWith(`${welcomeNames[other]}:`)) return
            uploadRef.current(welcomeFiles()[want])
        }
        i18n.on('languageChanged', followLanguage)
        return () => i18n.off('languageChanged', followLanguage)
    }, [])

    const restoreLastDoc = async () => {
        if (restoredRef.current) return
        restoredRef.current = true
        const openedAt = openGenRef.current
        let last
        try { last = JSON.parse(localStorage.getItem('paperear_last_source') || 'null') } catch { last = null }
        if (!last || last.kind !== 'file' || !last.id) { setDocLoading(null); return welcomeOnce() }
        setDocLoading({ name: String(last.id).replace(/:\d+$/, '') })
        const rec = await docStore.getDoc(last.id).catch(() => null)
        if (openedAt !== openGenRef.current) return
        if (!rec || !rec.blob) { setDocLoading(null); return welcomeOnce() }
        resumeRef.current = (last.from && last.to) ? { from: last.from, to: last.to } : true
        handleFileUpload(new File([rec.blob], rec.name || 'document', { type: rec.type || '' }))
    }

    useEffect(() => {
        try { if (sessionStorage.getItem('paperear_entry_mode') !== 'read') return } catch { return }
        restoreLastDoc()
    }, [])

    useEffect(() => {
        const lp = loadedPagesRef.current
        if (!docIdRef.current || !lp.length || currentWordIndex <= 0) return undefined
        const timer = setTimeout(
            () => saveDocWord(docIdRef.current, lp[0].pageNum, lp[lp.length - 1].pageNum, currentWordIndex, anchorAt(currentWordsRef.current, currentWordIndex)),
            800,
        )
        return () => clearTimeout(timer)
    }, [currentWordIndex])





    useEffect(() => {
        const stopSpeechOnPageExit = (syncState = true) => {
            try {
                systemSpeech.cancel()
            } catch (_) {

            }
            isPlayingRef.current = false
            isPausedRef.current = false
            if (syncState) {
                setIsPlaying(false)
                setIsPaused(false)
                setCurrentUtterance(null)
            }
        }

        window.addEventListener('beforeunload', stopSpeechOnPageExit)
        window.addEventListener('pagehide', stopSpeechOnPageExit)

        return () => {
            window.removeEventListener('beforeunload', stopSpeechOnPageExit)
            window.removeEventListener('pagehide', stopSpeechOnPageExit)
            stopSpeechOnPageExit(false)

            if (wordTimer) clearInterval(wordTimer)
            if (navigationTimer) clearTimeout(navigationTimer)
            if (speedChangeTimerRef.current) {
                clearTimeout(speedChangeTimerRef.current)
                speedChangeTimerRef.current = null
            }
            if (rapidNavigationTimer.current) clearTimeout(rapidNavigationTimer.current)
            if (keyRepeatTimer.current) clearInterval(keyRepeatTimer.current)
            if (manualSeekIntentTimer.current) clearTimeout(manualSeekIntentTimer.current)
            stopSeekHold()
        }
    }, [wordTimer, navigationTimer])





    return {

        text,
        setText,
        words,
        sentences,
        paragraphs,
        totalWords,


        isPlaying,
        isPaused,
        currentWordIndex,
        currentSentenceIndex,
        currentParagraphIndex,


        voices,
        selectedVoice,
        setSelectedVoice,
        chooseVoice,


        currentWPM,
        playbackRate,
        handleWPMChange,
        wpmToRate,
        speedLimit,


        speak,
        pause,
        resume,
        stop,
        jumpToWord,
        restoreTick,
        scrollToCurrentWord,
        setCurrentWordIndexFromAudio,


        skipForwardWord,
        skipBackwardWord,
        skipForwardParagraph,
        skipBackwardParagraph,
        getSeekHoldHandlers,


        handleProgressSliderInput,
        handleProgressSliderChange,
        handleProgressSliderMouseDown,
        handleProgressSliderMouseUp,
        handleProgressSliderTouchEnd,
        formatProgress,


        debouncedSettingsChange,
        requestSeamlessSettingsApply,
        restartFromTop,
        setCurrentWPM,
        setPlaybackRate,
        currentPlaybackRateRef,
        volumeRef,


        handleFileUpload,
        closeDocument,
        restoreLastDoc,
        openRangePicker,
        cancelRangePicker,
        bookmark,
        toggleBookmark,
        notification,
        setNotification,


        docPages,
        docChrome,
        hasSkippable,
        dropChrome,
        chromeSkipping: dropChrome && entitledRef.current,
        toggleDropChrome,
        setDropChromeEntitled,
        docMeta,
        pendingRange,
        loadPageRange,
        shiftRange,
        loadedPages,
        playbackQueue,
        queueIndex,
        docPdf,
        ocrItemsByPage,
        ocrBusy,
        buffering,
        continuing,
        rangeLoading,
        docLoading,
        documentBusy: documentBusyReason({ docLoading, ocrBusy, rangeLoading }),


        currentTextRef,
        currentWordsRef,
        currentParagraphsRef,
        currentIsPlayingRef,
        currentIsPausedRef,
        currentWordIndexRef,
        currentWPMRef,
        startSequencerRef,
        rapidNavigateRef,
        skipForwardWordRef,
        skipBackwardWordRef,
        skipForwardParagraphRef,
        skipBackwardParagraphRef,
        debouncedSettingsChangeRef,
        requestSeamlessApplyRef,
        rapidNavigationTimer,
        isPausedRef,
        isPlayingRef,
        beginManualSeekIntent,
        startKeyboardSeek,
        stopKeyboardSeek,
    }
}
