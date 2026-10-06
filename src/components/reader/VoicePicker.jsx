import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { askWhereToSave, catalog, download, importVoiceFiles, piperId, piperName, pickVoiceFolder, reconnectVoiceFolder, remove, storedIds, synthesize as piperSynthesize, voiceFolderState } from '../../services/piperEngine'
import { describeVoice, isKeyVoice, isOpenVoice, voiceBars } from '../../utils/voicePreference'
import { RECOMMENDED_VOICES, langCode, languageName, previewSample, voiceSections } from '../../utils/voiceGroups'
import { PROVIDER_FIRST } from '../../data/voiceProviders'
import Busy, { BusyDots, useDelayed } from '../Busy'
import './VoicePicker.css'

export function SoundMark({ seed, live = false, size = 'md' }) {
    const bars = voiceBars(seed)
    return (
        <svg className={`sound-mark sound-mark--${size}` + (live ? ' is-live' : '')} viewBox="0 0 56 20" aria-hidden="true">
            {bars.map((h, i) => (
                <rect key={i} x={i * 4} y={10 - h * 9} width="2.4" height={Math.max(2, h * 18)} rx="1.2" style={{ animationDelay: `${(i % 5) * 90}ms` }} />
            ))}
        </svg>
    )
}

const isSystemVoice = (name) => !isOpenVoice(name) && !isKeyVoice(name)
const isRecommended = (id) => (RECOMMENDED_VOICES[langCode(id)] || []).includes(id)

