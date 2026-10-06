import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useSequencer } from '../hooks/useSequencer'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'
import TextDisplay from '../components/reader/TextDisplay'
import DocumentScroll from '../components/reader/DocumentScroll'
import RangeBox from '../components/reader/RangeBox'
import PlaybackControls, { WPM_MIN, WPM_MAX } from '../components/reader/PlaybackControls'
import ProgressBar from '../components/reader/ProgressBar'
import WriteSheet from '../components/reader/WriteSheet'
import OpenSheet from '../components/reader/OpenSheet'
import RangePicker from '../components/reader/RangePicker'
import Icon from '../components/icons'
import Busy, { useDelayed } from '../components/Busy'
import { askWhereToSave, catalog, download as downloadVoice, storedEntries } from '../services/piperEngine'
import { isKeyVoice, isOpenVoice, preferredOpenVoice } from '../utils/voicePreference'
import VOICE_PROVIDERS, { PROVIDER_FIRST } from '../data/voiceProviders'
import { languageName, offeredVoiceFor, voiceReads } from '../utils/voiceGroups'
import { detectLanguage } from '../utils/languageDetector'
import { cloudEntries, hasKey } from '../services/cloudVoices'

const hasAnyKey = () => VOICE_PROVIDERS.some((p) => hasKey(p.id))
import { composeWordReport, sendWordReport } from '../services/reports'
import './ReaderView.css'

const IDLE_BEFORE_ASK = 30 * 60 * 1000
const ASK_GRACE = 60 * 1000






function sliceBlocks(slice, defs) {
    if (!defs?.length) return [{ type: 'para', words: slice }]
    const sum = defs.reduce((s, d) => s + (d.count || 0), 0)
    if (sum !== slice.length) return [{ type: 'para', words: slice }]
    const blocks = []
    let bi = 0
    for (const d of defs) {
        if (d.skip) { blocks.push({ type: 'chrome', skip: true, text: d.text, words: [] }); continue }
        const n = d.count || 0
        blocks.push({ type: d.type, words: slice.slice(bi, bi + n) })
        bi += n
    }
    return blocks
}

