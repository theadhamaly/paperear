import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import * as docStore from '../services/docStore'
import { forgetDoc } from '../services/forgetDoc'
import { docKind, filterDocs, formatSize } from '../utils/libraryModel'
import Busy from '../components/Busy'
import './Library.css'

const GLYPH = { pdf: 'PDF', markdown: 'MD', epub: 'EPUB', docx: 'DOCX', text: 'TXT' }

export default function Library() {
    const { t, i18n } = useTranslation()
    const navigate = useNavigate()
    const [docs, setDocs] = useState(null)
    const [query, setQuery] = useState('')
    const [working, setWorking] = useState(null)
    const [failed, setFailed] = useState(false)

    const refresh = () => docStore.recentDocs().then(setDocs).catch(() => setDocs((current) => current || []))
    useEffect(() => { refresh() }, [])

    const open = (doc) => {
        try {
            localStorage.setItem('paperear_last_source', JSON.stringify({ kind: 'file', id: doc.id }))
            sessionStorage.setItem('paperear_entry_mode', 'read')
        } catch { }
        navigate('/app/reader')
    }

    const rename = async (doc) => {
        if (working) return
        setFailed(false)
        const name = window.prompt(t('library.renamePrompt'), doc.name)
        if (!name || name.trim() === doc.name) return
        setWorking(doc.id)
        try {
            await docStore.renameDoc(doc.id, name.trim())
            await refresh()
        } catch {
            setFailed(true)
        } finally {
            setWorking(null)
        }
    }

    const remove = async (doc) => {
        if (working) return
        setFailed(false)
        if (!window.confirm(t('library.confirmDelete'))) return
        setWorking(doc.id)
        try {
            await docStore.deleteDoc(doc.id)
            await forgetDoc(doc.id)
            try {
                const last = JSON.parse(localStorage.getItem('paperear_last_source') || 'null')
                if (last?.id === doc.id) localStorage.removeItem('paperear_last_source')
            } catch { }
            await refresh()
        } catch {
            setFailed(true)
        } finally {
            setWorking(null)
        }
    }

    const rows = filterDocs(docs || [], query)
    const rtl = i18n.dir() === 'rtl'
    const locale = i18n.language === 'ar' ? 'ar-EG' : 'en-GB'

    return (
        <div className="library">
            <header className="library-header">
                <Link to="/app/reader" className="library-back">{rtl ? '›' : '‹'} {t('library.backToReading')}</Link>
                <h1 className="library-title">
                    {t('library.title')} <span className="library-count">{docs?.length ?? ''}</span>
                </h1>
                <input
                    className="library-search"
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t('library.search')}
                />
            </header>
            {failed && <p className="library-empty" role="alert">{t('library.failed', 'That did not work. Please try again.')}</p>}
            {docs === null ? <p className="library-empty"><Busy label={t('busy.shelf', 'Loading your shelf…')} showLabel /></p> : rows.length === 0 && <p className="library-empty">{t('library.empty')}</p>}
            <ul className="library-list">
                {rows.map((doc) => {
                    const kind = docKind(doc)
                    return (
                        <li key={doc.id} className="library-row">
                            <button className={`library-kind library-kind--${kind}`} onClick={() => open(doc)}>{GLYPH[kind]}</button>
                            <div className="library-body">
                                <button className="library-name" onClick={() => open(doc)}>{doc.name}</button>
                                <div className="library-meta">
                                    {formatSize(doc.size)} · {new Date(doc.savedAt || 0).toLocaleDateString(locale)}
                                </div>
                            </div>
                            <div className="library-actions">
                                {working === doc.id && <Busy label={t('busy.working', 'Working…')} className="busy--quiet" />}
                                <button className="library-action" onClick={() => rename(doc)} disabled={!!working}>{t('library.rename')}</button>
                                <button className="library-action library-action--delete" onClick={() => remove(doc)} disabled={!!working}>{t('library.delete')}</button>
                            </div>
                        </li>
                    )
                })}
            </ul>
        </div>
    )
}
