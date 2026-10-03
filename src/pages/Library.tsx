import { Icon } from '../components/Icon';
import { chordLabel, fmtTime, keyLabel, prefersFlats } from '../lib/music/theory';
import { useLibrary } from '../lib/store/library';
import type { Song } from '../lib/types';

export function SongCard({ song }: { song: Song }) {
  const a = song.analysis;
  const flats = prefersFlats(a.key);
  const seq: string[] = [];
  for (const c of a.chords) {
    if (c.root < 0) continue;
    const l = chordLabel(c, 0, flats);
    if (!seq.includes(l)) seq.push(l);
    if (seq.length >= 6) break;
  }
  return (
    <a className="card song-card" href={`#/song/${song.id}`}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{song.title}</div>
          <div className="card-sub">{song.source.platform ?? (song.source.type === 'file' ? 'Upload' : song.source.type === 'mic' ? 'Recording' : 'Tab capture')} · {new Date(song.createdAt).toLocaleDateString()}</div>
        </div>
        <span className="icon-btn sm" aria-hidden="true"><Icon name="arrowUpRight" size={15} /></span>
      </div>
      <div className="row" style={{ gap: 18 }}>
        <div><div className="stat-label">Key</div><div style={{ fontSize: 20 }}>{keyLabel(a.key)}</div></div>
        <div><div className="stat-label">Tempo</div><div style={{ fontSize: 20 }}>{Math.round(a.bpm)}</div></div>
        <div><div className="stat-label">Length</div><div style={{ fontSize: 20 }}>{fmtTime(song.duration)}</div></div>
      </div>
      <div className="mini-chords">{seq.map((c) => <span key={c}>{c}</span>)}</div>
      <div className="row" style={{ gap: 6 }}>
        {song.stems && <span className="chip lime">Stems</span>}
        <span className="chip">{song.notes || song.stemNotes ? 'Tabs ready' : 'Tabs pending'}</span>
        <span className="chip">{song.lyrics ? (song.lyrics.words.length ? 'Lyrics ready' : 'Instrumental') : 'Lyrics pending'}</span>
      </div>
    </a>
  );
}

export function Library() {
  const lib = useLibrary();
  return (
    <>
      <header className="page-head">
        <h1 className="page-title">Library</h1>
        <div className="head-actions">
          <a className="pill lime" href="#/"><Icon name="spark" /> Scan a song</a>
        </div>
      </header>
      {!lib ? (
        <div className="empty">Loading…</div>
      ) : lib.length === 0 ? (
        <div className="card empty">
          <p>No songs yet. Scan your first one — it takes about 10 seconds.</p>
          <a className="pill lime" href="#/">Scan a song</a>
        </div>
      ) : (
        <div className="lib-grid">{lib.map((s) => <SongCard key={s.id} song={s} />)}</div>
      )}
      <p className="note" style={{ marginTop: 18 }}>Songs are saved in this browser only. Clearing site data removes them.</p>
    </>
  );
}