export default function ReaderView() {
    const { t, i18n } = useTranslation();
    const location = useLocation()
    const navigate = useNavigate()
    const sequencer = useSequencer('')

    const audioRef = useRef(null)
    const [hdAudio,    setHdAudio]    = useState(null)
    const [hdIsPlaying, setHdIsPlaying] = useState(false)
    const [hdIsPaused,  setHdIsPaused]  = useState(false)
    const hdBaseWpmRef = useRef(150)


    const [richHtml, setRichHtml] = useState(() => {
        try {
            if (sessionStorage.getItem('paperear_entry_mode') === 'write') return localStorage.getItem('paperear_draft_html') || ''
            return ''
        } catch { return '' }
    })

    useEffect(() => {
        try {
            if (sessionStorage.getItem('paperear_entry_mode') !== 'write') return
            localStorage.setItem('paperear_draft_html', richHtml || '')
        } catch { }
    }, [richHtml])
    const [entryMode, setEntryMode] = useState(() => {
        try {
            const saved = sessionStorage.getItem('paperear_entry_mode')
            if (saved) return saved
            sessionStorage.setItem('paperear_entry_mode', 'read')
            return 'read'
        } catch { return null }
    })
    const [editing, setEditing] = useState(true)
    const chooseEntryMode = (m) => {
        try { sessionStorage.setItem('paperear_entry_mode', m) } catch { }
        setEntryMode(m)
        if (m === 'read') sequencer.restoreLastDoc()
        if (m === 'write') {
            setEditing(true)
            if (sequencer.docPdf || sequencer.loadedPages.length) {
                sequencer.closeDocument()
                setRichHtml('')
                setDocView(false)
                setFocusMode(false)
            } else if (!sequencer.text) {
                try {
                    sequencer.setText(localStorage.getItem('paperear_draft_text') || '')
                    setRichHtml(localStorage.getItem('paperear_draft_html') || '')
                } catch { }
            }
        }
    }
    const closeCurrentDoc = () => {
        sequencer.closeDocument()
        setEditing(true)
        audioRef.current?.pause()
        setHdAudio(null)
        setHdIsPlaying(false)
        setHdIsPaused(false)
        setDocView(false)
        setFocusMode(false)
    }
    const [reportTick, setReportTick] = useState(0)
    const [reportToast, setReportToast] = useState('')
    const [reportSending, setReportSending] = useState(false)
    const reportToastTimerRef = useRef(null)
    const requestReport = useCallback(() => setReportTick((n) => n + 1), [])
    const reportCurrentWord = useCallback(async (note = '', reportType = 'mispronounced', index = sequencer.currentWordIndex) => {
        const report = composeWordReport({
            words: sequencer.words,
            index,
            voice: sequencer.selectedVoice,
            rate: sequencer.playbackRate,
            sourceKind: sequencer.docPdf ? 'pdf' : 'text',
            note,
            reportType,
        })
        if (!report) return
        setReportSending(true)
        let result
        try { result = await sendWordReport(report) } finally { setReportSending(false) }
        setReportToast(result.sent
            ? t('controls.reportSent', 'Reported — thank you')
            : t('controls.reportQueued', 'Saved — it will be sent when online'))
        clearTimeout(reportToastTimerRef.current)
        reportToastTimerRef.current = setTimeout(() => setReportToast(''), 2800)
    }, [sequencer, t])
    const startFresh = () => {
        closeCurrentDoc()
        setRichHtml('')
        try { sessionStorage.removeItem('paperear_entry_mode') } catch { }
        setEntryMode(null)
    }
    const [focusMode, setFocusMode] = useState(false)
    const [pauses, setPauses] = useState(() => {
        try { return { linePause: 280, paragraphPause: 800, ...JSON.parse(localStorage.getItem('paperear_pauses') || '{}') } } catch { return { linePause: 280, paragraphPause: 800 } }
    })
    const [mixedVoices, setMixedVoices] = useState(() => {
        try { return localStorage.getItem('paperear_mixed_voices') !== '0' } catch { return true }
    })
    const changeMixedVoices = (on) => {
        setMixedVoices(on)
        try { localStorage.setItem('paperear_mixed_voices', on ? '1' : '0') } catch { }
        sequencer.requestSeamlessSettingsApply?.()
    }
    const changePauses = (next) => {
        const merged = { ...pauses, ...next }
        setPauses(merged)
        try { localStorage.setItem('paperear_pauses', JSON.stringify(merged)) } catch { }
    }
    const [downloadedVoices, setDownloadedVoices] = useState([])
    const [storedReady, setStoredReady] = useState(false)
    const refreshDownloadedVoices = useCallback(() => {
        storedEntries()
            .then((list) => setDownloadedVoices([...list, ...cloudEntries()]))
            .catch(() => setDownloadedVoices(cloudEntries()))
            .finally(() => setStoredReady(true))
    }, [])
    useEffect(() => {
        try { localStorage.removeItem('paperear_voice_pinned') } catch { }
        refreshDownloadedVoices()
    }, [refreshDownloadedVoices])
    const docLang = useMemo(() => detectLanguage(sequencer.text || ''), [sequencer.text])
    const pickedByHand = () => { try { return sessionStorage.getItem('paperear_voice_pinned') === '1' } catch { return false } }
    useEffect(() => {
        const next = preferredOpenVoice({ selected: sequencer.selectedVoice, pinned: pickedByHand(), docLang, downloaded: downloadedVoices })
        if (next) sequencer.setSelectedVoice(next)
    }, [downloadedVoices, docLang])
    const [autoVoice, setAutoVoice] = useState(null)
    const [providerHint, setProviderHint] = useState(null)
    const autoTried = useRef(new Set())
    useEffect(() => {
        if (!storedReady || !/^[a-z]{2}$/.test(docLang || '') || autoTried.current.has(docLang)) return undefined
        if (PROVIDER_FIRST.includes(docLang)) {
            autoTried.current.add(docLang)
            const seen = `paperear_provider_hint_${docLang}`
            let shown = false
            try { shown = sessionStorage.getItem(seen) === '1' } catch { }
            if (!shown && !isKeyVoice(sequencer.selectedVoice) && !hasAnyKey()) {
                try { sessionStorage.setItem(seen, '1') } catch { }
                setProviderHint(docLang)
            }
            return undefined
        }
        if (downloadedVoices.some((v) => isOpenVoice(v.name) && voiceReads(v, docLang))) return undefined
        const timer = setTimeout(async () => {
            const pick = offeredVoiceFor(await catalog(), docLang)
            if (!pick || autoTried.current.has(docLang)) return
            autoTried.current.add(docLang)
            setAutoVoice({ lang: docLang, pick, pct: null })
        }, 800)
        return () => clearTimeout(timer)
    }, [storedReady, docLang, downloadedVoices])
    const getAutoVoice = async () => {
        const { lang, pick } = autoVoice
        const whereToSave = askWhereToSave(pick.id)
        setAutoVoice({ lang, pick, pct: 0 })
        try {
            await downloadVoice(
                pick.id,
                (p) => setAutoVoice({ lang, pick, pct: Math.round((p.loaded * 100) / (p.total || 1)) }),
                () => setAutoVoice({ lang, pick, pct: 'saving' }),
                await whereToSave,
            )
            refreshDownloadedVoices()
        } catch (error) {
            console.warn('[paperear] voice download failed:', error?.message)
            sequencer.setNotification(t('voices.offerFailed', 'The voice could not be downloaded. You can get it later from the voice list.'))
            setTimeout(() => sequencer.setNotification(''), 5000)
        }
        setAutoVoice(null)
    }
    const [docView, setDocView] = useState(false)
    const [docJumpTick, setDocJumpTick] = useState(0)
    const docViewDefaultRef = useRef(null)
    const jumpToCurrent = () => (docView ? setDocJumpTick((n) => n + 1) : sequencer.scrollToCurrentWord())
    useEffect(() => {
        if (sequencer.docPdf && !docView && !focusMode) setDocView(true)
    }, [sequencer.docPdf, docView, focusMode])

    const [showShortcuts, setShowShortcuts] = useState(false)


    const [volume, setVolume] = useState(1)
    const [prevVolume, setPrevVolume] = useState(1)


    useEffect(() => {
        if (sequencer.volumeRef) sequencer.volumeRef.current = volume
        if (audioRef.current) audioRef.current.volume = volume
    }, [volume, sequencer.volumeRef])


    const applyVolume = useCallback((val) => {
        if (sequencer.volumeRef) sequencer.volumeRef.current = val
        if (audioRef.current) audioRef.current.volume = val
    }, [sequencer.volumeRef])

    const sequencerRefForMute = useRef(sequencer)
    useEffect(() => {
        sequencerRefForMute.current = sequencer
    }, [sequencer])

    const hasHdAudio = !!hdAudio?.audioUrl
    const usingHdTransport = hasHdAudio

    const handleMuteToggle = useCallback(() => {
        const newVol = volume > 0 ? 0 : (prevVolume > 0 ? prevVolume : 1)
        if (volume > 0) setPrevVolume(volume)
        setVolume(newVol)
        applyVolume(newVol)
        if (!usingHdTransport && sequencerRefForMute.current) {
            sequencerRefForMute.current.requestSeamlessSettingsApply()
        }
    }, [volume, prevVolume, applyVolume, usingHdTransport])

    const sortedWordTimings = useMemo(() => {
        if (!hdAudio?.wordTimings || !Array.isArray(hdAudio.wordTimings)) return []
        return [...hdAudio.wordTimings]
            .filter(w => typeof w?.start === 'number' && typeof w?.wordIndex === 'number')
            .sort((a, b) => a.start - b.start)
    }, [hdAudio])

    const sortedWordTimingsByIndex = useMemo(() => {
        if (!sortedWordTimings.length) return []
        return [...sortedWordTimings].sort((a, b) => a.wordIndex - b.wordIndex)
    }, [sortedWordTimings])




    const pagedView = useMemo(() => {
        const w = sequencer.words
        if (!w?.length) return null
        const lp = sequencer.loadedPages



        if (lp?.length) {
            const expected = lp.reduce((s, p) => s + (p.count || 0), 0)
            if (Math.abs(expected - w.length) <= Math.max(20, w.length * 0.12)) {
                const out = []
                let idx = 0
                for (const p of lp) {
                    const count = p.count || 0
                    const slice = []
                    const end = Math.min(idx + count, w.length)
                    for (; idx < end; idx++) slice.push({ word: w[idx], index: idx })
                    out.push({ pageNum: p.pageNum, words: slice, blocks: sliceBlocks(slice, p.blocks) })
                }
                if (out.length && idx < w.length) {
                    const last = out[out.length - 1]
                    for (; idx < w.length; idx++) last.words.push({ word: w[idx], index: idx })
                    last.blocks = [{ type: 'para', words: last.words }]
                }
                return out
            }
        }


        const PER = 300
        const out = []
        for (let i = 0; i < w.length; i += PER) {
            const slice = []
            const end = Math.min(i + PER, w.length)
            for (let j = i; j < end; j++) slice.push({ word: w[j], index: j })
            out.push({ pageNum: out.length + 1, words: slice, blocks: [{ type: 'para', words: slice }] })
        }
        return out
    }, [sequencer.loadedPages, sequencer.words])

    useEffect(() => {
        if (!sequencer.docPdf) return
        if (docViewDefaultRef.current === sequencer.docPdf) return
        docViewDefaultRef.current = sequencer.docPdf
        setFocusMode(false)
        setDocView(true)
    }, [sequencer.docPdf, pagedView])

    const findCurrentParagraph = useCallback((wordIndex) => {
        let wordCount = 0
        for (let i = 0; i < sequencer.paragraphs.length; i++) {
            const paragraphWords = sequencer.paragraphs[i].split(/\s+/).filter(word => word.length > 0)
            if (wordIndex < wordCount + paragraphWords.length) {
                return i
            }
            wordCount += paragraphWords.length
        }
        return Math.max(sequencer.paragraphs.length - 1, 0)
    }, [sequencer.paragraphs])

    const getWordIndexForParagraph = useCallback((paragraphIndex) => {
        let wordCount = 0
        for (let i = 0; i < paragraphIndex; i++) {
            const paragraphWords = sequencer.paragraphs[i].split(/\s+/).filter(word => word.length > 0)
            wordCount += paragraphWords.length
        }
        return wordCount
    }, [sequencer.paragraphs])

    const findTimingForWordIndex = useCallback((targetWordIndex) => {
        if (!sortedWordTimingsByIndex.length) return null

        let lo = 0
        let hi = sortedWordTimingsByIndex.length - 1
        let candidate = null

        while (lo <= hi) {
            const mid = Math.floor((lo + hi) / 2)
            const item = sortedWordTimingsByIndex[mid]
            if (item.wordIndex <= targetWordIndex) {
                candidate = item
                lo = mid + 1
            } else {
                hi = mid - 1
            }
        }

        if (candidate) return candidate
        return sortedWordTimingsByIndex[0]
    }, [sortedWordTimingsByIndex])

    const seekHdToWordIndex = useCallback((rawIndex) => {
        const total = Math.max(sequencer.totalWords - 1, 0)
        const safeIndex = Math.max(0, Math.min(rawIndex, total))

        sequencer.setCurrentWordIndexFromAudio(safeIndex)

        const audio = audioRef.current
        if (!audio) return

        const timing = findTimingForWordIndex(safeIndex)
        if (!timing || typeof timing.start !== 'number') return

        audio.currentTime = Math.max(0, timing.start)
    }, [sequencer, findTimingForWordIndex])

    const skipHdWord = useCallback((delta) => {
        const target = sequencer.currentWordIndex + delta
        seekHdToWordIndex(target)
    }, [sequencer.currentWordIndex, seekHdToWordIndex])

    const skipHdParagraph = useCallback((direction) => {
        const currentParagraph = findCurrentParagraph(sequencer.currentWordIndex)
        const targetParagraph = direction === 'forward'
            ? Math.min(currentParagraph + 1, Math.max(sequencer.paragraphs.length - 1, 0))
            : Math.max(currentParagraph - 1, 0)

        if (targetParagraph === currentParagraph) return

        const targetWordIndex = getWordIndexForParagraph(targetParagraph)
        seekHdToWordIndex(targetWordIndex)
    }, [findCurrentParagraph, getWordIndexForParagraph, sequencer.currentWordIndex, sequencer.paragraphs.length, seekHdToWordIndex])

    const playHd = useCallback(async () => {
        const audio = audioRef.current
        if (!audio) return


        if (sequencer.isPlaying || sequencer.isPaused) {
            sequencer.stop()
        }

        try {
            await audio.play()
        } catch (_) {

        }
    }, [sequencer])

    const pauseHd = useCallback(() => {
        const audio = audioRef.current
        if (!audio) return
        audio.pause()
    }, [])

    const applyHdPlaybackRate = useCallback((rate) => {
        const audio = audioRef.current
        if (!audio) return
        const safeRate = Math.max(0.1, Number(rate) || 1)
        audio.playbackRate = safeRate
    }, [])

    const recalculateHdBaseWpm = useCallback(() => {
        let nextBase = null

        if (sortedWordTimingsByIndex.length >= 2) {
            const first = sortedWordTimingsByIndex[0]
            const last = sortedWordTimingsByIndex[sortedWordTimingsByIndex.length - 1]
            const spokenSeconds = (last.start ?? 0) - (first.start ?? 0)
            const spokenWords = Math.max(1, (last.wordIndex ?? 0) - (first.wordIndex ?? 0) + 1)

            if (spokenSeconds > 0.25) {
                nextBase = (spokenWords / spokenSeconds) * 60
            }
        }

        if (!nextBase || !Number.isFinite(nextBase)) {
            const audio = audioRef.current
            if (audio && Number.isFinite(audio.duration) && audio.duration > 0.25) {
                const totalWords = Math.max(1, sequencer.totalWords || 0)
                nextBase = (totalWords / audio.duration) * 60
            }
        }

        hdBaseWpmRef.current = Math.max(30, Number.isFinite(nextBase) ? nextBase : 150)
    }, [sortedWordTimingsByIndex, sequencer.totalWords])

    const toHdPlaybackRate = useCallback((targetWpm) => {
        const base = Math.max(30, hdBaseWpmRef.current || 150)
        const desired = Math.max(1, Number(targetWpm) || 150)
        return Math.max(0.1, desired / base)
    }, [])

    const playActive = useCallback(() => {
        if (sequencer.continuing) return
        if (usingHdTransport) {
            playHd()
            return
        }
        sequencer.speak()
    }, [usingHdTransport, playHd, sequencer])

    const pauseActive = useCallback(() => {
        if (usingHdTransport) {
            pauseHd()
            return
        }
        sequencer.pause()
    }, [usingHdTransport, pauseHd, sequencer])

    const stopActive = useCallback(() => {
        if (usingHdTransport) {
            if (audioRef.current) audioRef.current.currentTime = 0
            playHd()
            return
        }
        sequencer.restartFromTop()
    }, [usingHdTransport, playHd, sequencer])

    const resumeActive = useCallback(() => {
        if (usingHdTransport) {
            playHd()
            return
        }
        sequencer.resume()
    }, [usingHdTransport, playHd, sequencer])


    const activeIsPlayingRef = useRef(false)
    const activeIsPausedRef = useRef(false)
    const activeSkipForwardWordRef = useRef(() => { })
    const activeSkipBackwardWordRef = useRef(() => { })
    const activeSkipForwardParagraphRef = useRef(() => { })
    const activeSkipBackwardParagraphRef = useRef(() => { })

    activeIsPlayingRef.current = usingHdTransport ? hdIsPlaying : sequencer.isPlaying
    activeIsPausedRef.current = usingHdTransport ? hdIsPaused : sequencer.isPaused

    activeSkipForwardWordRef.current = usingHdTransport
        ? () => skipHdWord(1)
        : () => sequencer.skipForwardWordRef.current?.()

    activeSkipBackwardWordRef.current = usingHdTransport
        ? () => skipHdWord(-1)
        : () => sequencer.skipBackwardWordRef.current?.()

    activeSkipForwardParagraphRef.current = usingHdTransport
        ? () => skipHdParagraph('forward')
        : () => sequencer.skipForwardParagraphRef.current?.()

    activeSkipBackwardParagraphRef.current = usingHdTransport
        ? () => skipHdParagraph('backward')
        : () => sequencer.skipBackwardParagraphRef.current?.()

    const volumeBy = useCallback((d) => {
        const val = Math.max(0, Math.min(1, Math.round(((volume ?? 1) + d) * 10) / 10))
        setVolume(val)
        applyVolume(val)
        if (!usingHdTransport) sequencer.requestSeamlessSettingsApply()
    }, [volume, applyVolume, usingHdTransport, sequencer])

    const keyboardController = useMemo(() => ({
        ...sequencer,
        speak: playActive,
        pause: pauseActive,
        resume: resumeActive,
        isPlayingRef: activeIsPlayingRef,
        isPausedRef: activeIsPausedRef,
        skipForwardWordRef: activeSkipForwardWordRef,
        skipBackwardWordRef: activeSkipBackwardWordRef,
        skipForwardParagraphRef: activeSkipForwardParagraphRef,
        skipBackwardParagraphRef: activeSkipBackwardParagraphRef,
        muteToggle: handleMuteToggle,
        scrollToCurrentWord: jumpToCurrent,
        restartFromTop: stopActive,
        volumeBy,
        reportWord: requestReport,
    }), [sequencer, playActive, pauseActive, resumeActive, stopActive, handleMuteToggle, jumpToCurrent, volumeBy, requestReport])

    useKeyboardShortcuts(keyboardController)

    useEffect(() => {
        if (!usingHdTransport) return
        recalculateHdBaseWpm()
        const newRate = toHdPlaybackRate(sequencer.currentWPM)
        applyHdPlaybackRate(newRate)
    }, [usingHdTransport, hdAudio?.audioUrl, sequencer.currentWPM, recalculateHdBaseWpm, toHdPlaybackRate, applyHdPlaybackRate])

    useEffect(() => {
        if (location.state?.recalledText) {

            sequencer.setText(location.state.recalledText)
        }

        if (location.state?.recalledAudioUrl) {
            setHdAudio(prev => {

                if (prev?.audioUrl === location.state.recalledAudioUrl) return prev;
                
                return {
                    audioUrl: location.state.recalledAudioUrl,
                    wordTimings: location.state.recalledWordTimings || [],
                }
            })
        }

    }, [location.state?.recalledText, location.state?.recalledAudioUrl])

    useEffect(() => {
        const entry = location.state?.entry
        if (!entry) return
        if (entry === 'write') chooseEntryMode('write')
        if (entry === 'upload') {
            closeCurrentDoc()
            setRichHtml('')
            try { sessionStorage.setItem('paperear_entry_mode', 'read') } catch { }
            setEntryMode('read')
        }
        navigate(location.pathname, { replace: true, state: null })
    }, [location.state?.entry])

    useEffect(() => {
        const audio = audioRef.current
        if (!audio) return

        const onPlay = () => {
            setHdIsPlaying(true)
            setHdIsPaused(false)

            if (sequencer.isPlaying || sequencer.isPaused) {
                sequencer.stop()
            }
            recalculateHdBaseWpm()
            const newRate = toHdPlaybackRate(sequencer.currentWPM)
            applyHdPlaybackRate(newRate)
        }

        const onPause = () => {
            const ended = audio.ended
            setHdIsPlaying(false)
            setHdIsPaused(!ended && audio.currentTime > 0)
        }

        const onEnded = () => {
            setHdIsPlaying(false)
            setHdIsPaused(false)
        }

        const onLoadedMetadata = () => {
            recalculateHdBaseWpm()
            const newRate = toHdPlaybackRate(sequencer.currentWPM)
            applyHdPlaybackRate(newRate)
        }

        audio.addEventListener('play', onPlay)
        audio.addEventListener('pause', onPause)
        audio.addEventListener('ended', onEnded)
        audio.addEventListener('loadedmetadata', onLoadedMetadata)

        return () => {
            audio.removeEventListener('play', onPlay)
            audio.removeEventListener('pause', onPause)
            audio.removeEventListener('ended', onEnded)
            audio.removeEventListener('loadedmetadata', onLoadedMetadata)
        }
    }, [sequencer, recalculateHdBaseWpm, toHdPlaybackRate, applyHdPlaybackRate])

    useEffect(() => {
        const audio = audioRef.current
        if (!audio || sortedWordTimings.length === 0) return

        const onTimeUpdate = () => {
            const t = audio.currentTime
            let lo = 0
            let hi = sortedWordTimings.length - 1
            let candidate = -1

            while (lo <= hi) {
                const mid = Math.floor((lo + hi) / 2)
                if (sortedWordTimings[mid].start <= t) {
                    candidate = mid
                    lo = mid + 1
                } else {
                    hi = mid - 1
                }
            }

            if (candidate >= 0) {
                const wordIndex = sortedWordTimings[candidate].wordIndex
                sequencer.setCurrentWordIndexFromAudio(wordIndex)
            }
        }

        audio.addEventListener('timeupdate', onTimeUpdate)
        return () => audio.removeEventListener('timeupdate', onTimeUpdate)

    }, [sortedWordTimings, sequencer.setCurrentWordIndexFromAudio])

    const handleGeneratedAudio = (payload) => {
        if (!payload) return

        if (typeof payload === 'string') {
            setHdAudio({ audioUrl: payload, wordTimings: [] })
            return
        }

        setHdAudio({
            audioUrl: payload.audioUrl,
            wordTimings: payload.wordTimings || [],
        })
    }

    const controlIsPlaying = usingHdTransport ? hdIsPlaying : sequencer.isPlaying
    const controlIsPaused = usingHdTransport ? hdIsPaused : sequencer.isPaused
    const waitingFor = sequencer.continuing ? 'pages' : !usingHdTransport && controlIsPlaying && !controlIsPaused && sequencer.buffering ? 'voice' : null
    const playWaiting = useDelayed(!!waitingFor)
    const waitingLabel = waitingFor === 'pages' ? t('busy.nextPages', 'Loading the next pages…') : t('busy.voice', 'Preparing the voice…')
    const stageLabel = sequencer.ocrBusy
        ? t('sequencer.ocrProgress', 'Preparing scanned pages… {{done}}/{{total}}').replace('{{done}}', sequencer.ocrBusy.done).replace('{{total}}', sequencer.ocrBusy.total)
        : sequencer.docLoading?.total
            ? t('busy.pagesProgress', 'Preparing page {{done}} of {{total}}…').replace('{{done}}', sequencer.docLoading.done).replace('{{total}}', sequencer.docLoading.total)
            : t('sequencer.loadingFile', 'Opening {{file}}…').replace('{{file}}', sequencer.docLoading?.name || '')
    const [checkIn, setCheckIn] = useState(null)
    const lastTouchRef = useRef(Date.now())
    useEffect(() => {
        const touched = () => { lastTouchRef.current = Date.now() }
        const events = ['pointerdown', 'keydown', 'wheel', 'touchstart']
        events.forEach((name) => window.addEventListener(name, touched, { passive: true }))
        return () => events.forEach((name) => window.removeEventListener(name, touched))
    }, [])
    const readingNow = controlIsPlaying && !controlIsPaused
    useEffect(() => {
        if (!readingNow) {
            if (checkIn === 'asking') setCheckIn(null)
            return undefined
        }
        if (checkIn === 'paused') setCheckIn(null)
        const tick = setInterval(() => {
            const quiet = Date.now() - lastTouchRef.current
            if (quiet >= IDLE_BEFORE_ASK + ASK_GRACE) {
                pauseActive()
                setCheckIn('paused')
            } else if (quiet >= IDLE_BEFORE_ASK) {
                setCheckIn('asking')
            }
        }, 15000)
        return () => clearInterval(tick)
    }, [readingNow, checkIn])
    useEffect(() => {
        if (controlIsPlaying && entryMode === 'write') setEditing(false)
    }, [controlIsPlaying, entryMode])

    const handleSkipForwardWord = usingHdTransport ? () => skipHdWord(1) : sequencer.skipForwardWord
    const handleSkipBackwardWord = usingHdTransport ? () => skipHdWord(-1) : sequencer.skipBackwardWord
    const handleSkipForwardParagraph = usingHdTransport ? () => skipHdParagraph('forward') : sequencer.skipForwardParagraph
    const handleSkipBackwardParagraph = usingHdTransport ? () => skipHdParagraph('backward') : sequencer.skipBackwardParagraph

    const handleWordClick = usingHdTransport ? seekHdToWordIndex : sequencer.jumpToWord

    const handleProgressInput = usingHdTransport
        ? (e) => {
            const idx = parseInt(e.target.value, 10)
            sequencer.setCurrentWordIndexFromAudio(idx)
        }
        : sequencer.handleProgressSliderInput

    const handleProgressChange = usingHdTransport
        ? (e) => {
            const idx = parseInt(e.target.value, 10)
            seekHdToWordIndex(idx)
        }
        : sequencer.handleProgressSliderChange

    const handleProgressMouseDown = usingHdTransport
        ? undefined
        : sequencer.handleProgressSliderMouseDown

    const handleProgressMouseUp = usingHdTransport
        ? (e) => {
            const idx = parseInt(e.target.value, 10)
            seekHdToWordIndex(idx)
        }
        : sequencer.handleProgressSliderMouseUp

    const handleProgressTouchEnd = usingHdTransport
        ? (e) => {
            const idx = parseInt(e.target.value, 10)
            seekHdToWordIndex(idx)
        }
        : sequencer.handleProgressSliderTouchEnd


    const lp = sequencer.loadedPages
    const rangeFrom = lp?.length ? lp[0].pageNum : null
    const rangeTo = lp?.length ? lp[lp.length - 1].pageNum : null
    const totalPages = sequencer.docMeta?.totalPages || 0
    const showRangeBar = rangeFrom != null && totalPages > 1
    const rangeSize = rangeFrom != null ? rangeTo - rangeFrom + 1 : 0
    const wordIndexNow = sequencer.currentWordIndex
    const currentPage = pagedView?.find((p) => p.words.length && wordIndexNow >= p.words[0].index && wordIndexNow <= p.words[p.words.length - 1].index)?.pageNum ?? rangeFrom ?? 1
    const whenRangeIdle = (action) => () => { if (!sequencer.rangeLoading) action() }

    const goToPage = (n) => {
        if (n < 1 || n > totalPages) return
        const page = pagedView?.find((p) => p.pageNum === n)
        if (page?.words.length) {
            handleWordClick(page.words[0].index)
            return
        }
        sequencer.shiftRange(n - (rangeFrom || 1))
    }

    const speedBy = (d) => {
        const newWPM = Math.max(WPM_MIN, Math.min(WPM_MAX, sequencer.currentWPM + d))
        const newRate = sequencer.wpmToRate(newWPM)
        sequencer.setCurrentWPM(newWPM)
        sequencer.setPlaybackRate(newRate)
        sequencer.currentPlaybackRateRef.current = newRate
        if (usingHdTransport) { recalculateHdBaseWpm(); applyHdPlaybackRate(toHdPlaybackRate(newWPM)) }
        else sequencer.requestSeamlessSettingsApply()
    }

    const shortcutRows = [
        { label: t('reader.scPlay', 'Play / Pause'), keys: ['Space'], onClick: () => (controlIsPlaying ? pauseActive() : playActive()) },
        { label: t('reader.scJump', 'Jump to current word'), keys: ['Ctrl', 'Space'], onClick: () => jumpToCurrent() },
        { label: t('reader.scStop', 'Read from the beginning'), keys: ['Ctrl', 'Home'], onClick: () => stopActive() },
        { label: t('reader.scPrevWord', 'Previous word'), keys: ['←'], onClick: () => handleSkipBackwardWord() },
        { label: t('reader.scNextWord', 'Next word'), keys: ['→'], onClick: () => handleSkipForwardWord() },
        { label: t('reader.scPrevPara', 'Previous paragraph'), keys: ['Ctrl', '←'], onClick: () => handleSkipBackwardParagraph() },
        { label: t('reader.scNextPara', 'Next paragraph'), keys: ['Ctrl', '→'], onClick: () => handleSkipForwardParagraph() },
        { label: t('reader.scFaster', 'Speed up'), keys: ['↑'], onClick: () => speedBy(10) },
        { label: t('reader.scSlower', 'Slow down'), keys: ['↓'], onClick: () => speedBy(-10) },
        { label: t('reader.scMute', 'Mute / Unmute'), keys: ['M'], onClick: () => handleMuteToggle() },
        { label: t('reader.scVolUp', 'Volume up'), keys: ['Ctrl', '↑'], onClick: () => volumeBy(0.1) },
        { label: t('reader.scVolDown', 'Volume down'), keys: ['Ctrl', '↓'], onClick: () => volumeBy(-0.1) },
    ]

    return (
        <div className="reader">

            {!entryMode && (
                <div className="entry-fork">
                    <h1 className="entry-fork-title">{t('reader.entryTitle', 'How do you want to read?')}</h1>
                    <div className="entry-fork-cards">
                        <button className="entry-fork-card" onClick={() => chooseEntryMode('read')}>
                            <span className="entry-fork-icon"><Icon name="reader" size={28} /></span>
                            <span className="entry-fork-name">{t('reader.entryRead', 'Open a document')}</span>
                            <span className="entry-fork-desc">{t('reader.entryReadDesc', 'Upload a PDF or text file and read it exactly as it is. Documents stay as their authors made them.')}</span>
                        </button>
                        <button className="entry-fork-card" onClick={() => chooseEntryMode('write')}>
                            <span className="entry-fork-icon"><Icon name="write" size={28} /></span>
                            <span className="entry-fork-name">{t('reader.entryWrite', 'Write or paste text')}</span>
                            <span className="entry-fork-desc">{t('reader.entryWriteDesc', 'Your own words — paste anything, edit freely, and have it read back to you.')}</span>
                        </button>
                    </div>
                </div>
            )}



            {sequencer.pendingRange && (
                <RangePicker
                    meta={sequencer.docMeta}
                    pdf={sequencer.docPdf}
                    docPages={sequencer.docPages}
                    suggested={sequencer.pendingRange}
                    onLoad={(from, to) => sequencer.loadPageRange(from, to)}
                    onLoadAll={() => sequencer.loadPageRange(1, sequencer.docMeta?.totalPages || 1)}
                    onCancel={() => (sequencer.text.trim() ? sequencer.cancelRangePicker() : closeCurrentDoc())}
                    busy={sequencer.ocrBusy}
                />
            )}


            <div className="reader-main">
                {sequencer.notification && !sequencer.docLoading && (
                    <div className="reader-notification" role="status">
                        {sequencer.ocrBusy ? <Busy label={sequencer.notification} showLabel announce={false} delay={0} /> : sequencer.notification}
                    </div>
                )}
                {providerHint && !checkIn && !sequencer.notification && (
                    <div className="reader-notification reader-offer" role="status">
                        <span>
                            {t('voices.providerHint', '{{lang}} sounds best with a provider voice.')
                                .replace('{{lang}}', languageName(providerHint, i18n.language))}
                        </span>
                        <span className="reader-offer__actions">
                            <button type="button" className="reader-offer__btn" onClick={() => { setProviderHint(null); navigate('/app/key') }}>{t('voices.providerHintGo', 'Add a key')}</button>
                            <button type="button" className="reader-offer__quiet" onClick={() => setProviderHint(null)}>{t('voices.offerLater', 'Not now')}</button>
                        </span>
                    </div>
                )}
                {checkIn && !sequencer.notification && (
                    <div className="reader-notification reader-offer" role="status">
                        <span>
                            {checkIn === 'asking'
                                ? t('reader.checkInAsk', 'Reading will pause in a minute to hold your place.')
                                : t('reader.checkInPaused', 'Paused here to hold your place. Press Space to pick up again.')}
                        </span>
                        {checkIn === 'asking' && (
                            <button type="button" className="reader-offer__btn" onClick={() => { lastTouchRef.current = Date.now(); setCheckIn(null) }}>
                                {t('reader.checkInGo', 'Keep going')}
                            </button>
                        )}
                    </div>
                )}
                {autoVoice && !sequencer.notification && !checkIn && (
                    <div className="reader-notification reader-offer" role="status">
                        {autoVoice.pct === null ? (
                            <>
                                <span>
                                    {t('voices.offerVoice', 'A free {{lang}} voice is ready: {{name}}, {{mb}} MB, downloaded once.')
                                        .replace('{{lang}}', languageName(autoVoice.lang, i18n.language))
                                        .replace('{{name}}', String(autoVoice.pick.label).split(' · ')[0])
                                        .replace('{{mb}}', Math.round(autoVoice.pick.bytes / 1e6))}
                                </span>
                                <span className="reader-offer__actions">
                                    <button type="button" className="reader-offer__btn" onClick={getAutoVoice}>{t('voices.offerGet', 'Get it')}</button>
                                    <button type="button" className="reader-offer__quiet" onClick={() => setAutoVoice(null)}>{t('voices.offerLater', 'Not now')}</button>
                                </span>
                            </>
                        ) : (
                            <Busy
                                label={autoVoice.pct === 'saving'
                                    ? t('busy.saving', 'Saving the voice…')
                                    : t('voices.gettingVoice', 'Getting a free {{lang}} voice… {{pct}}%').replace('{{lang}}', languageName(autoVoice.lang, i18n.language)).replace('{{pct}}', autoVoice.pct)}
                                showLabel
                                announce={false}
                                delay={0}
                            />
                        )}
                    </div>
                )}
                {(reportToast || reportSending) && (
                    <div className="report-toast" role="status">
                        {reportSending ? <Busy label={t('busy.sending', 'Sending…')} showLabel announce={false} delay={0} /> : reportToast}
                    </div>
                )}


                <PlaybackControls
                    text={sequencer.text}
                    isPlaying={controlIsPlaying}
                    isPaused={controlIsPaused}
                    hasText={!!sequencer.text.trim()}
                    voices={[...downloadedVoices, ...sequencer.voices]}
                    selectedVoice={sequencer.selectedVoice}
                    onVoicesChanged={refreshDownloadedVoices}
                    onSpeedPreset={(wpm) => speedBy(wpm - sequencer.currentWPM)}
                    onSpeedCommit={(wpm) => speedBy(wpm - sequencer.currentWPM)}
                    pauses={pauses}
                    onPausesChange={changePauses}
                    mixedVoices={mixedVoices}
                    onMixedVoicesChange={changeMixedVoices}
                    onVoiceChange={(v) => {
                        try { sessionStorage.setItem('paperear_voice_pinned', '1') } catch { }
                        sequencer.setSelectedVoice(v)
                        if (!usingHdTransport) sequencer.debouncedSettingsChange()
                    }}
                    currentWPM={sequencer.currentWPM}
                    volume={volume}
                    onVolumeChange={(e) => {
                        const val = parseFloat(e.target.value)
                        setVolume(val)
                        applyVolume(val)
                        if (!usingHdTransport) sequencer.requestSeamlessSettingsApply()
                    }}
                    onMuteToggle={handleMuteToggle}
                    onSpeedInput={(e) => {
                        const newWPM = parseInt(e.target.value, 10)
                        const newRate = sequencer.wpmToRate(newWPM)
                        sequencer.setCurrentWPM(newWPM)
                        sequencer.setPlaybackRate(newRate)
                        sequencer.currentPlaybackRateRef.current = newRate
                        if (usingHdTransport) {
                            recalculateHdBaseWpm()
                            applyHdPlaybackRate(toHdPlaybackRate(newWPM))
                        } else {
                            sequencer.requestSeamlessSettingsApply()
                        }
                    }}
                    onSpeedChange={(e) => {
                        const newWPM = parseInt(e.target.value, 10)
                        const newRate = sequencer.wpmToRate(newWPM)
                        sequencer.setCurrentWPM(newWPM)
                        sequencer.setPlaybackRate(newRate)
                        sequencer.currentPlaybackRateRef.current = newRate
                        if (usingHdTransport) {
                            recalculateHdBaseWpm()
                            applyHdPlaybackRate(toHdPlaybackRate(newWPM))
                        } else {
                            sequencer.requestSeamlessSettingsApply()
                        }
                    }}
                    onPlay={playActive}
                    onPause={pauseActive}
                    onStop={stopActive}
                    onResume={resumeActive}
                    waiting={playWaiting}
                    waitingLabel={waitingLabel}
                    onSkipForwardWord={handleSkipForwardWord}
                    onSkipBackwardWord={handleSkipBackwardWord}
                    onSkipForwardParagraph={handleSkipForwardParagraph}
                    onSkipBackwardParagraph={handleSkipBackwardParagraph}
                    getSeekHoldHandlers={!usingHdTransport ? sequencer.getSeekHoldHandlers : undefined}
                >
                    <ProgressBar
                        currentWordIndex={sequencer.currentWordIndex}
                        totalWords={sequencer.totalWords}
                        formatProgress={sequencer.formatProgress}
                        onInput={handleProgressInput}
                        onChange={handleProgressChange}
                        onMouseDown={handleProgressMouseDown}
                        onMouseUp={handleProgressMouseUp}
                        onTouchEnd={handleProgressTouchEnd}
                        disabled={!sequencer.text.trim()}
                    />
                    {sequencer.text.trim() && (
                        <div className="dock-views">
                            {!sequencer.docPdf && (
                                <button type="button" className={'dock-chip' + (!focusMode && !docView ? ' is-active' : '')} onClick={() => { setDocView(false); setFocusMode(false) }}>
                                    {t('reader.textMode', 'Text')}
                                </button>
                            )}
                            <button type="button" className={'dock-chip' + (focusMode && !docView ? ' is-active' : '')} onClick={() => { setDocView(false); setFocusMode(true) }}>
                                {t('reader.focusMode', 'Flow')}
                            </button>
                            {sequencer.docPdf && (
                                <button type="button" className={'dock-chip' + (docView ? ' is-active' : '')} onClick={() => { setFocusMode(false); setDocView(true) }}>
                                    {t('reader.documentMode', 'Page')}
                                </button>
                            )}
                            {entryMode === 'write' && !editing && (
                                <button type="button" className="dock-chip" onClick={() => { if (controlIsPlaying) pauseActive(); setEditing(true) }}>
                                    {t('reader.edit', 'Edit')}
                                </button>
                            )}
                            <button type="button" className="dock-chip" onClick={closeCurrentDoc} title={t('reader.closeDocument', 'Put away')}>
                                ✕ {t('reader.closeDocument', 'Put away')}
                            </button>
                        </div>
                    )}
                </PlaybackControls>




                <div className="reader-text-container" style={{ position: 'relative' }}>
                    {entryMode === 'write' && editing ? (
                        <WriteSheet
                            text={sequencer.text}
                            richHtml={richHtml}
                            onTextChange={sequencer.setText}
                            onRichHtmlChange={setRichHtml}
                            onRead={() => { setEditing(false); playActive() }}
                            notification={sequencer.notification}
                        />
                    ) : sequencer.docLoading ? (
                        <>
                            <Busy label={stageLabel} showLabel announce={false} className="busy--stage" />
                            <Busy label={t('sequencer.loadingFile', 'Opening {{file}}…').replace('{{file}}', sequencer.docLoading.name || '')} className="busy--quiet" />
                        </>
                    ) : entryMode === 'read' && !sequencer.text.trim() && !sequencer.docPdf && !sequencer.pendingRange && !sequencer.notification ? (
                        <OpenSheet
                            onFileUpload={sequencer.handleFileUpload}
                            onWriteInstead={() => chooseEntryMode('write')}
                        />
                    ) : docView && sequencer.docPdf ? (
                        <DocumentScroll
                            pdf={sequencer.docPdf}
                            pagedView={pagedView || []}
                            loadedPages={sequencer.loadedPages}
                            currentWordIndex={sequencer.currentWordIndex}
                            onWordClick={handleWordClick}
                            jumpTick={docJumpTick}
                            ocrItemsByPage={sequencer.ocrItemsByPage}
                            bookmarkedPage={sequencer.bookmark}
                            onToggleBookmark={sequencer.toggleBookmark}
                            isPlaying={controlIsPlaying}
                            isPaused={controlIsPaused}
                            waiting={playWaiting}
                            onPlayPause={() => (controlIsPlaying && !controlIsPaused ? pauseActive() : playActive())}
                            onSkipBackWord={() => activeSkipBackwardWordRef.current?.()}
                            onSkipForwardWord={() => activeSkipForwardWordRef.current?.()}
                            getSeekHoldHandlers={!usingHdTransport ? sequencer.getSeekHoldHandlers : undefined}
                            onReportWord={reportCurrentWord}
                            openReportTick={reportTick}
                            totalPages={totalPages}
                            onOpenPage={goToPage}
                            scanning={sequencer.ocrBusy?.pages}
                        />
                    ) : (
                    <TextDisplay
                        words={sequencer.words}
                        currentWordIndex={sequencer.currentWordIndex}
                        onWordClick={handleWordClick}
                        richHtml={richHtml}
                        pages={richHtml && !sequencer.docPdf && !sequencer.loadedPages.length ? null : pagedView}
                        focusMode={focusMode}
                        isPlaying={controlIsPlaying}
                        isPaused={controlIsPaused}
                        waiting={playWaiting}
                        onPlayPause={() => (controlIsPlaying && !controlIsPaused ? pauseActive() : playActive())}
                        onSkipBackWord={() => activeSkipBackwardWordRef.current?.()}
                        onSkipForwardWord={() => activeSkipForwardWordRef.current?.()}
                        getSeekHoldHandlers={!usingHdTransport ? sequencer.getSeekHoldHandlers : undefined}
                        onReportWord={reportCurrentWord}
                        openReportTick={reportTick}
                    />
                    )}


                    {sequencer.text.trim() && !(entryMode === 'write' && editing) && (
                        <button
                            onClick={jumpToCurrent}
                            className="reader-jump-btn"
                            title={`${t('reader.jumpToWord', 'Continue reading')} (Ctrl+Space)`}
                        >
                            {t('reader.jumpToWord', 'Continue reading')}
                        </button>
                    )}
                </div>


                {sequencer.text.trim() && (
                    <div className="reader-bottombar">
                        {showRangeBar && !docView && (
                            <div className="reader-rangebar" aria-busy={sequencer.rangeLoading || undefined}>
                                <span className="reader-rangebar-label">
                                    {t('reader.pages', 'Pages')} {rangeFrom}–{rangeTo}
                                    <span className="reader-rangebar-total"> / {totalPages}</span>
                                </span>
                                <div className="reader-rangebar-btns">
                                    <button disabled={rangeFrom <= 1} aria-disabled={sequencer.rangeLoading || undefined} onClick={whenRangeIdle(() => sequencer.shiftRange(-10))} title={t('reader.back10', 'Back 10 pages')}>−10</button>
                                    <button disabled={rangeFrom <= 1} aria-disabled={sequencer.rangeLoading || undefined} onClick={whenRangeIdle(() => sequencer.shiftRange(-5))} title={t('reader.back5', 'Back 5 pages')}>−5</button>
                                    <button disabled={rangeFrom <= 1} aria-disabled={sequencer.rangeLoading || undefined} onClick={whenRangeIdle(() => sequencer.shiftRange(-1))} title={t('reader.back1', 'Back 1 page')}>‹</button>
                                    <button disabled={rangeTo >= totalPages} aria-disabled={sequencer.rangeLoading || undefined} onClick={whenRangeIdle(() => sequencer.shiftRange(1))} title={t('reader.fwd1', 'Forward 1 page')}>›</button>
                                    <button disabled={rangeTo >= totalPages} aria-disabled={sequencer.rangeLoading || undefined} onClick={whenRangeIdle(() => sequencer.shiftRange(5))} title={t('reader.fwd5', 'Forward 5 pages')}>+5</button>
                                    <button disabled={rangeTo >= totalPages} aria-disabled={sequencer.rangeLoading || undefined} onClick={whenRangeIdle(() => sequencer.shiftRange(10))} title={t('reader.fwd10', 'Forward 10 pages')}>+10</button>
                                </div>
                                <div className="reader-rangebar-btns">
                                    <button disabled={rangeSize <= 5} aria-disabled={sequencer.rangeLoading || undefined} onClick={whenRangeIdle(() => sequencer.loadPageRange(rangeFrom, rangeFrom + rangeSize - 6))} title={t('reader.fewerPages', 'Load 5 fewer pages')}>−</button>
                                    <span className="reader-rangebar-size">{rangeSize} {t('reader.pagesUnit', 'pages')}</span>
                                    <button disabled={rangeTo >= totalPages} aria-disabled={sequencer.rangeLoading || undefined} onClick={whenRangeIdle(() => sequencer.loadPageRange(rangeFrom, Math.min(totalPages, rangeTo + 5)))} title={t('reader.morePages', 'Load 5 more pages')}>+</button>
                                </div>
                                <label className="reader-rangebar-goto">
                                    <span>{t('reader.jumpToPage', 'Go to page')}</span>
                                    <RangeBox value={currentPage} min={1} max={totalPages} title={t('reader.jumpToPage', 'Go to page')} onCommit={goToPage} />
                                </label>
                            </div>
                        )}
                        <button className="reader-sc-btn" onClick={() => setShowShortcuts(true)} title={t('reader.shortcuts', 'Shortcuts')}>
                            ⌨ {t('reader.shortcuts', 'Shortcuts')}
                        </button>
                    </div>
                )}


                {showShortcuts && (
                    <div className="reader-sc-overlay" onClick={() => setShowShortcuts(false)}>
                        <div className="reader-sc-modal" onClick={(e) => e.stopPropagation()}>
                            <div className="reader-sc-head">
                                <span>{t('reader.shortcutsTitle', 'Keyboard Shortcuts')}</span>
                                <button className="reader-sc-close" onClick={() => setShowShortcuts(false)} aria-label={t('reader.close', 'Close')}>✕</button>
                            </div>
                            <div className="reader-sc-list">
                                {shortcutRows.map((r) => (
                                    <button key={r.label} className="reader-sc-row" onClick={r.onClick}>
                                        <span className="reader-sc-row-label">{r.label}</span>
                                        <span className="reader-sc-row-keys">{r.keys.map((k, i) => <kbd key={i}>{k}</kbd>)}</span>
                                    </button>
                                ))}
                            </div>
                            <div className="reader-sc-foot">{t('reader.shortcutsFoot', 'Click a row to use it — or press the key while reading.')}</div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
