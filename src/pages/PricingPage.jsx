import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Icon from '../components/icons'
import Busy from '../components/Busy'
import { sendLicenceRequest } from '../services/licence'
import './PricingPage.css'

const WORK_PRICE = '$35'

const CONTENT = {
    en: {
        back: 'Back',
        title: 'Pricing',
        personal: { name: 'Personal', price: 'Free', per: 'forever', note: 'For reading on your own, at home or while you learn.', cta: 'Start reading' },
        work: { name: 'Work', price: WORK_PRICE, per: 'per person, per year', note: 'For using Paperear in a company, a practice, a school or any paid work.', cta: 'Get a work licence' },
        workFoot: 'No card to start. Tell us who you are, we send an invoice, and you are licensed.',
        form: {
            title: 'Ask for a work licence',
            name: 'Your name',
            company: 'Company or practice',
            email: 'Work email',
            people: 'How many people will read with it',
            note: 'Anything we should know (optional)',
            send: 'Send',
            sending: 'Sending…',
            done: 'Thank you. You will hear from us within two working days, with an invoice for the number of people you named.',
            privacy: 'We keep what you type here only to answer you and issue the licence.',
            errors: {
                name: 'Please give your name.',
                company: 'Please name the company or practice.',
                email: 'That email address does not look right.',
                people: 'Please give a whole number of people, at least one.',
                note: 'The note is too long.',
                spam: 'Please try again.',
                offline: 'The form is not connected right now. Please write to hello@paperear.app instead.',
                server: 'Something went wrong on our side. Please try again in a moment, or write to hello@paperear.app.',
            },
        },
        rows: [
            ['Every page read aloud, with the highlight on the page', true, true],
            ['Every free voice', true, true],
            ['Scans and photos of pages', true, true],
            ['Keyboard control while it reads', true, true],
            ['Your own voice provider key', true, true],
            ['Your documents stay on your device', true, true],
            ['Use at work or for a business', false, true],
            ['Clean reading: page numbers, running headers and footers skipped on their own', false, true],
            ['Pronunciation tuned to your organisation: its names, terms and how they sound', false, true],
            ['Custom software for your team, built around your documents, tools and workflow', false, true],
            ['Invoice and licence certificate', false, true],
            ['Your emails answered first', false, true],
        ],
        yes: 'Included',
        no: 'Not included',
    },
    ar: {
        back: 'رجوع',
        title: 'الأسعار',
        personal: { name: 'شخصي', price: 'مجاني', per: 'دائمًا', note: 'للقراءة لنفسك، في البيت أو أثناء التعلم.', cta: 'ابدأ القراءة' },
        work: { name: 'للعمل', price: WORK_PRICE, per: 'للشخص في السنة', note: 'لاستخدام Paperear في شركة أو عيادة أو مكتب أو مدرسة أو أي عمل مدفوع.', cta: 'اطلب ترخيص عمل' },
        workFoot: 'لا حاجة إلى بطاقة للبدء. عرّفنا بنفسك، فنرسل إليك فاتورة، ويصبح استخدامك مرخصًا.',
        form: {
            title: 'اطلب ترخيص عمل',
            name: 'اسمك',
            company: 'الشركة أو المكتب',
            email: 'بريد العمل',
            people: 'كم شخصًا سيقرأ به',
            note: 'أي شيء ينبغي أن نعرفه (اختياري)',
            send: 'إرسال',
            sending: 'جارٍ الإرسال…',
            done: 'شكرًا لك. ستصلك رسالتنا خلال يومي عمل، ومعها فاتورة بعدد الأشخاص الذي ذكرته.',
            privacy: 'نحتفظ بما تكتبه هنا فقط للرد عليك وإصدار الترخيص.',
            errors: {
                name: 'من فضلك اكتب اسمك.',
                company: 'من فضلك اذكر اسم الشركة أو المكتب.',
                email: 'عنوان البريد لا يبدو صحيحًا.',
                people: 'من فضلك اكتب عدد الأشخاص رقمًا صحيحًا، واحدًا على الأقل.',
                note: 'الملاحظة طويلة جدًا.',
                spam: 'من فضلك حاول مرة أخرى.',
                offline: 'النموذج غير متصل الآن. راسلنا على hello@paperear.app بدلًا من ذلك.',
                server: 'حدث خطأ من جهتنا. حاول بعد قليل، أو راسلنا على hello@paperear.app.',
            },
        },
        rows: [
            ['كل صفحة تُقرأ بصوت مسموع، والتظليل على الصفحة نفسها', true, true],
            ['كل الأصوات المجانية', true, true],
            ['الصفحات الممسوحة وصور الصفحات', true, true],
            ['التحكم من لوحة المفاتيح أثناء القراءة', true, true],
            ['مفتاحك الخاص من مزود الأصوات', true, true],
            ['مستنداتك تبقى على جهازك', true, true],
            ['الاستخدام في العمل أو لنشاط تجاري', false, true],
            ['قراءة نظيفة: تُتخطّى أرقام الصفحات والترويسات والتذييلات تلقائيًا', false, true],
            ['نطق مضبوط على مؤسستك: أسماؤها ومصطلحاتها وطريقة نطقها', false, true],
            ['برمجيات مخصصة لفريقك، مبنية حول مستنداتك وأدواتك وطريقة عملك', false, true],
            ['فاتورة وشهادة ترخيص', false, true],
            ['الرد على رسائلك أولًا', false, true],
        ],
        yes: 'مشمول',
        no: 'غير مشمول',
    },
}

