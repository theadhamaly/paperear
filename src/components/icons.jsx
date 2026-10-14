const base = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }

const PATHS = {
    write: <path d="M4 20h4l10-10-4-4L4 16v4zM13 7l4 4" />,
    open: <path d="M12 16V4m0 0l-4 4m4-4l4 4M4 14v5a1 1 0 001 1h14a1 1 0 001-1v-5" />,
    shelf: <path d="M4 4h4v16H4zM10 4h4v16h-4zM16.5 5.2l3.8-1 4 15-3.8 1z" />,
    tune: <path d="M6 4v6m0 4v6M12 4v2m0 4v10M18 4v9m0 4v3M4 12h4M10 8h4M16 15h4" />,
    key: <><circle cx="7.5" cy="15.5" r="4.5" /><path d="M10.7 12.3L20 3M16 7l3 3M13.5 9.5l2 2" /></>,
    moon: <path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z" />,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4l1.4 1.4M4.9 19.1l1.4-1.4m11.4-11.4l1.4-1.4" /></>,
    dusk: <path d="M3 17h18M6 17a6 6 0 0112 0M12 3v3M5 8l2 2M19 8l-2 2" />,
    reader: <path d="M4 5.5A2.5 2.5 0 016.5 3H12v18H6.5A2.5 2.5 0 014 18.5v-13zM20 5.5A2.5 2.5 0 0017.5 3H12v18h5.5a2.5 2.5 0 002.5-2.5v-13z" />,
    menu: <path d="M4 6h16M4 12h16M4 18h16" />,
    voice: <path d="M3 12h2M7 8v8M11 5v14M15 8v8M19 11v2" />,
    rules: <path d="M4 6h10M4 12h10M4 18h10M17 6l1.5 1.5L21 5M17 12l1.5 1.5L21 11M17 18l1.5 1.5L21 17" />,
    code: <path d="M8 7l-5 5 5 5M16 7l5 5-5 5M13 4l-2 16" />,
    settings: <path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h9M17 17h3M13 5v4M7 10v4M13 15v4" />,
    check: <path d="M5 12l4 4L19 7" />,
    chevron: <path d="M6 15l6-6 6 6" />,
    chat: <path d="M4 5h16v11H8l-4 4V5z" />,
    pointer: <path d="M6 3l12 6.5-5.5 1.6L10 17z" />,
    globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.7 3.5 5.7 3.5 9s-1 6.3-3.5 9c-2.5-2.7-3.5-5.7-3.5-9s1-6.3 3.5-9z" /></>,
    keyboard: <><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10" /></>,
    follow: <><path d="M6 3h9l3 3v15H6z" /><path d="M12 9v7m0 0l-3-3m3 3l3-3" /></>,
    back: <path d="M9 14L4 9l5-5M4 9h11a5 5 0 010 10h-3" />,
    speed: <><path d="M4 17a8 8 0 1116 0" /><path d="M12 17l4-5" /></>,
    voices: <path d="M3 5h11v7H7l-4 3V5zM10 15v2h7l4 3v-9h-4" />,
    flag: <path d="M5 21V4M5 4h11l-2 4 2 4H5" />,
    resume: <path d="M7 3h10v18l-5-4-5 4z" />,
    person: <><circle cx="12" cy="8" r="4" /><path d="M4.5 21a7.5 7.5 0 0115 0" /></>,
    cog: <><path d="M10.14 5.05L10.66 2.49L13.34 2.49L13.86 5.05L15.60 5.76L17.78 4.33L19.67 6.22L18.24 8.40L18.95 10.14L21.51 10.66L21.51 13.34L18.95 13.86L18.24 15.60L19.67 17.78L17.78 19.67L15.60 18.24L13.86 18.95L13.34 21.51L10.66 21.51L10.14 18.95L8.40 18.24L6.22 19.67L4.33 17.78L5.76 15.60L5.05 13.86L2.49 13.34L2.49 10.66L5.05 10.14L5.76 8.40L4.33 6.22L6.22 4.33L8.40 5.76z" /><circle cx="12" cy="12" r="3" /></>,
    volume: <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4zM15.5 9a4 4 0 010 6M18 6.5a8 8 0 010 11" />,
    volumeMute: <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4zM16 9.5l5 5M21 9.5l-5 5" />,
    zoom: <><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.4-4.4" /></>,
    zoomIn: <><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.4-4.4M11 8.2v5.6M8.2 11h5.6" /></>,
    zoomOut: <><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.4-4.4M8.2 11h5.6" /></>,
    tag: <><path d="M3 12.5V4a1 1 0 011-1h8.5L21 11.5 12.5 20z" /><circle cx="8" cy="8" r="1.5" /></>,
}

export default function Icon({ name, size = 18, className = '' }) {
    const body = PATHS[name]
    if (!body) return null
    return (
        <svg {...base} width={size} height={size} className={className}>
            {body}
        </svg>
    )
}
