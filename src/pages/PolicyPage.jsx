import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import RetroHint from '../components/RetroHint'
import './PolicyPage.css'

const CONTENT = {
    en: {
        title: 'Terms and privacy',
        updated: 'Last changed 30 September 2026',
        back: 'Back',
        sections: [
            {
                h: 'What this is',
                p: [
                    'Paperear reads documents aloud, word by word, with the highlight on the page itself. It reads English and Arabic best today, and it recognises other languages so their free voices can read them too. It is free for personal use, for as long as it exists.',
                    'It is made by one person in Egypt and offered as it is, without warranty of any kind.',
                    'Most of its code is public on GitHub under the GNU Affero General Public License, version 3 only. You may use it, change it and run your own copy; if you run a changed copy for other people, you must share your changes under the same licence. The reading engine, the rules that decide how each word is read, is not part of that licence. It belongs to Adham Saeed Aly, who makes Paperear, with all rights reserved. No right is granted to copy, reuse, extract, decompile or reverse engineer it. These terms are governed by the laws of the Arab Republic of Egypt.',
                ],
            },
            {
                h: 'Personal use and work use',
                p: [
                    'Reading for yourself, at home or while you learn, is free and always will be.',
                    'Using Paperear inside a company, a practice, a school or any paid work needs a work licence: one price per person, per year, shown on the Pricing page. You ask, we send an invoice, and you are licensed. Nothing in the app is locked. The licence is a promise you keep, and it is what lets the app stay free for everyone else.',
                ],
            },
            {
                h: 'What it can and cannot do yet',
                p: [
                    'Paperear is young, and real documents are messier than they look. Before you rely on it, read the short list of what it still gets wrong and how it improves.',
                ],
                hint: {
                    label: 'What it still gets wrong, and how it improves',
                    title: 'read-me-first.txt',
                    bullets: [
                        'Covers, title pages and pages of art can leave stray marks that the voice reads.',
                        'On some pages, and in some languages more than others, the highlight can sit a word or a line away from what is being read.',
                        'Scanned pages are recognised on your device. That takes time, and some words come out wrong, more often in some languages than others.',
                        'Free voices vary in quality, and some languages have no free voice yet, so the device’s own voice reads instead.',
                        'Every word you report is fixed by a person for everyone, and the reading rules grow with each document. Fixes reach you on your next visit, with nothing to install.',
                    ],
                },
            },
            {
                h: 'What leaves your device',
                p: [
                    'Your browser reaches beyond your device for these, and nothing else: a free voice, fetched once from its publisher when you choose it; the text being read, sent with your key to the voice provider you chose; the text being read, if you pick one of your browser’s online voices, sent to your browser’s maker to speak it; a word report or a licence request, when you send one; what you write in the feedback form, which opens on Tally, when you send it; the list of words people reported and a person corrected, fetched from our database when you read, carrying nothing from your document; the fonts on these pages, fetched from Google Fonts; and a count of visits, kept by umami.',
                ],
            },
            {
                h: 'Your documents',
                p: [
                    'Documents you open are read and stored on your own device, inside your browser. They are never uploaded. Removing a document from the Shelf removes it from your device; your browser may also clear old ones on its own when space runs out.',
                    'Scanned pages are recognised on your device too. No page image leaves it.',
                ],
            },
            {
                h: 'Voices',
                p: [
                    'Device voices belong to your operating system and run there. Some browsers also list online voices (Edge names them “Online”); those send the text being read to the browser’s maker, under its own terms.',
                    'Downloaded voices are fetched once from their publishers’ public files, and each voice shows the licence its publisher states. That one request reveals your address to that host, as any download does. After that the voice runs on your device, offline, and your words never leave it.',
                    'A key from a voice provider, if you add one, is encrypted on your device and sent only to that provider, straight from your browser. Paperear has no server that receives it. The provider’s own terms and prices apply to what you send them.',
                    'Links to voice providers on the Key page may be referral links. If you open an account through one, Paperear may receive a commission from the provider. It costs you nothing and changes nothing in what the provider charges you.',
                ],
            },
            {
                h: 'Word reports',
                p: [
                    'When you report a word, Paperear sends to our database the word, up to six words on either side of it, its position in the document, whether the document is a PDF or text, the kind of problem, the language, the voice and speed in use, the app version, and any note you typed, so that a person can improve the reading rules. Apart from the text a provider voice or an online browser voice reads, this is the only part of a document that leaves your device, and only when you choose to send it.',
                    'Reports carry no name and need no account. To have a report removed, write to hello@paperear.app.',
                ],
            },
            {
                h: 'Work licence requests',
                p: [
                    'When you ask for a work licence, we keep your name, company, work email, the number of people and your note in our database, only to answer you and issue the licence. Write to us to have them removed.',
                ],
            },
            {
                h: 'No accounts',
                p: [
                    'Paperear has no accounts and nothing to sign up for. What you read, your voices and your settings stay in your browser, on your device.',
                ],
            },
            {
                h: 'Counting visits',
                p: [
                    'Every page of Paperear uses umami to count visits, the reader included, served from paperear.app’s own address. It sets no cookies and follows no one across sites. It records the page address (never anything from your document), the site the visit came from, the browser, operating system and kind of device, the screen size, the browser language, and the country, region or city worked out from your address, which it does not keep. It also counts, anonymously, when a document is opened and when reading starts, never what the document is.',
                ],
            },
            {
                h: 'Changes and contact',
                p: [
                    'When this page changes, the date at the top changes with it. Questions, requests and removals: hello@paperear.app.',
                ],
            },
        ],
    },
    ar: {
        title: 'الشروط والخصوصية',
        updated: 'آخر تعديل ٣٠ سبتمبر ٢٠٢٦',
        back: 'رجوع',
        sections: [
            {
                h: 'ما هذا',
                p: [
                    'Paperear يقرأ المستندات بصوت مسموع، كلمة بكلمة، والتظليل على الصفحة نفسها. يقرأ العربية والإنجليزية على أفضل وجه اليوم، ويتعرّف على اللغات الأخرى لتقرأها أصواتها المجانية أيضًا. وهو مجاني للاستخدام الشخصي ما دام قائمًا.',
                    'يصنعه شخص واحد في مصر ويُقدَّم كما هو، دون أي ضمان.',
                    'معظم كوده عام على GitHub تحت رخصة GNU Affero العامة، الإصدار الثالث فقط. يمكنك استخدامه وتعديله وتشغيل نسختك الخاصة؛ وإذا شغّلت نسخة معدّلة لأشخاص آخرين فعليك مشاركة تعديلاتك تحت الرخصة نفسها. أما محرك القراءة، أي القواعد التي تحدد كيف تُقرأ كل كلمة، فليس جزءًا من تلك الرخصة. هو ملك أدهم سعيد علي، صانع Paperear، وجميع الحقوق محفوظة. ولا يُمنح أي حق في نسخه أو إعادة استخدامه أو استخراجه أو تفكيكه أو الهندسة العكسية له. وتخضع هذه الشروط لقوانين جمهورية مصر العربية.',
                ],
            },
            {
                h: 'الاستخدام الشخصي والاستخدام في العمل',
                p: [
                    'القراءة لنفسك، في البيت أو أثناء التعلم، مجانية وستبقى كذلك دائمًا.',
                    'استخدام Paperear داخل شركة أو عيادة أو مكتب أو مدرسة أو أي عمل مدفوع يحتاج إلى ترخيص عمل: سعر واحد للشخص في السنة، مذكور في صفحة الأسعار. تطلب، فنرسل إليك فاتورة، ويصبح استخدامك مرخصًا. لا شيء في التطبيق مقفل؛ الترخيص وعد تفي به، وهو ما يُبقي التطبيق مجانيًا للجميع.',
                ],
            },
            {
                h: 'ما يستطيعه وما لا يستطيعه بعد',
                p: [
                    'Paperear ما زال في بدايته، والمستندات الحقيقية أكثر فوضى مما تبدو. قبل أن تعتمد عليه، اقرأ القائمة القصيرة لما يخطئ فيه وكيف يتحسّن.',
                ],
                hint: {
                    label: 'ما يخطئ فيه بعد، وكيف يتحسّن',
                    title: 'اقرأني-أولًا.txt',
                    bullets: [
                        'الأغلفة وصفحات العناوين وصفحات الرسوم قد تترك علامات شاردة يقرؤها الصوت.',
                        'في بعض الصفحات، وفي بعض اللغات أكثر من غيرها، قد يقع التظليل على بُعد كلمة أو سطر عمّا يُقرأ.',
                        'الصفحات الممسوحة ضوئيًا تُميَّز على جهازك. يستغرق ذلك وقتًا، وتخرج بعض الكلمات خاطئة، وفي بعض اللغات أكثر من غيرها.',
                        'الأصوات المجانية تتفاوت في الجودة، وبعض اللغات لا صوت مجاني لها بعد، فيقرأ صوت الجهاز بدلًا منه.',
                        'كل كلمة تبلّغ عنها يصلحها شخص للجميع، وقواعد القراءة تنمو مع كل مستند. تصلك الإصلاحات في زيارتك التالية دون أن تثبّت شيئًا.',
                    ],
                },
            },
            {
                h: 'ما يغادر جهازك',
                p: [
                    'لا يتواصل متصفحك مع أي جهة خارج جهازك إلا في هذه الحالات وحدها: صوت مجاني يُجلب مرة واحدة من ناشره حين تختاره؛ والنص الذي تجري قراءته، يُرسل مع مفتاحك إلى مزوّد الأصوات الذي اخترته؛ والنص الذي تجري قراءته، إن اخترت أحد الأصوات عبر الإنترنت في متصفحك، يُرسل إلى الشركة المطوّرة للمتصفح لتنطقه؛ وبلاغ عن كلمة أو طلب ترخيص، حين ترسله أنت؛ وما تكتبه في نموذج الرأي، وهو نموذج تديره Tally، حين ترسله؛ وقائمة الكلمات التي أبلغ عنها الناس وصحّحها إنسان، تُجلب من قاعدة بياناتنا حين تقرأ، ولا تحمل شيئًا من مستندك؛ والخطوط المستخدمة في هذه الصفحات، تُجلب من Google Fonts؛ وعدّ الزيارات عبر umami.',
                ],
            },
            {
                h: 'مستنداتك',
                p: [
                    'المستندات التي تفتحها تُقرأ وتُحفظ على جهازك، داخل متصفحك. لا تُرفع أبدًا. إزالة مستند من الرف تزيله من جهازك؛ وقد يمسح المتصفح القديم منها من تلقاء نفسه حين تضيق المساحة.',
                    'الصفحات الممسوحة ضوئيًا تُميَّز على جهازك أيضًا. لا تغادر أي صورة صفحة جهازك.',
                ],
            },
            {
                h: 'الأصوات',
                p: [
                    'أصوات الجهاز تخص نظام التشغيل وتعمل فيه. وبعض المتصفحات تعرض أيضًا أصواتًا عبر الإنترنت (يسميها Edge ‏«Online»)، وهذه ترسل النص الذي تجري قراءته إلى الشركة المطوّرة للمتصفح، وفق شروطها.',
                    'الأصوات المنزَّلة تُجلب مرة واحدة من الملفات العامة لناشريها، ويعرض كل صوت الرخصة التي يذكرها ناشره. هذا الطلب الواحد يكشف عنوانك لذلك المضيف كأي تنزيل. بعدها يعمل الصوت على جهازك، دون إنترنت، ولا تغادر كلماتك جهازك أبدًا.',
                    'مفتاح مزود الأصوات، إن أضفته، يُشفَّر على جهازك ويُرسل إلى ذلك المزود فقط، من متصفحك مباشرة. ليس لدى Paperear خادم يستقبله. شروط المزود وأسعاره تنطبق على ما ترسله إليه.',
                    'قد تكون روابط مزودي الأصوات في صفحة المفتاح روابط إحالة. إذا فتحت حسابًا عبر أحدها فقد يحصل Paperear على عمولة من المزود. لا يكلفك ذلك شيئًا ولا يغيّر شيئًا مما يتقاضاه المزود منك.',
                ],
            },
            {
                h: 'الإبلاغ عن الكلمات',
                p: [
                    'حين تبلّغ عن كلمة، يرسل Paperear إلى قاعدة بياناتنا الكلمة، وما يصل إلى ست كلمات على كل جانب منها، وموضعها في المستند، وهل المستند ملف PDF أم نص، ونوع المشكلة، واللغة، والصوت والسرعة المستخدمين، وإصدار التطبيق، وأي ملاحظة كتبتها، ليتمكن شخص من تحسين قواعد القراءة. وباستثناء النص الذي يقرؤه صوت مزوّد أو صوت متصفح عبر الإنترنت، هذا هو الجزء الوحيد من المستند الذي يغادر جهازك، وفقط حين تختار إرساله.',
                    'البلاغات لا تحمل اسمًا ولا تحتاج حسابًا. لإزالة بلاغ، راسلنا على hello@paperear.app.',
                ],
            },
            {
                h: 'طلبات ترخيص العمل',
                p: [
                    'حين تطلب ترخيص عمل، نحتفظ باسمك واسم الشركة وبريد العمل وعدد الأشخاص وملاحظتك في قاعدة بياناتنا، فقط للرد عليك وإصدار الترخيص. راسلنا لإزالتها.',
                ],
            },
            {
                h: 'لا حسابات',
                p: [
                    'ليس في Paperear حسابات ولا شيء للتسجيل فيه. ما تقرؤه وأصواتك وإعداداتك تبقى في متصفحك، على جهازك.',
                ],
            },
            {
                h: 'عدّ الزيارات',
                p: [
                    'كل صفحات Paperear تستخدم umami لعدّ الزيارات، بما فيها صفحة القراءة، ويُقدَّم من عنوان paperear.app نفسه. لا يضع ملفات تعريف ارتباط ولا يتتبع أحدًا عبر المواقع. يسجّل عنوان الصفحة (ولا شيء من مستندك)، والموقع الذي جاءت منه الزيارة، والمتصفح ونظام التشغيل ونوع الجهاز، وحجم الشاشة، ولغة المتصفح، والبلد أو المنطقة أو المدينة المستنتجة من عنوانك، دون أن يحتفظ بالعنوان. ويعدّ كذلك، دون الكشف عن هويتك، متى يُفتح مستند ومتى تبدأ القراءة، ولا يعرف أبدًا ما هو المستند.',
                ],
            },
            {
                h: 'التغييرات والتواصل',
                p: [
                    'حين تتغير هذه الصفحة يتغير التاريخ في أعلاها معها. للأسئلة والطلبات والإزالة: hello@paperear.app.',
                ],
            },
        ],
    },
}

