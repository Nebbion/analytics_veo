'use client';

import { useEffect, useMemo, useState } from 'react';

type Player = {
  playerId: string; name: string; appearances: number; minutes: number; goals: number; goalsPer90: number;
  shots: number; shotsPer90: number; passes: number; completedPasses: number; passSuccess: number;
  distanceKm: number; distancePer90: number; sprints: number; sprintsPer90: number;
  highIntensityRuns: number; highIntensityRunsPer90: number; maxSpeed: number; averageSpeed: number; minutesPerAppearance: number;
  passesPer90: number; completedPassesPer90: number;
  sprintsPerKm: number; highIntensityRunsPerKm: number;
  goalsPerShot: number; minutesPerGoal: number; minutesPerShot: number;
};
type Match = {
  matchId: string; date: string; match: string; playerId: string; playerName: string; minutes: number;
  goals: number; goalsPer90: number; shots: number; shotsPer90: number; passes: number; completedPasses: number;
  passSuccess: number; distanceKm: number; distancePer90: number; sprints: number; sprintsPer90: number;
  highIntensityRuns: number; highIntensityRunsPer90: number; maxSpeed: number; averageSpeed: number;
};
type TeamMatch = { matchId: string; date: string; match: string };
type Data = { stagione?: string; role?: 'STAFF' | 'GIOCATORE'; userName?: string; playerId?: string | null; players?: Player[]; matches?: Match[]; teamMatches?: TeamMatch[]; error?: string };

const fmt = (v: unknown, digits = 1) => Number(v ?? 0).toLocaleString('it-IT', { maximumFractionDigits: digits, minimumFractionDigits: digits });
const int = (v: unknown) => Number(v ?? 0).toLocaleString('it-IT', { maximumFractionDigits: 0 });

function Stat({ label, value, suffix = '' }: { label: string; value: string | number; suffix?: string }) {
  return <div className="stat"><span>{label}</span><strong>{value}{suffix}</strong></div>;
}

function LineChart({ title, values, unit, color = 'green' }: { title: string; values: { label: string; value: number }[]; unit: string; color?: 'green' | 'neutral' }) {
  const width = 760, height = 190, padX = 34, padY = 26;
  if (!values.length) return <div className="chartEmpty">Nessun dato disponibile.</div>;
  const max = Math.max(...values.map(v => v.value), 1);
  const min = Math.min(...values.map(v => v.value), 0);
  const range = Math.max(max - min, 1);
  const points = values.map((v, i) => {
    const x = values.length === 1 ? width / 2 : padX + (i * (width - padX * 2)) / (values.length - 1);
    const y = height - padY - ((v.value - min) / range) * (height - padY * 2);
    return { ...v, x, y };
  });
  const path = points.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ');
  return <div className="chartBlock"><div className="chartHead"><span>{title}</span><small>{unit}</small></div><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title} className="lineChart">
    <line x1={padX} y1={height-padY} x2={width-padX} y2={height-padY} className="chartAxis" />
    <path d={path} className={`chartLine ${color}`} />
    {points.map((p, i) => <g key={`${p.label}-${i}`}><circle cx={p.x} cy={p.y} r="4" className={`chartDot ${color}`} /><text x={p.x} y={height-7} textAnchor="middle" className="chartLabel">{p.label}</text><title>{p.label}: {fmt(p.value)} {unit}</title></g>)}
  </svg></div>;
}

function RankTable({ title, rows, metricLabel }: { title: string; rows: { name: string; value: number }[]; metricLabel: string }) {
  return <section className="panel tablePanel"><div className="sectionTitle"><div><span className="eyebrow">RANKING</span><h2>{title}</h2></div><span>{metricLabel}</span></div><div className="rankingList">
    {rows.slice(0, 8).map((r, i) => <div className="rankRow" key={r.name}><span className="rankNo">{i + 1}</span><strong>{r.name}</strong><span>{fmt(r.value, 2)}</span></div>)}
  </div></section>;
}