function PlanCard({ plan, rows, column, c, highlight, action, foot }) {
    return (
        <article className={'plan' + (highlight ? ' plan--work' : '')}>
            <header className="plan__head">
                <h2>{plan.name}</h2>
                <p className="plan__price">
                    <strong>{plan.price}</strong>
                    <span>{plan.per}</span>
                </p>
                <p className="plan__note">{plan.note}</p>
            </header>
            <ul className="plan__rows">
                {rows.map((row) => {
                    const has = row[column]
                    return (
                        <li key={row[0]} className={'plan__row' + (has ? '' : ' is-off')}>
                            <span className="plan__mark" aria-label={has ? c.yes : c.no}>{has ? <Icon name="check" size={14} /> : '–'}</span>
                            <span>{row[0]}</span>
                        </li>
                    )
                })}
            </ul>
            <div className="plan__action">{action}</div>
            {foot && <p className="plan__foot">{foot}</p>}
        </article>
    )
}

function LicenceForm({ f }) {
    const [fields, setFields] = useState({ name: '', company: '', email: '', people: '', note: '', website: '' })
    const [state, setState] = useState('idle')
    const [reason, setReason] = useState('')
    const set = (k) => (e) => setFields((v) => ({ ...v, [k]: e.target.value }))
    const submit = async (e) => {
        e.preventDefault()
        if (state === 'sending') return
        setState('sending')
        setReason('')
        let result
        try { result = await sendLicenceRequest(fields) } catch { result = { ok: false, reason: 'server' } }
        if (result.ok) { setState('done'); return }
        setState('idle')
        setReason(result.reason)
    }
    if (state === 'done') return <p className="licence-form__done" role="status">{f.done}</p>
    return (
        <form className="licence-form" onSubmit={submit} noValidate>
            <h2>{f.title}</h2>
            <label><span>{f.name}</span><input value={fields.name} onChange={set('name')} autoComplete="name" required /></label>
            <label><span>{f.company}</span><input value={fields.company} onChange={set('company')} autoComplete="organization" required /></label>
            <label><span>{f.email}</span><input type="email" value={fields.email} onChange={set('email')} autoComplete="email" required /></label>
            <label><span>{f.people}</span><input type="number" min="1" step="1" inputMode="numeric" value={fields.people} onChange={set('people')} required /></label>
            <label><span>{f.note}</span><textarea rows="3" maxLength="1000" value={fields.note} onChange={set('note')} /></label>
            <label className="licence-form__trap" aria-hidden="true"><span>Website</span><input tabIndex="-1" autoComplete="off" value={fields.website} onChange={set('website')} /></label>
            {reason && <p className="licence-form__error" role="alert">{f.errors[reason] || f.errors.server}</p>}
            <div className="licence-form__actions">
                <button type="submit" className="plan__btn plan__btn--primary" disabled={state === 'sending'} aria-busy={state === 'sending' || undefined}>{state === 'sending' ? <Busy label={f.sending} showLabel announce={false} delay={0} /> : f.send}</button>
                <span className="licence-form__privacy">{f.privacy}</span>
            </div>
        </form>
    )
}

export default function PricingPage() {
    const { i18n } = useTranslation()
    const lang = String(i18n.language || 'en').startsWith('ar') ? 'ar' : 'en'
    const c = CONTENT[lang]
    const [asking, setAsking] = useState(false)
    return (
        <main className="pricing" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
            <header className="pricing__header">
                <Link to="/app/reader" className="pricing__back">‹ {c.back}</Link>
                <h1>{c.title}</h1>
            </header>
            <div className="pricing__plans">
                <PlanCard
                    plan={c.personal}
                    rows={c.rows}
                    column={1}
                    c={c}
                    action={<Link to="/app/reader" className="plan__btn">{c.personal.cta}</Link>}
                />
                <PlanCard
                    plan={c.work}
                    rows={c.rows}
                    column={2}
                    c={c}
                    highlight
                    action={<button type="button" className="plan__btn plan__btn--primary" onClick={() => setAsking(true)} aria-expanded={asking}>{c.work.cta}</button>}
                    foot={c.workFoot}
                />
            </div>
            {asking && <LicenceForm f={c.form} />}
        </main>
    )
}
