const P: Record<string, string> = {
  play: 'M8 5.5v13l11-6.5z',
  pause: 'M7 5h3.5v14H7zM13.5 5H17v14h-3.5z',
  back5: 'M11 7 6 12l5 5M18 7l-5 5 5 5',
  fwd5: 'm13 7 5 5-5 5M6 7l5 5-5 5',
  loop: 'M4 12V9a3 3 0 0 1 3-3h11m-3-3 3 3-3 3M20 12v3a3 3 0 0 1-3 3H6m3 3-3-3 3-3',
  metronome: 'M9 3h6l3.5 18h-13zM12 15l5-9M7.5 15h9',
  mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3',
  upload: 'M12 16V4m-5 5 5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  tab: 'M3 5h18v12H3zM8 21h8M12 17v4',
  arrowLeft: 'M19 12H5m6-6-6 6 6 6',
  arrowRight: 'M5 12h14m-6-6 6 6-6 6',
  arrowUpRight: 'M7 17 17 7M8 7h9v9',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  guitar: 'm20 4-6 6M17 3l4 4M14 10a3.5 3.5 0 0 0-5-.5c-1 1-1 2-2 2.5S4 12 3.5 14.5 6 20.5 9.5 20.5s2.5-2 3-3 1.5-1 2.5-2a3.5 3.5 0 0 0-1-5.5zM9 15l.01 0',
  piano: 'M3 4h18v16H3zM8 4v10M12 4v10M16 4v10M8 14v6M12 14v6M16 14v6',
  uke: 'M15 3l6 6M12 9a3 3 0 0 0-4.2 0L5 11.8a4 4 0 0 0 5.7 5.7l2.8-2.8a3 3 0 0 0 0-4.2zM18 6l-6 6',
  spark: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6',
  send: 'M5 12h14m-6-6 6 6-6 6',
  download: 'M12 4v12m-5-5 5 5 5-5M4 20h16',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  edit: 'M4 20h4l11-11-4-4L4 16zM14 6l4 4',
  wave: 'M3 12h2M7 8v8M11 5v14M15 9v6M19 11v2',
  drum: 'M4 9c0-2 3.6-3.5 8-3.5S20 7 20 9v6c0 2-3.6 3.5-8 3.5S4 17 4 15zM4 9c0 2 3.6 3.5 8 3.5S20 11 20 9M8 3l3 5M16 3l-3 5',
  lyrics: 'M4 6h16M4 12h10M4 18h13',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  vocal: 'M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM4 4l16 16',
  volume: 'M4 9h4l5-4v14l-5-4H4zM17 9a4 4 0 0 1 0 6',
  close: 'M6 6l12 12M18 6 6 18',
  check: 'm5 12 5 5 9-10',
  info: 'M12 8h.01M11 12h1v5h1M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
  tuner: 'M4 18a8 8 0 1 1 16 0M12 18l4-6M12 6v2M6.3 9.3l1.4 1.4M17.7 9.3l-1.4 1.4',
  library: 'M4 4h4v16H4zM10 4h4v16h-4zM16 5l3.8 1-3.8 14-3.8-1z',
};

export function Icon({ name, size = 18, fill = false }: { name: keyof typeof P | string; size?: number; fill?: boolean }) {
  const d = P[name] ?? '';
  const filled = fill || name === 'play' || name === 'pause';
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill={filled ? 'currentColor' : 'none'} stroke={filled ? 'none' : 'currentColor'} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

export function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#E3F27A" strokeWidth="2.6" strokeLinecap="round">
        <path d="M5 10v4M9.5 6v12M14 9v6M18.5 11v2" />
      </svg>
    </span>
  );
}