export default function Home() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState('');
  const [view, setView] = useState<'player' | 'team' | 'compare'>('player');
  const [compareA, setCompareA] = useState('');
  const [compareB, setCompareB] = useState('');

  useEffect(() => {
    fetch('/api/dashboard', { cache: 'no-store' })
      .then(async r => { const json = await r.json(); if (!r.ok) throw new Error(json.error || 'Errore API'); return json as Data; })
      .then(json => {
        setData(json);
        const first = json.players?.[0];
        const second = json.players?.[1];
        if (first) setSelected(first.name);
        if (first) setCompareA(first.name);
        if (second) setCompareB(second.name);
      })
      .catch(e => setError(e.message));
  }, []);

  const players = data?.players ?? [];
  const matches = data?.matches ?? [];
  const teamMatches = data?.teamMatches ?? [];
  const player = useMemo(() => players.find(p => p.name === selected), [players, selected]);
  const playerMatches = useMemo(() => matches.filter(m => m.playerName === selected).sort((a,b) => a.date.localeCompare(b.date)), [matches, selected]);
  const generalPlayerMatches = useMemo(() => teamMatches.map(g => ({
    ...g,
    stats: matches.find(m => m.matchId === g.matchId) ?? null,
  })), [teamMatches, matches]);

  const team = useMemo(() => {
    const totalMinutes = players.reduce((s, p) => s + p.minutes, 0);
    return {
      players: players.length,
      goals: players.reduce((s, p) => s + p.goals, 0),
      shots: players.reduce((s, p) => s + p.shots, 0),
      passes: players.reduce((s, p) => s + p.passes, 0),
      completedPasses: players.reduce((s, p) => s + p.completedPasses, 0),
      distance: players.reduce((s, p) => s + p.distanceKm, 0),
      sprints: players.reduce((s, p) => s + p.sprints, 0),
      highIntensity: players.reduce((s, p) => s + p.highIntensityRuns, 0),
      maxSpeed: Math.max(...players.map(p => p.maxSpeed), 0),
      passSuccess: players.reduce((s, p) => s + p.passes, 0) > 0 ? players.reduce((s, p) => s + p.completedPasses, 0) / players.reduce((s, p) => s + p.passes, 0) * 100 : 0,
      totalMinutes,
    };
  }, [players]);

  const matchSummary = useMemo(() => {
    const map = new Map<string, { date: string; match: string; goals: number; shots: number; distance: number; minutes: number; passes: number }>();
    matches.forEach(m => {
      const current = map.get(m.matchId) ?? { date: m.date, match: m.match, goals: 0, shots: 0, distance: 0, minutes: 0, passes: 0 };
      current.goals += m.goals;
      current.shots += m.shots;
      current.distance += m.distanceKm;
      current.minutes += m.minutes;
      current.passes += m.passes;
      map.set(m.matchId, current);
    });
    return [...map.values()].sort((a,b) => a.date.localeCompare(b.date));
  }, [matches]);

  const rankings = useMemo(() => ({
    goals: [...players].sort((a,b) => b.goals - a.goals).map(p => ({name:p.name,value:p.goals})),
    goals90: [...players].sort((a,b) => b.goalsPer90 - a.goalsPer90).map(p => ({name:p.name,value:p.goalsPer90})),
    speed: [...players].sort((a,b) => b.maxSpeed - a.maxSpeed).map(p => ({name:p.name,value:p.maxSpeed})),
    distance90: [...players].sort((a,b) => b.distancePer90 - a.distancePer90).map(p => ({name:p.name,value:p.distancePer90})),
  }), [players]);

  const a = players.find(p => p.name === compareA);
  const b = players.find(p => p.name === compareB);

  if (error) return <main className="page"><div className="panel error"><h1>Villanovese Analytics</h1><p>{error}</p><p>Controlla la configurazione Supabase e i permessi RLS.</p></div></main>;
  if (!data) return <main className="page"><div className="loading">Caricamento dati Villanovese…</div></main>;

  const dateLabel = (date: string) => date ? new Date(`${date}T12:00:00`).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' }) : '—';

  return <main className="page">
    <header className="topbar">
      <div className="brand"><img src="/logo_verde.jpeg" alt="ASD Villanovese" className="brandLogo" /><div><b>VILLANOVESE</b><span>ANALYTICS · {data.stagione ?? '2026/2027'}</span></div></div>
      <div className="topActions"><div className="badge">{data.role ?? 'STAFF'}</div><button className="logoutButton" onClick={async () => { await fetch('/api/auth/signout', { method: 'POST' }); window.location.href = '/login'; }}>Esci</button></div>
    </header>

    <nav className="tabs" aria-label="Sezioni dashboard">
      <button className={view === 'player' ? 'active' : ''} onClick={() => setView('player')}>Giocatore</button>
      {data.role === 'STAFF' && <><button className={view === 'team' ? 'active' : ''} onClick={() => setView('team')}>Squadra</button><button className={view === 'compare' ? 'active' : ''} onClick={() => setView('compare')}>Confronto</button></>}
    </nav>

    {view === 'player' && <>
      <section className="hero"><div><p className="eyebrow">PLAYER CENTER</p><h1>{data.role === 'GIOCATORE' ? 'Profilo personale' : 'Dashboard giocatore'}</h1><p>{data.role === 'GIOCATORE' ? 'Le tue statistiche stagionali e tutte le partite della squadra.' : 'Statistiche stagionali e rendimento partita per partita.'}</p></div>{data.role === 'STAFF' && <label className="selector">Giocatore<select value={selected} onChange={e => setSelected(e.target.value)}>{players.map(p => <option key={p.playerId} value={p.name}>{p.name}</option>)}</select></label>}</section>
      {player && <>
        <section className="profile panel"><div><span className="eyebrow">PROFILO</span><h2>{player.name}</h2><p>{player.appearances} presenze · {int(player.minutes)} minuti</p></div><div className="profileHighlight"><span>GOL / 90</span><strong>{fmt(player.goalsPer90, 2)}</strong></div></section>
        <section className="statsGrid">
          <Stat label="Presenze" value={int(player.appearances)} /><Stat label="Minuti" value={int(player.minutes)} /><Stat label="Gol" value={int(player.goals)} /><Stat label="Gol / 90" value={fmt(player.goalsPer90, 2)} />
          <Stat label="Tiri" value={int(player.shots)} /><Stat label="Tiri / 90" value={fmt(player.shotsPer90, 2)} /><Stat label="Passaggi" value={int(player.passes)} /><Stat label="Passaggi completati" value={int(player.completedPasses)} />
          <Stat label="Passaggi %" value={fmt(player.passSuccess, 1)} suffix="%" /><Stat label="Distanza" value={fmt(player.distanceKm, 1)} suffix=" km" /><Stat label="Sprint" value={int(player.sprints)} /><Stat label="Alta intensità" value={int(player.highIntensityRuns)} />
          <Stat label="Velocità max" value={fmt(player.maxSpeed, 1)} suffix=" km/h" /><Stat label="Velocità media" value={fmt(player.averageSpeed, 1)} suffix=" km/h" /><Stat label="Distanza / 90" value={fmt(player.distancePer90, 1)} suffix=" km" /><Stat label="Minuti / presenza" value={fmt(player.minutesPerAppearance, 1)} />
        </section>
        <section className="panel tablePanel advancedStats">
          <div className="sectionTitle"><div><span className="eyebrow">ANALISI STAGIONALE</span><h2>Indicatori avanzati</h2></div><span>stagione</span></div>
          <div className="statsGrid advancedGrid">
            <Stat label="Passaggi / 90" value={fmt(player.passesPer90, 2)} />
            <Stat label="Passaggi completati / 90" value={fmt(player.completedPassesPer90, 2)} />
            <Stat label="Sprint / 90" value={fmt(player.sprintsPer90, 2)} />
            <Stat label="Alta intensità / 90" value={fmt(player.highIntensityRunsPer90, 2)} />
            <Stat label="Sprint / km" value={fmt(player.sprintsPerKm, 2)} />
            <Stat label="Alta intensità / km" value={fmt(player.highIntensityRunsPerKm, 2)} />
            <Stat label="Gol / tiro" value={fmt(player.goalsPerShot, 2)} />
            <Stat label="Minuti / gol" value={player.goals > 0 ? fmt(player.minutesPerGoal, 1) : '—'} />
            <Stat label="Minuti / tiro" value={fmt(player.minutesPerShot, 1)} />
          </div>
        </section>
        {data.role === 'GIOCATORE' ? <section className="panel tablePanel"><div className="sectionTitle"><div><span className="eyebrow">PARTITE</span><h2>Partite generali</h2></div><span>{generalPlayerMatches.length} gare</span></div><div className="tableWrap"><table><thead><tr><th>Data</th><th>Partita</th><th>Presenza</th><th>Min</th><th>Gol</th><th>Tiri</th><th>Passaggi %</th><th>Distanza</th></tr></thead><tbody>{generalPlayerMatches.map((m, i) => { const s = m.stats; return <tr key={`${m.matchId}-${i}`}><td>{dateLabel(m.date)}</td><td>{m.match}</td><td>{s ? 'Sì' : 'Non impiegato'}</td><td>{s ? int(s.minutes) : '—'}</td><td>{s ? int(s.goals) : '—'}</td><td>{s ? int(s.shots) : '—'}</td><td>{s ? `${fmt(s.passSuccess, 1)}%` : '—'}</td><td>{s ? `${fmt(s.distanceKm, 1)} km` : '—'}</td></tr>; })}</tbody></table></div></section> : <section className="panel tablePanel"><div className="sectionTitle"><div><span className="eyebrow">MATCH LOG</span><h2>Partite</h2></div><span>{playerMatches.length} gare</span></div><div className="tableWrap"><table><thead><tr><th>Data</th><th>Partita</th><th>Min</th><th>Gol</th><th>Tiri</th><th>Passaggi %</th><th>Distanza</th><th>V. max</th></tr></thead><tbody>{playerMatches.map((m, i) => <tr key={`${m.matchId}-${i}`}><td>{dateLabel(m.date)}</td><td>{m.match}</td><td>{int(m.minutes)}</td><td>{int(m.goals)}</td><td>{int(m.shots)}</td><td>{fmt(m.passSuccess, 1)}%</td><td>{fmt(m.distanceKm, 1)} km</td><td>{fmt(m.maxSpeed, 1)} km/h</td></tr>)}</tbody></table></div></section>}
        <section className="chartsGrid"><LineChart title="Minuti per partita" unit="min" values={playerMatches.map(m => ({ label: dateLabel(m.date), value: m.minutes }))} /><LineChart title="Distanza per partita" unit="km" values={playerMatches.map(m => ({ label: dateLabel(m.date), value: m.distanceKm }))} /><LineChart title="Velocità massima" unit="km/h" color="neutral" values={playerMatches.map(m => ({ label: dateLabel(m.date), value: m.maxSpeed }))} /></section>
      </>}
    </>}

    {view === 'team' && <>
      <section className="hero"><div><p className="eyebrow">TEAM CENTER</p><h1>Dashboard squadra</h1><p>Panoramica aggregata delle statistiche della rosa.</p></div><div className="heroMeta"><span>Giocatori con dati</span><strong>{team.players}</strong></div></section>
      <section className="statsGrid">
        <Stat label="Gol" value={int(team.goals)} /><Stat label="Tiri" value={int(team.shots)} /><Stat label="Passaggi" value={int(team.passes)} /><Stat label="Passaggi %" value={fmt(team.passSuccess,1)} suffix="%" />
        <Stat label="Distanza" value={fmt(team.distance,1)} suffix=" km" /><Stat label="Sprint" value={int(team.sprints)} /><Stat label="Alta intensità" value={int(team.highIntensity)} /><Stat label="Velocità max" value={fmt(team.maxSpeed,1)} suffix=" km/h" />
      </section>
      <section className="chartsGrid teamCharts"><LineChart title="Distanza squadra per partita" unit="km" values={matchSummary.map(m => ({label: dateLabel(m.date), value:m.distance}))} /><LineChart title="Gol squadra per partita" unit="gol" values={matchSummary.map(m => ({label: dateLabel(m.date), value:m.goals}))} /><LineChart title="Tiri squadra per partita" unit="tiri" color="neutral" values={matchSummary.map(m => ({label: dateLabel(m.date), value:m.shots}))} /></section>
      <div className="twoCol"><RankTable title="Gol" metricLabel="totale" rows={rankings.goals} /><RankTable title="Gol / 90" metricLabel="indicatore" rows={rankings.goals90} /></div>
      <div className="twoCol"><RankTable title="Velocità massima" metricLabel="km/h" rows={rankings.speed} /><RankTable title="Distanza / 90" metricLabel="km" rows={rankings.distance90} /></div>
    </>}

    {view === 'compare' && <>
      <section className="hero"><div><p className="eyebrow">PLAYER COMPARE</p><h1>Confronto giocatori</h1><p>Confronto diretto sugli stessi indicatori stagionali.</p></div></section>
      <section className="compareSelectors panel"><label className="selector">Giocatore A<select value={compareA} onChange={e => setCompareA(e.target.value)}>{players.map(p => <option key={p.playerId} value={p.name}>{p.name}</option>)}</select></label><span className="versus">VS</span><label className="selector">Giocatore B<select value={compareB} onChange={e => setCompareB(e.target.value)}>{players.map(p => <option key={p.playerId} value={p.name}>{p.name}</option>)}</select></label></section>
      {a && b && <section className="compareGrid">
        {[['Presenze',a.appearances,b.appearances],['Minuti',a.minutes,b.minutes],['Gol',a.goals,b.goals],['Gol / 90',a.goalsPer90,b.goalsPer90],['Tiri / 90',a.shotsPer90,b.shotsPer90],['Passaggi %',a.passSuccess,b.passSuccess],['Distanza / 90',a.distancePer90,b.distancePer90],['Sprint / 90',a.sprintsPer90,b.sprintsPer90],['Alta intensità / 90',a.highIntensityRunsPer90,b.highIntensityRunsPer90],['Velocità max',a.maxSpeed,b.maxSpeed],['Velocità media',a.averageSpeed,b.averageSpeed]].map(([label, av, bv]) => <div className="compareRow" key={String(label)}><span>{label}</span><strong>{fmt(Number(av), label === 'Passaggi %' ? 1 : 2)}</strong><div className="compareBar"><i style={{width:`${Math.min(100, Math.max(0, Number(av) / Math.max(Number(av), Number(bv), 0.0001) * 100))}%`}}></i></div><strong>{fmt(Number(bv), label === 'Passaggi %' ? 1 : 2)}</strong></div>)}
      </section>}
      {a && b && <div className="compareNames"><span>{a.name}</span><span>{b.name}</span></div>}
    </>}
  </main>;
}