export function VoiceGallery({ voices, selectedVoice, onVoiceChange, onVoicesChanged, canPreview, sample, docLang, onClose }) {
    const { t, i18n } = useTranslation()
    const uiLang = String(i18n.language || 'en').slice(0, 2)
    const [shelf, setShelf] = useState([])
    const [stored, setStored] = useState([])
    const [busy, setBusy] = useState({})
    const [error, setError] = useState('')
    const [previewing, setPreviewing] = useState('')
    const [folder, setFolder] = useState({ supported: false, checked: false })
    const [added, setAdded] = useState(null)
    const [folderBusy, setFolderBusy] = useState(false)
    const [heard, setHeard] = useState(false)
    const previewWaiting = useDelayed(!!previewing && !heard)
    const playing = useRef(null)
    const picker = useRef(null)
    const filePicker = useRef(null)

    const refresh = async () => {
        try {
            const [list, ids, place] = await Promise.all([catalog(), storedIds(), voiceFolderState()])
            setShelf(list)
            setStored(ids)
            setFolder({ ...place, checked: true })
            setError('')
        } catch (e) {
            setError(e.message)
        }
    }

    const addFromFolder = async (files) => {
        setAdded('busy')
        try {
            const count = await importVoiceFiles(files)
            await refresh()
            onVoicesChanged?.()
            setAdded(count)
        } catch (e) {
            setAdded(null)
            setError(e.message)
        }
    }

    const withFolder = async (act) => {
        try {
            await act()
            setFolderBusy(true)
            await refresh()
            onVoicesChanged?.()
        } catch (e) {
            if (e?.name !== 'AbortError') setError(e.message)
        } finally {
            setFolderBusy(false)
        }
    }

    const stopPreview = () => {
        const current = playing.current
        playing.current = null
        if (current?.audio) {
            current.audio.pause()
            URL.revokeObjectURL(current.audio.src)
        }
        if (current?.speech) window.speechSynthesis?.cancel()
        setPreviewing('')
    }

    useEffect(() => {
        refresh()
        return stopPreview
    }, [])
    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [onClose])

    const preview = async (voice) => {
        const wasThis = previewing === voice.name
        stopPreview()
        if (wasThis) return
        const code = langCode(voice.lang || (isOpenVoice(voice.name) ? piperId(voice.name) : ''))
        const line = previewSample(sample, code, docLang) || t('controls.previewLine', { lng: code === 'ar' ? 'ar' : 'en', defaultValue: 'Every page, read to you.' })
        setPreviewing(voice.name)
        setHeard(false)
        const token = {}
        playing.current = token
        try {
            if (isOpenVoice(voice.name)) {
                const blob = await piperSynthesize(line, piperId(voice.name), { droppable: false })
                if (playing.current !== token) return
                token.audio = new Audio(URL.createObjectURL(blob))
                token.audio.onended = () => { if (playing.current === token) stopPreview() }
                await token.audio.play()
                if (playing.current === token) setHeard(true)
            } else {
                const utterance = new SpeechSynthesisUtterance(line)
                utterance.voice = window.speechSynthesis.getVoices().find((v) => v.name === voice.name) || null
                utterance.lang = voice.lang || ''
                utterance.onend = () => { if (playing.current === token) stopPreview() }
                token.speech = true
                utterance.onstart = () => { if (playing.current === token) setHeard(true) }
                utterance.onerror = () => { if (playing.current === token) stopPreview() }
                window.speechSynthesis.speak(utterance)
            }
        } catch {
            if (playing.current === token) stopPreview()
        }
    }

    const track = (id, value) => setBusy((b) => {
        const next = { ...b }
        if (value === undefined) delete next[id]
        else next[id] = value
        return next
    })

    const get = async (id) => {
        const whereToSave = folder.state === 'granted' ? Promise.resolve(null) : askWhereToSave(id)
        track(id, 0)
        try {
            await download(id, (p) => track(id, Math.round((p.loaded * 100) / (p.total || 1))), () => track(id, 'saving'), await whereToSave)
            await refresh()
            onVoicesChanged?.()
            if (!isOpenVoice(selectedVoice) && !isKeyVoice(selectedVoice)) onVoiceChange(piperName(id))
        } catch (e) {
            setError(e.message)
        } finally {
            track(id)
        }
    }

    const drop = async (voice) => {
        const id = piperId(voice.name)
        track(id, 'removing')
        try {
            if (previewing === voice.name) stopPreview()
            await remove(id)
            await refresh()
            onVoicesChanged?.()
            if (selectedVoice === voice.name) {
                const fallback = voices.find((v) => isSystemVoice(v.name) && langCode(v.lang) === langCode(id)) || voices.find((v) => isSystemVoice(v.name))
                if (fallback) onVoiceChange(fallback.name)
            }
        } catch (e) {
            setError(e.message)
        } finally {
            track(id)
        }
    }

    const first = [docLang, uiLang, 'ar', 'en'].filter((c, i, a) => /^[a-z]{2,3}$/.test(c || '') && a.indexOf(c) === i)
    const ready = voices.filter((v) => !isOpenVoice(v.name) || !shelf.length || stored.includes(piperId(v.name)))
    const { list, other } = voiceSections({ ready, catalog: shelf, stored, first })
    const shelfEntry = (name) => shelf.find((v) => v.id === piperId(name))
    const badges = {
        open: t('controls.badgeOpen', 'Free · offline'),
        key: t('controls.badgeKey', 'Your key'),
        browser: t('controls.badgeBrowser', 'Browser'),
    }

    const openDetail = (id) => {
        const region = id.split('-')[0].split('_')[1] || ''
        const quality = id.split('-').pop()
        let country = region
        try { country = new Intl.DisplayNames([uiLang], { type: 'region' }).of(region) || region } catch { }
        return `${country} · ${t(`voices.quality.${quality}`, quality.replace('_', ' '))}`
    }

    const readyCard = (voice) => {
        const info = describeVoice(voice, uiLang)
        const active = voice.name === selectedVoice
        const entry = info.kind === 'open' ? shelfEntry(voice.name) : null
        const removing = entry && busy[entry.id] === 'removing'
        return (
            <li key={voice.name} className={`vp-card vp-card--${info.kind}` + (active ? ' is-active' : '')}>
                <button type="button" className="vp-card__pick" onClick={() => onVoiceChange(voice.name)} aria-pressed={active}>
                    <SoundMark seed={voice.name} live={previewing === voice.name && heard} />
                    <span className="vp-card__title">{info.title}</span>
                    <span className="vp-card__detail">{info.kind === 'open' ? openDetail(piperId(voice.name)) : info.detail}</span>
                    <span className="vp-badge">{active ? t('voices.inUse', 'In use') : badges[info.kind]}</span>
                    {entry && isRecommended(entry.id) && <span className="vp-badge vp-badge--recommended">{t('voices.recommended', 'Recommended')}</span>}
                </button>
                {canPreview && info.kind !== 'key' && (
                    <button type="button" className={'vp-card__hear' + (previewing === voice.name ? ' is-on' : '')} onClick={() => preview(voice)} aria-busy={(previewing === voice.name && previewWaiting) || undefined} aria-label={t('controls.hear', 'Hear this voice')} title={t('controls.hear', 'Hear this voice')}>
                        {previewing === voice.name ? (previewWaiting ? <BusyDots /> : '■') : '▶'}
                    </button>
                )}
                {entry && (
                    <div className="vp-card__foot">
                        <a className="vp-card__licence" href={entry.card} target="_blank" rel="noopener noreferrer">{entry.licence}</a>
                        <button type="button" className="vp-card__quiet" onClick={() => drop(voice)} disabled={removing}>
                            {removing ? '…' : t('voices.remove', 'Remove')}
                        </button>
                    </div>
                )}
            </li>
        )
    }

    const freeCard = (entry) => {
        const name = piperName(entry.id)
        const info = describeVoice({ name, label: entry.label }, uiLang)
        const progress = busy[entry.id]
        return (
            <li key={entry.id} className="vp-card vp-card--get">
                <div className="vp-card__body">
                    <SoundMark seed={name} />
                    <span className="vp-card__title">{info.title}</span>
                    <span className="vp-card__detail">{info.kind === 'open' ? openDetail(entry.id) : info.detail}</span>
                    {isRecommended(entry.id) && <span className="vp-badge vp-badge--recommended">{t('voices.recommended', 'Recommended')}</span>}
                </div>
                <div className="vp-card__foot">
                    <a className="vp-card__licence" href={entry.card} target="_blank" rel="noopener noreferrer">{entry.licence}</a>
                    <button type="button" className="vp-card__get" onClick={() => get(entry.id)} disabled={progress !== undefined} aria-busy={progress !== undefined || undefined}>
                        {progress === undefined
                            ? `${t('voices.download', 'Download')} · ${Math.round(entry.bytes / 1e6)} MB`
                            : typeof progress === 'number' && progress > 0
                                ? `${progress}%`
                                : <Busy label={progress === 'saving' ? t('busy.saving', 'Saving the voice…') : t('busy.starting', 'Starting the download…')} showLabel announce={false} delay={0} />}
                    </button>
                </div>
                {progress !== undefined && <span className="vp-card__progress" style={{ width: `${typeof progress === 'number' ? progress : 100}%` }} />}
            </li>
        )
    }

    return (
        <div className="vp-gallery" role="group" aria-label={t('controls.voice', 'Voice')}>
            <Busy active={previewWaiting} delay={0} label={t('busy.voice', 'Preparing the voice…')} className="busy--quiet" />
            {!folder.checked && !error && <p className="vp-note vp-folder"><Busy label={t('busy.voices', 'Looking for your voices…')} showLabel /></p>}
            {folder.supported && (
                <p className="vp-note vp-folder">
                    {folder.state === 'none' && (
                        <>
                            <span>{t('voices.folderOffer', 'Keep downloaded voices in a folder on this computer, so clearing the browser never removes them.')}</span>
                            <button type="button" className="vp-card__quiet" onClick={() => withFolder(pickVoiceFolder)} disabled={folderBusy}>{t('voices.folderChoose', 'Choose a folder')}</button>
                        </>
                    )}
                    {folder.state === 'granted' && (
                        <>
                            <span>{t('voices.folderIn', 'Voices are kept in the folder “{{name}}”.').replace('{{name}}', folder.name)}</span>
                            <button type="button" className="vp-card__quiet" onClick={() => withFolder(pickVoiceFolder)} disabled={folderBusy}>{t('voices.folderChange', 'Change')}</button>
                        </>
                    )}
                    {folder.state !== 'none' && folder.state !== 'granted' && (
                        <>
                            <span>{t('voices.folderAsk', 'Your voices are in the folder “{{name}}”. Allow Paperear to open it again.').replace('{{name}}', folder.name)}</span>
                            <button type="button" className="vp-card__get" onClick={() => withFolder(reconnectVoiceFolder)} disabled={folderBusy}>{t('voices.folderReconnect', 'Open the folder')}</button>
                        </>
                    )}
                    <Busy active={folderBusy} label={t('busy.folder', 'Checking the folder…')} showLabel />
                </p>
            )}
            {folder.checked && !folder.supported && (
                <p className="vp-note vp-folder">
                    <span>
                        {added === 'busy'
                            ? <Busy label={t('voices.importing', 'Adding voices…')} showLabel delay={0} />
                            : typeof added === 'number'
                                ? t('voices.imported', 'Voices added: {{count}}.').replace('{{count}}', added)
                                : t('voices.importOffer', 'Have voice files on this computer? Add them here, with no download.')}
                    </span>
                    <button type="button" className="vp-card__quiet" onClick={() => filePicker.current?.click()} disabled={added === 'busy'} title={t('voices.importFilesHint', 'Pick both files of each voice: the .onnx and the .onnx.json')}>{t('voices.importFiles', 'Choose voice files')}</button>
                    <input ref={filePicker} type="file" accept=".zip,.onnx,.json" multiple hidden onChange={(e) => { addFromFolder(e.target.files); e.target.value = '' }} />
                </p>
            )}
            {error && <p className="vp-note vp-note--error">{error}</p>}
            {other.length > 0 && (
                <section className="vp-lang vp-lang--key">
                    <h3>{t('controls.groupKey', 'Your key')}</h3>
                    <ul className="vp-grid">{other.map(readyCard)}</ul>
                </section>
            )}
            {list.map((section) => {
                const lang = languageName(section.code, uiLang)
                const hasOpen = section.free.length > 0 || section.ready.some((v) => isOpenVoice(v.name))
                const note = section.ready.length ? t('voices.noneFor') : t('voices.noDeviceVoice')
                return (
                    <details key={section.code} className="vp-lang" open={first.includes(section.code)}>
                        <summary>
                            <span className="vp-lang__name">{lang}</span>
                            <span className="vp-lang__count">{section.ready.length + section.free.length}</span>
                        </summary>
                        {PROVIDER_FIRST.includes(section.code) ? (
                            <p className="vp-note">
                                {t('voices.providerNote', 'For natural {{lang}}, a voice from a provider sounds best.').replace('{{lang}}', lang)}{' '}
                                <Link to="/app/key" onClick={onClose}>{t('voices.providerHintGo', 'Add a key')}</Link>
                            </p>
                        ) : !hasOpen && <p className="vp-note">{note.replaceAll('{{lang}}', lang)}</p>}
                        {section.ready.length + section.free.length > 0 && (
                            <ul className="vp-grid">
                                {section.ready.map(readyCard)}
                                {section.free.map(freeCard)}
                            </ul>
                        )}
                    </details>
                )
            })}
            <p className="vp-note">
                <Link to="/app/key" onClick={onClose}>{t('voices.keyLink', 'Have a key from a voice provider? Add it under Key.')}</Link>
            </p>
        </div>
    )
}

export default function VoicePill({ voices, selectedVoice, open, onToggle, disabled }) {
    const { t, i18n } = useTranslation()
    const current = voices.find((v) => v.name === selectedVoice) || { name: selectedVoice || '' }
    const info = describeVoice(current, String(i18n.language || 'en').slice(0, 2))
    const kindLabel = { open: t('controls.badgeOpen', 'Free · offline'), key: t('controls.badgeKey', 'Your key'), browser: t('controls.badgeBrowser', 'Browser') }[info.kind]
    return (
        <button type="button" className={`vp-pill vp-pill--${info.kind}` + (open ? ' is-open' : '')} onClick={onToggle} aria-expanded={open} disabled={disabled} title={t('controls.voice', 'Voice')}>
            <SoundMark seed={current.name} size="sm" />
            <span className="vp-pill__name">{info.title || t('controls.voice', 'Voice')}</span>
            <span className="vp-badge">{kindLabel}</span>
            <span className="vp-pill__caret" aria-hidden="true">{open ? '▾' : '▴'}</span>
        </button>
    )
}