export default function PolicyPage() {
    const { i18n } = useTranslation()
    const lang = i18n.language === 'ar' ? 'ar' : 'en'
    const content = CONTENT[lang]
    return (
        <div className="policy" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
            <header className="policy__header">
                <Link to="/" className="policy__back">{lang === 'ar' ? '›' : '‹'} {content.back}</Link>
                <h1>{content.title}</h1>
                <p className="policy__updated">{content.updated}</p>
            </header>
            {content.sections.map((s) => (
                <section key={s.h} className="policy__section">
                    <h2>{s.h}</h2>
                    {s.p.map((text, i) => <p key={i}>{text}</p>)}
                    {s.hint && (
                        <p className="policy__hint">
                            <RetroHint label={s.hint.label} title={s.hint.title}>
                                <ul>{s.hint.bullets.map((b) => <li key={b}>{b}</li>)}</ul>
                            </RetroHint>
                        </p>
                    )}
                </section>
            ))}
            <footer className="policy__footer">
                <a href="https://github.com/theadhamaly/paperear" target="_blank" rel="noopener noreferrer">github.com/theadhamaly/paperear</a>
                <a href="/third-party-notices.txt" target="_blank" rel="noopener">{lang === 'ar' ? 'تراخيص الأطراف الأخرى' : 'Third-party licences'}</a>
            </footer>
        </div>
    )
}
