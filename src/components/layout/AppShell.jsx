import React, { useMemo, useState } from 'react'
import { NavLink, Outlet, Link, useNavigate } from 'react-router-dom'
import { NAV_ITEMS, APP_NAME } from '../../utils/constants'
import { useTranslation } from 'react-i18next'
import ThemeSwitcher from './ThemeSwitcher'
import ProfileMenu from './ProfileMenu'
import Icon from '../icons'
import './AppShell.css'

/**
 * AppShell — Layout wrapper for authenticated /app/* routes.
 * Provides sidebar navigation and top bar.
 */
export default function AppShell() {
    const { t, i18n } = useTranslation()
    const navigate = useNavigate()
    const [tunerReady, setTunerReady] = useState(false)
    const [tunerOpen, setTunerOpen] = useState(false)
    const tuner = useMemo(() => ({ ready: tunerReady, open: tunerOpen && tunerReady, setReady: setTunerReady, setOpen: setTunerOpen }), [tunerReady, tunerOpen])
    const tuneLabel = t('nav.tune', 'Tune')
    const tuneTitle = tunerReady ? tuneLabel : t('nav.tuneLocked', 'Open a document or write some text to tune the reading')

    return (
        <div className="app-shell">
            {/* Sidebar */}
            <aside className="shell-sidebar">
                <Link to="/app/reader" className="shell-logo">
                    <img className="shell-logo-mark" src="/paperear-mark.png" alt="" width="18" height="25" />
                    <span className="shell-logo-text">{APP_NAME}</span>
                </Link>

                <nav className="shell-nav">
                    {NAV_ITEMS.map((item) => item.entry ? (
                        <button
                            key={item.key}
                            type="button"
                            className="shell-nav-item shell-nav-item--action"
                            onClick={() => navigate('/app/reader', { state: { entry: item.entry } })}
                        >
                            <span className="shell-nav-icon"><Icon name={item.icon} /></span>
                            <span className="shell-nav-label">{t(`nav.${item.key}`, item.label)}</span>
                        </button>
                    ) : (
                        <NavLink
                            key={item.key}
                            to={item.path}
                            end={item.path === '/app'}
                            className={({ isActive }) =>
                                `shell-nav-item ${isActive ? 'shell-nav-item--active' : ''}`
                            }
                        >
                            <span className="shell-nav-icon"><Icon name={item.icon} /></span>
                            <span className="shell-nav-label">{t(`nav.${item.key}`, item.label)}</span>
                        </NavLink>
                    ))}
                    <button
                        type="button"
                        className={'shell-nav-item shell-nav-item--action' + (tuner.open ? ' shell-nav-item--active' : '') + (tunerReady ? '' : ' shell-nav-item--locked')}
                        data-tune-toggle=""
                        aria-disabled={!tunerReady}
                        aria-expanded={tunerReady ? tuner.open : undefined}
                        aria-label={tuneTitle}
                        title={tuneTitle}
                        onClick={() => { if (tunerReady) setTunerOpen((open) => !open) }}
                    >
                        <span className="shell-nav-icon"><Icon name="tune" /></span>
                        <span className="shell-nav-label">{tuneLabel}</span>
                    </button>

                    <div className="shell-nav-foot">
                        <ThemeSwitcher />
                    </div>
                </nav>

                <ProfileMenu />
            </aside>

            {/* Main Content */}
            <main className={'shell-main' + (tuner.open ? ' shell-main--tuned' : '')}>
                <Outlet context={{ tuner }} />
            </main>
        </div>
    )
}
