'use client';

import { useEffect, useMemo, useState } from 'react';

type Player = {
  playerId: string; name: string; appearances: number; minutes: number; goals: number; goalsPer90: number;
  assists: number; yellowCards: number; redCards: number;
  shots: number; shotsPer90: number; passes: number; completedPasses: number; passSuccess: number;
  distanceKm: number; distancePer90: number; sprints: number; sprintsPer90: number;
  highIntensityRuns: number; highIntensityRunsPer90: number; maxSpeed: number; averageSpeed: number; minutesPerAppearance: number;
  recoveredBalls: number; recoveredBallsPer90: number; tackles: number; tacklesPer90: number; fouls: number; foulsPer90: number;
  passesPer90: number; completedPassesPer90: number;
  sprintsPerKm: number; highIntensityRunsPerKm: number;
  goalsPerShot: number; minutesPerGoal: number; minutesPerShot: number;
};
type Match = {
  matchId: string; date: string; match: string; playerId: string; playerName: string; minutes: number;
  competition: 'CAMPIONATO' | 'COPPA';
  assists: number; yellowCards: number; redCards: number;
  goals: number; goalsPer90: number; shots: number; shotsPer90: number; passes: number; completedPasses: number;
  passSuccess: number; distanceKm: number; distancePer90: number; sprints: number; sprintsPer90: number;
  highIntensityRuns: number; highIntensityRunsPer90: number; recoveredBalls: number; recoveredBallsPer90: number;
  tackles: number; tacklesPer90: number; fouls: number; foulsPer90: number; maxSpeed: number; averageSpeed: number;
};
type TeamMatch = {
  matchId: string;
  date: string;
  match: string;
  competition: 'CAMPIONATO' | 'COPPA';
  result: string;
  homeAway: string;
  starters: { playerId: string; name: string; listNumber: number | null }[];
  summary: {
    playersUsed: number;
    minutes: number;
    goals: number;
    assists: number;
    yellowCards: number;
    redCards: number;
    sprints: number;
    highIntensityRuns: number;
    recoveredBalls: number;
    tackles: number;
  } | null;
};
type TacticalKind = 'average' | 'shot' | 'tackle';
type TacticalPoint = {
  id: string;
  kind: TacticalKind;
  matchId: string;
  match: string;
  date: string;
  competition: 'CAMPIONATO' | 'COPPA';
  playerId: string;
  playerName: string;
  x: number;
  y: number;
  jerseyNumber: number | null;
  minute: number | null;
  outcome: string;
};
type TacticalData = { averagePositions: TacticalPoint[]; shots: TacticalPoint[]; tackles: TacticalPoint[]; source: 'supabase' | 'none' };
type Data = { stagione?: string; role?: 'STAFF' | 'GIOCATORE'; userName?: string; playerId?: string | null; players?: Player[]; matches?: Match[]; teamMatches?: TeamMatch[]; tactics?: TacticalData; error?: string };
type PlayerCompetitionStats = {
  label: 'Campionato' | 'Coppa';
  appearances: number;
  minutes: number;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  shots: number;
  shotsPer90: number;
  passes: number;
  completedPasses: number;
  passSuccess: number;
  distanceKm: number;
  distancePer90: number;
  sprints: number;
  sprintsPer90: number;
  highIntensityRuns: number;
  highIntensityRunsPer90: number;
  recoveredBalls: number;
  recoveredBallsPer90: number;
  tackles: number;
  tacklesPer90: number;
  fouls: number;
  foulsPer90: number;
  maxSpeed: number;
  averageSpeed: number;
};
type TacticalMode = 'average' | 'shot' | 'tackle';

const fmt = (v: unknown, digits = 1) => Number(v ?? 0).toLocaleString('it-IT', { maximumFractionDigits: digits, minimumFractionDigits: digits });
const int = (v: unknown) => Number(v ?? 0).toLocaleString('it-IT', { maximumFractionDigits: 0 });
const opponentLabel = (match: string) => {
  const fallback = match.trim() || '—';
  const opponent = fallback
    .replace(/A\.?S\.?D\.?\s+Villanovese|Villanovese/gi, '')
    .replace(/\s*(?:-|–|—|vs\.?)\s*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return opponent || fallback;
};
const tacticalKindLabel = (kind: TacticalKind) =>
  kind === 'shot' ? 'Tiro' : kind === 'tackle' ? 'Tackle' : 'Posizione media';
const zoneInfo = (point: TacticalPoint) => ({
  lane: point.y < 33.34 ? 'Sinistra' : point.y < 66.67 ? 'Centro' : 'Destra',
  third: point.x < 33.34 ? 'Terzo difensivo' : point.x < 66.67 ? 'Terzo centrale' : 'Terzo offensivo',
});

function Stat({ label, value, suffix = '' }: { label: string; value: string | number; suffix?: string }) {
  return <div className="stat"><span>{label}</span><strong>{value}{suffix}</strong></div>;
}

const hasPlayerTechnicalData = (player: Player) =>
  player.shots > 0 ||
  player.passes > 0 ||
  player.completedPasses > 0 ||
  player.distanceKm > 0 ||
  player.sprints > 0 ||
  player.highIntensityRuns > 0 ||
  player.recoveredBalls > 0 ||
  player.tackles > 0 ||
  player.fouls > 0 ||
  player.maxSpeed > 0 ||
  player.averageSpeed > 0;

const hasCompetitionTechnicalData = (stats: PlayerCompetitionStats) =>
  stats.shots > 0 ||
  stats.passes > 0 ||
  stats.completedPasses > 0 ||
  stats.distanceKm > 0 ||
  stats.sprints > 0 ||
  stats.highIntensityRuns > 0 ||
  stats.recoveredBalls > 0 ||
  stats.tackles > 0 ||
  stats.fouls > 0 ||
  stats.maxSpeed > 0 ||
  stats.averageSpeed > 0;

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
  const visibleRows = rows.slice(0, 8);
  return <section className="panel tablePanel"><div className="sectionTitle"><div><span className="eyebrow">RANKING</span><h2>{title}</h2></div><span>{metricLabel}</span></div><div className="rankingList">
    {visibleRows.length ? visibleRows.map((r, i) => <div className="rankRow" key={r.name}><span className="rankNo">{i + 1}</span><strong>{r.name}</strong><span>{fmt(r.value, 2)}</span></div>) : <div className="rankEmpty">Nessun dato disponibile.</div>}
  </div></section>;
}

function DisciplineRankTable({ title, rows, metricLabel }: { title: string; rows: { name: string; yellowCards: number; redCards: number }[]; metricLabel: string }) {
  const visibleRows = rows.slice(0, 8);
  return <section className="panel tablePanel"><div className="sectionTitle"><div><span className="eyebrow">DISCIPLINA</span><h2>{title}</h2></div><span>{metricLabel}</span></div><div className="rankingList">
    {visibleRows.length ? visibleRows.map((r, i) => <div className="disciplineRankRow" key={r.name}><span className="rankNo">{i + 1}</span><strong>{r.name}</strong><span className="yellowValue">{int(r.yellowCards)}</span><span className="redValue">{int(r.redCards)}</span></div>) : <div className="rankEmpty">Nessun cartellino.</div>}
  </div></section>;
}

function PlayerCompetitionPanel({ stats }: { stats: PlayerCompetitionStats }) {
  const hasTechnicalData = hasCompetitionTechnicalData(stats);

  return <section className="panel tablePanel competitionPanel"><div className="sectionTitle"><div><span className="eyebrow">COMPETIZIONE</span><h2>{stats.label}</h2></div><span>{int(stats.appearances)} gare</span></div><div className="compactStatsGrid">
    <Stat label="Minuti" value={int(stats.minutes)} />
    <Stat label="Minuti / gara" value={stats.appearances > 0 ? fmt(stats.minutes / stats.appearances, 1) : '—'} />
    <Stat label="Gol" value={int(stats.goals)} />
    {stats.assists > 0 && <Stat label="Assist" value={int(stats.assists)} />}
    {stats.yellowCards > 0 && <Stat label="Ammonizioni" value={int(stats.yellowCards)} />}
    {stats.redCards > 0 && <Stat label="Espulsioni" value={int(stats.redCards)} />}
    {hasTechnicalData && stats.shots > 0 && <Stat label="Tiri" value={int(stats.shots)} />}
    {hasTechnicalData && stats.shots > 0 && <Stat label="Tiri / 90" value={fmt(stats.shotsPer90, 2)} />}
    {hasTechnicalData && stats.passes > 0 && <Stat label="Passaggi %" value={fmt(stats.passSuccess, 1)} suffix="%" />}
    {hasTechnicalData && stats.distanceKm > 0 && <Stat label="Distanza" value={fmt(stats.distanceKm, 1)} suffix=" km" />}
    {hasTechnicalData && stats.distanceKm > 0 && <Stat label="Distanza / 90" value={fmt(stats.distancePer90, 1)} suffix=" km" />}
    {hasTechnicalData && stats.recoveredBalls > 0 && <Stat label="Palle recuperate" value={int(stats.recoveredBalls)} />}
    {hasTechnicalData && stats.tackles > 0 && <Stat label="Contrasti" value={int(stats.tackles)} />}
    {hasTechnicalData && stats.fouls > 0 && <Stat label="Falli" value={int(stats.fouls)} />}
    {hasTechnicalData && stats.sprints > 0 && <Stat label="Sprint / 90" value={fmt(stats.sprintsPer90, 2)} />}
    {hasTechnicalData && stats.highIntensityRuns > 0 && <Stat label="Alta intensità / 90" value={fmt(stats.highIntensityRunsPer90, 2)} />}
    {hasTechnicalData && stats.recoveredBalls > 0 && <Stat label="Recuperi / 90" value={fmt(stats.recoveredBallsPer90, 2)} />}
    {hasTechnicalData && stats.tackles > 0 && <Stat label="Contrasti / 90" value={fmt(stats.tacklesPer90, 2)} />}
  </div></section>;
}

function TeamMatchesSection({ matches }: { matches: TeamMatch[] }) {
  const sortedMatches = [...matches].sort((a, b) => b.date.localeCompare(a.date));
  const dateLabel = (date: string) => date
    ? new Date(`${date}T12:00:00`).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })
    : 'Data non disponibile';

  return <section className="panel tablePanel teamMatchesPanel">
    <div className="sectionTitle"><div><span className="eyebrow">PARTITE</span><h2>Risultati e formazioni</h2></div><span>{sortedMatches.length} gare</span></div>
    <div className="teamMatchList">
      {sortedMatches.length ? sortedMatches.map(match => {
        const matchMetrics = match.summary ? [
          { label: 'Giocatori impiegati', value: match.summary.playersUsed, visible: match.summary.playersUsed > 0 },
          { label: 'Minuti complessivi', value: match.summary.minutes, visible: match.summary.minutes > 0 },
          { label: 'Gol registrati', value: match.summary.goals, visible: match.summary.goals > 0 },
          { label: 'Assist', value: match.summary.assists, visible: match.summary.assists > 0 },
          { label: 'Ammonizioni', value: match.summary.yellowCards, visible: match.summary.yellowCards > 0 },
          { label: 'Espulsioni', value: match.summary.redCards, visible: match.summary.redCards > 0 },
          { label: 'Sprint', value: match.summary.sprints, visible: match.summary.sprints > 0 },
          { label: 'Alta intensità', value: match.summary.highIntensityRuns, visible: match.summary.highIntensityRuns > 0 },
          { label: 'Palle recuperate', value: match.summary.recoveredBalls, visible: match.summary.recoveredBalls > 0 },
          { label: 'Contrasti', value: match.summary.tackles, visible: match.summary.tackles > 0 },
        ].filter(metric => metric.visible) : [];

        return <article className="teamMatchCard" key={match.matchId}>
          <div className="teamMatchHead">
            <div>
              <span className="teamMatchMeta">{match.competition === 'COPPA' ? 'Coppa' : 'Campionato'} · {dateLabel(match.date)}{match.homeAway ? ` · ${match.homeAway}` : ''}</span>
              <h3>{match.match}</h3>
            </div>
            <div className="teamMatchResult"><span>Risultato</span><strong>{match.result || '—'}</strong></div>
          </div>
          <div className="teamLineup">
            <div className="teamLineupTitle"><span>Formazione titolare</span><small>{match.starters.length ? `${match.starters.length} giocatori` : 'dato non disponibile'}</small></div>
            {match.starters.length ? <div className="starterGrid">
              {match.starters.map(starter => <div className="starterItem" key={`${match.matchId}-${starter.playerId}`}>
                <span>{starter.listNumber ?? '—'}</span><strong>{starter.name}</strong>
              </div>)}
            </div> : <p className="lineupEmpty">Formazione titolare non disponibile.</p>}
          </div>
          {matchMetrics.length > 0 && <div className="teamMatchStats">
            {matchMetrics.map(metric => <div className="teamMatchStat" key={metric.label}><span>{metric.label}</span><strong>{int(metric.value)}</strong></div>)}
          </div>}
          <a className="reportTableLink teamMatchReport" href={`/matches/${encodeURIComponent(match.matchId)}`}>Apri report</a>
        </article>;
      }) : <p className="lineupEmpty">Nessuna partita disponibile.</p>}
    </div>
  </section>;
}

function TacticalPitch({ title, points, mode, selectedId, onSelect }: { title: string; points: TacticalPoint[]; mode: TacticalMode; selectedId: string; onSelect: (point: TacticalPoint) => void }) {
  const pointClass = mode === 'average' ? 'averagePoint' : mode === 'shot' ? 'shotPoint' : 'tacklePoint';
  return <section className="panel pitchPanel"><div className="sectionTitle"><div><span className="eyebrow">TACTICAL FIELD</span><h2>{title}</h2></div><span>{points.length} {mode === 'average' ? 'posizioni' : 'eventi'}</span></div><div className="pitchWrap">
    <svg viewBox="0 0 100 68" role="img" aria-label={title} className="footballPitch">
      <rect x="1" y="1" width="98" height="66" rx="1.5" className="pitchLine" />
      <line x1="50" y1="1" x2="50" y2="67" className="pitchLine" />
      <circle cx="50" cy="34" r="9.15" className="pitchLine noFill" />
      <circle cx="50" cy="34" r="0.7" className="pitchFill" />
      <rect x="1" y="13.84" width="16.5" height="40.32" className="pitchLine noFill" />
      <rect x="82.5" y="13.84" width="16.5" height="40.32" className="pitchLine noFill" />
      <rect x="1" y="24.84" width="5.5" height="18.32" className="pitchLine noFill" />
      <rect x="93.5" y="24.84" width="5.5" height="18.32" className="pitchLine noFill" />
      <circle cx="11" cy="34" r="0.6" className="pitchFill" />
      <circle cx="89" cy="34" r="0.6" className="pitchFill" />
      {points.map((point) => {
        const pitchY = point.y * 0.68;
        return <g key={point.id} className={`tacticalPoint ${pointClass} ${point.id === selectedId ? 'selectedPoint' : ''}`} onClick={() => onSelect(point)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(point); } }} tabIndex={0} role="button" aria-label={`${point.playerName || 'Giocatore'} ${point.outcome || ''}`}>
          <circle cx={point.x} cy={pitchY} r={point.id === selectedId ? 2.7 : mode === 'average' ? 2.4 : 1.9} />
          {mode === 'average' && <text x={point.x} y={pitchY + 0.9} textAnchor="middle">{point.jerseyNumber ?? '?'}</text>}
          <title>{point.playerName || 'Giocatore'} · {point.match || 'Partita'}{point.minute !== null ? ` · ${point.minute}'` : ''}{point.outcome ? ` · ${point.outcome}` : ''}</title>
        </g>;
      })}
    </svg>
    {!points.length && <div className="pitchEmpty">Nessun dato con questi filtri.</div>}
  </div></section>;
}

export default function Home() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState('');
  const [view, setView] = useState<'player' | 'team' | 'minutes' | 'tactics' | 'compare'>('player');
  const [compareA, setCompareA] = useState('');
  const [compareB, setCompareB] = useState('');
  const [tacticalMode, setTacticalMode] = useState<TacticalMode>('average');
  const [tacticalCompetition, setTacticalCompetition] = useState<'ALL' | 'CAMPIONATO' | 'COPPA'>('ALL');
  const [tacticalPlayerId, setTacticalPlayerId] = useState('ALL');
  const [tacticalMatchId, setTacticalMatchId] = useState('ALL');
  const [selectedTacticalPointId, setSelectedTacticalPointId] = useState('');

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
        setTacticalPlayerId(json.role === 'GIOCATORE' && json.playerId ? json.playerId : 'ALL');
      })
      .catch(e => setError(e.message));
  }, []);

  const players = data?.players ?? [];
  const matches = data?.matches ?? [];
  const teamMatches = data?.teamMatches ?? [];
  const tactics = data?.tactics ?? { averagePositions: [], shots: [], tackles: [], source: 'none' as const };
  const player = useMemo(() => players.find(p => p.name === selected), [players, selected]);
  const playerMatches = useMemo(() => matches.filter(m => m.playerName === selected).sort((a,b) => a.date.localeCompare(b.date)), [matches, selected]);
  const generalPlayerMatches = useMemo(() => teamMatches.map(g => ({
    ...g,
    stats: matches.find(m => m.matchId === g.matchId) ?? null,
  })), [teamMatches, matches]);
  const playerCompetitionStats = useMemo(() => {
    const createStats = (label: 'Campionato' | 'Coppa') => ({
      label,
      appearances: 0,
      minutes: 0,
      goals: 0,
      assists: 0,
      yellowCards: 0,
      redCards: 0,
      shots: 0,
      passes: 0,
      completedPasses: 0,
      distanceKm: 0,
      sprints: 0,
      highIntensityRuns: 0,
      recoveredBalls: 0,
      tackles: 0,
      fouls: 0,
      maxSpeed: 0,
      weightedAverageSpeed: 0,
    });

    const buckets = {
      campionato: createStats('Campionato'),
      coppa: createStats('Coppa'),
    };

    playerMatches.forEach(match => {
      const bucket = match.competition === 'COPPA' ? buckets.coppa : buckets.campionato;
      if (match.minutes > 0) bucket.appearances += 1;
      bucket.minutes += match.minutes;
      bucket.goals += match.goals;
      bucket.assists += match.assists;
      bucket.yellowCards += match.yellowCards;
      bucket.redCards += match.redCards;
      bucket.shots += match.shots;
      bucket.passes += match.passes;
      bucket.completedPasses += match.completedPasses;
      bucket.distanceKm += match.distanceKm;
      bucket.sprints += match.sprints;
      bucket.highIntensityRuns += match.highIntensityRuns;
      bucket.recoveredBalls += match.recoveredBalls;
      bucket.tackles += match.tackles;
      bucket.fouls += match.fouls;
      bucket.maxSpeed = Math.max(bucket.maxSpeed, match.maxSpeed);
      bucket.weightedAverageSpeed += match.averageSpeed * match.minutes;
    });

    const finalize = (stats: ReturnType<typeof createStats>): PlayerCompetitionStats => ({
      label: stats.label,
      appearances: stats.appearances,
      minutes: stats.minutes,
      goals: stats.goals,
      assists: stats.assists,
      yellowCards: stats.yellowCards,
      redCards: stats.redCards,
      shots: stats.shots,
      shotsPer90: stats.minutes > 0 ? stats.shots * 90 / stats.minutes : 0,
      passes: stats.passes,
      completedPasses: stats.completedPasses,
      passSuccess: stats.passes > 0 ? stats.completedPasses / stats.passes * 100 : 0,
      distanceKm: stats.distanceKm,
      distancePer90: stats.minutes > 0 ? stats.distanceKm * 90 / stats.minutes : 0,
      sprints: stats.sprints,
      sprintsPer90: stats.minutes > 0 ? stats.sprints * 90 / stats.minutes : 0,
      highIntensityRuns: stats.highIntensityRuns,
      highIntensityRunsPer90: stats.minutes > 0 ? stats.highIntensityRuns * 90 / stats.minutes : 0,
      recoveredBalls: stats.recoveredBalls,
      recoveredBallsPer90: stats.minutes > 0 ? stats.recoveredBalls * 90 / stats.minutes : 0,
      tackles: stats.tackles,
      tacklesPer90: stats.minutes > 0 ? stats.tackles * 90 / stats.minutes : 0,
      fouls: stats.fouls,
      foulsPer90: stats.minutes > 0 ? stats.fouls * 90 / stats.minutes : 0,
      maxSpeed: stats.maxSpeed,
      averageSpeed: stats.minutes > 0 ? stats.weightedAverageSpeed / stats.minutes : 0,
    });

    return {
      campionato: finalize(buckets.campionato),
      coppa: finalize(buckets.coppa),
    };
  }, [playerMatches]);
  const minutesRows = useMemo(() => {
    const minutesByPlayerMatch = new Map<string, number>();
    matches.forEach(m => minutesByPlayerMatch.set(`${m.playerId}:${m.matchId}`, m.minutes));

    return [...players]
      .sort((a, b) => b.minutes - a.minutes || a.name.localeCompare(b.name, 'it'))
      .map(p => ({
        player: p,
        matchMinutes: teamMatches.map(match => minutesByPlayerMatch.get(`${p.playerId}:${match.matchId}`) ?? 0),
      }));
  }, [players, matches, teamMatches]);

  const team = useMemo(() => {
    const playedMatchIds = new Set(matches.map(m => m.matchId).filter(Boolean));
    const playedMatches = playedMatchIds.size || teamMatches.length;
    const usedPlayers = players.filter(p => p.minutes > 0 || p.appearances > 0).length;
    const totalMinutes = players.reduce((s, p) => s + p.minutes, 0);
    const totalAppearances = players.reduce((s, p) => s + p.appearances, 0);
    const goals = players.reduce((s, p) => s + p.goals, 0);
    const assists = players.reduce((s, p) => s + p.assists, 0);
    const yellowCards = players.reduce((s, p) => s + p.yellowCards, 0);
    const redCards = players.reduce((s, p) => s + p.redCards, 0);
    const cards = yellowCards + redCards;
    const shots = players.reduce((s, p) => s + p.shots, 0);
    const passes = players.reduce((s, p) => s + p.passes, 0);
    const completedPasses = players.reduce((s, p) => s + p.completedPasses, 0);
    const distance = players.reduce((s, p) => s + p.distanceKm, 0);
    const sprints = players.reduce((s, p) => s + p.sprints, 0);
    const highIntensity = players.reduce((s, p) => s + p.highIntensityRuns, 0);
    const recoveredBalls = players.reduce((s, p) => s + p.recoveredBalls, 0);
    const tackles = players.reduce((s, p) => s + p.tackles, 0);
    const fouls = players.reduce((s, p) => s + p.fouls, 0);
    const maxSpeed = Math.max(...players.map(p => p.maxSpeed), 0);
    const weightedAverageSpeed = players.reduce((s, p) => s + p.averageSpeed * p.minutes, 0);

    return {
      players: players.length,
      usedPlayers,
      playedMatches,
      totalAppearances,
      totalMinutes,
      goals,
      assists,
      yellowCards,
      redCards,
      cards,
      shots,
      passes,
      completedPasses,
      distance,
      sprints,
      highIntensity,
      recoveredBalls,
      tackles,
      fouls,
      maxSpeed,
      averageSpeed: totalMinutes > 0 ? weightedAverageSpeed / totalMinutes : 0,
      passSuccess: passes > 0 ? completedPasses / passes * 100 : 0,
      goalsPerMatch: playedMatches > 0 ? goals / playedMatches : 0,
      assistsPerMatch: playedMatches > 0 ? assists / playedMatches : 0,
      cardsPerMatch: playedMatches > 0 ? cards / playedMatches : 0,
      minutesPerUsedPlayer: usedPlayers > 0 ? totalMinutes / usedPlayers : 0,
      minutesPerAppearance: totalAppearances > 0 ? totalMinutes / totalAppearances : 0,
      hasVeoData: shots > 0 || passes > 0 || distance > 0 || sprints > 0 || highIntensity > 0 || recoveredBalls > 0 || tackles > 0 || fouls > 0 || maxSpeed > 0 || weightedAverageSpeed > 0,
    };
  }, [players, matches, teamMatches]);

  const matchSummary = useMemo(() => {
    const map = new Map<string, { date: string; match: string; goals: number; assists: number; cards: number; minutes: number; appearances: number }>();
    matches.forEach(m => {
      const current = map.get(m.matchId) ?? { date: m.date, match: m.match, goals: 0, assists: 0, cards: 0, minutes: 0, appearances: 0 };
      current.goals += m.goals;
      current.assists += m.assists;
      current.cards += m.yellowCards + m.redCards;
      current.minutes += m.minutes;
      if (m.minutes > 0) current.appearances += 1;
      map.set(m.matchId, current);
    });
    return [...map.values()].sort((a,b) => a.date.localeCompare(b.date));
  }, [matches]);

  const rankings = useMemo(() => ({
    goals90: [...players].sort((a,b) => b.goalsPer90 - a.goalsPer90).map(p => ({name:p.name,value:p.goalsPer90})),
    minutes: [...players].sort((a,b) => b.minutes - a.minutes || a.name.localeCompare(b.name, 'it')).map(p => ({name:p.name,value:p.minutes})),
    appearances: [...players].sort((a,b) => b.appearances - a.appearances || b.minutes - a.minutes || a.name.localeCompare(b.name, 'it')).map(p => ({name:p.name,value:p.appearances})),
    sprints90: [...players].filter(p => p.sprints > 0).sort((a,b) => b.sprintsPer90 - a.sprintsPer90 || a.name.localeCompare(b.name, 'it')).map(p => ({name:p.name,value:p.sprintsPer90})),
    highIntensity90: [...players].filter(p => p.highIntensityRuns > 0).sort((a,b) => b.highIntensityRunsPer90 - a.highIntensityRunsPer90 || a.name.localeCompare(b.name, 'it')).map(p => ({name:p.name,value:p.highIntensityRunsPer90})),
    recoveredBalls90: [...players].filter(p => p.recoveredBalls > 0).sort((a,b) => b.recoveredBallsPer90 - a.recoveredBallsPer90 || a.name.localeCompare(b.name, 'it')).map(p => ({name:p.name,value:p.recoveredBallsPer90})),
    tackles90: [...players].filter(p => p.tackles > 0).sort((a,b) => b.tacklesPer90 - a.tacklesPer90 || a.name.localeCompare(b.name, 'it')).map(p => ({name:p.name,value:p.tacklesPer90})),
  }), [players]);
  const competitionRankings = useMemo(() => {
    const playerNameById = new Map(players.map(p => [p.playerId, p.name]));
    const buckets = {
      CAMPIONATO: new Map<string, { name: string; goals: number; assists: number; yellowCards: number; redCards: number }>(),
      COPPA: new Map<string, { name: string; goals: number; assists: number; yellowCards: number; redCards: number }>(),
    };

    matches.forEach(m => {
      const bucket = buckets[m.competition === 'COPPA' ? 'COPPA' : 'CAMPIONATO'];
      const current = bucket.get(m.playerId) ?? {
        name: m.playerName || playerNameById.get(m.playerId) || m.playerId,
        goals: 0,
        assists: 0,
        yellowCards: 0,
        redCards: 0,
      };
      current.goals += m.goals;
      current.assists += m.assists;
      current.yellowCards += m.yellowCards;
      current.redCards += m.redCards;
      bucket.set(m.playerId, current);
    });

    const sortedMetricRows = (
      rows: Map<string, { name: string; goals: number; assists: number; yellowCards: number; redCards: number }>,
      metric: 'goals' | 'assists'
    ) => [...rows.values()]
      .filter(row => row[metric] > 0)
      .sort((a, b) => b[metric] - a[metric] || a.name.localeCompare(b.name, 'it'))
      .map(row => ({ name: row.name, value: row[metric] }));

    const sortedDisciplineRows = (rows: Map<string, { name: string; goals: number; assists: number; yellowCards: number; redCards: number }>) =>
      [...rows.values()].filter(row => row.yellowCards > 0 || row.redCards > 0).sort((a, b) =>
        (b.yellowCards + b.redCards) - (a.yellowCards + a.redCards) ||
        b.redCards - a.redCards ||
        b.yellowCards - a.yellowCards ||
        a.name.localeCompare(b.name, 'it')
      );

    return {
      campionato: {
        goals: sortedMetricRows(buckets.CAMPIONATO, 'goals'),
        assists: sortedMetricRows(buckets.CAMPIONATO, 'assists'),
        discipline: sortedDisciplineRows(buckets.CAMPIONATO),
      },
      coppa: {
        goals: sortedMetricRows(buckets.COPPA, 'goals'),
        assists: sortedMetricRows(buckets.COPPA, 'assists'),
        discipline: sortedDisciplineRows(buckets.COPPA),
      },
    };
  }, [matches, players]);
  const allTacticalPoints = useMemo(() => [
    ...tactics.averagePositions,
    ...tactics.shots,
    ...tactics.tackles,
  ], [tactics]);
  const filteredAveragePoints = useMemo(() => tactics.averagePositions.filter(point =>
    (tacticalCompetition === 'ALL' || point.competition === tacticalCompetition) &&
    (tacticalPlayerId === 'ALL' || (point.playerId || point.playerName) === tacticalPlayerId) &&
    (tacticalMatchId === 'ALL' || point.matchId === tacticalMatchId)
  ), [tactics.averagePositions, tacticalCompetition, tacticalPlayerId, tacticalMatchId]);
  const filteredShotPoints = useMemo(() => tactics.shots.filter(point =>
    (tacticalCompetition === 'ALL' || point.competition === tacticalCompetition) &&
    (tacticalPlayerId === 'ALL' || (point.playerId || point.playerName) === tacticalPlayerId) &&
    (tacticalMatchId === 'ALL' || point.matchId === tacticalMatchId)
  ), [tactics.shots, tacticalCompetition, tacticalPlayerId, tacticalMatchId]);
  const filteredTacklePoints = useMemo(() => tactics.tackles.filter(point =>
    (tacticalCompetition === 'ALL' || point.competition === tacticalCompetition) &&
    (tacticalPlayerId === 'ALL' || (point.playerId || point.playerName) === tacticalPlayerId) &&
    (tacticalMatchId === 'ALL' || point.matchId === tacticalMatchId)
  ), [tactics.tackles, tacticalCompetition, tacticalPlayerId, tacticalMatchId]);
  const filteredTacticalPoints = useMemo(() => [
    ...filteredAveragePoints,
    ...filteredShotPoints,
    ...filteredTacklePoints,
  ], [filteredAveragePoints, filteredShotPoints, filteredTacklePoints]);
  const activeTacticalPoints = useMemo(() => {
    if (tacticalMode === 'shot') return filteredShotPoints;
    if (tacticalMode === 'tackle') return filteredTacklePoints;
    return filteredAveragePoints;
  }, [filteredAveragePoints, filteredShotPoints, filteredTacklePoints, tacticalMode]);
  const tacticalMatchOptions = useMemo(() => {
    const matchIds = new Set(allTacticalPoints.map(point => point.matchId).filter(Boolean));
    return teamMatches.filter(match => matchIds.has(match.matchId));
  }, [allTacticalPoints, teamMatches]);
  const tacticalPlayerOptions = useMemo(() => {
    const playerLabels = new Map(players.map(p => [p.playerId, p.name]));
    allTacticalPoints.forEach(point => {
      const key = point.playerId || point.playerName;
      if (key && !playerLabels.has(key)) playerLabels.set(key, point.playerName || key);
    });

    const playerIds = new Set(allTacticalPoints.map(point => point.playerId || point.playerName).filter(Boolean));
    return [...playerLabels.entries()]
      .filter(([playerId]) => playerIds.has(playerId))
      .map(([playerId, name]) => ({ playerId, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'it'));
  }, [allTacticalPoints, players]);
  const selectedTacticalPoint = useMemo(() =>
    filteredTacticalPoints.find(point => point.id === selectedTacticalPointId) ?? activeTacticalPoints[0] ?? filteredTacticalPoints[0] ?? null,
  [activeTacticalPoints, filteredTacticalPoints, selectedTacticalPointId]);
  const tacticalTitle = tacticalMode === 'shot'
    ? 'Shot map'
    : tacticalMode === 'tackle'
      ? 'Tackle map'
      : 'Posizione media';
  const tacticalZoneSummary = useMemo(() => {
    const total = activeTacticalPoints.length;
    const laneCounts = { Sinistra: 0, Centro: 0, Destra: 0 };
    const thirdCounts = { 'Terzo difensivo': 0, 'Terzo centrale': 0, 'Terzo offensivo': 0 };

    activeTacticalPoints.forEach(point => {
      const zone = zoneInfo(point);
      laneCounts[zone.lane as keyof typeof laneCounts] += 1;
      thirdCounts[zone.third as keyof typeof thirdCounts] += 1;
    });

    const toRows = (counts: Record<string, number>) =>
      Object.entries(counts).map(([label, value]) => ({
        label,
        value,
        percent: total > 0 ? value * 100 / total : 0,
      }));

    return {
      total,
      lanes: toRows(laneCounts),
      thirds: toRows(thirdCounts),
    };
  }, [activeTacticalPoints]);
  const selectedTacticalZone = selectedTacticalPoint ? zoneInfo(selectedTacticalPoint) : null;

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
      {data.role === 'STAFF' && <><button className={view === 'team' ? 'active' : ''} onClick={() => setView('team')}>Squadra</button><button className={view === 'minutes' ? 'active' : ''} onClick={() => setView('minutes')}>Minuti</button><button className={view === 'tactics' ? 'active' : ''} onClick={() => setView('tactics')}>Tattica</button><button className={view === 'compare' ? 'active' : ''} onClick={() => setView('compare')}>Confronto</button></>}
    </nav>

    {view === 'player' && <>
      <section className="hero"><div><p className="eyebrow">PLAYER CENTER</p><h1>{data.role === 'GIOCATORE' ? 'Profilo personale' : 'Dashboard giocatore'}</h1><p>{data.role === 'GIOCATORE' ? 'Le tue statistiche stagionali e tutte le partite della squadra.' : 'Statistiche stagionali e rendimento partita per partita.'}</p></div>{data.role === 'STAFF' && <label className="selector">Giocatore<select value={selected} onChange={e => setSelected(e.target.value)}>{players.map(p => <option key={p.playerId} value={p.name}>{p.name}</option>)}</select></label>}</section>
      {player && <>
        <section className="profile panel"><div><span className="eyebrow">PROFILO</span><h2>{player.name}</h2><p>{player.appearances} presenze · {int(player.minutes)} minuti</p></div><div className="profileHighlight"><span>GOL / 90</span><strong>{fmt(player.goalsPer90, 2)}</strong></div></section>
        <section className="statsGrid">
          <Stat label="Presenze" value={int(player.appearances)} /><Stat label="Minuti" value={int(player.minutes)} /><Stat label="Minuti / presenza" value={fmt(player.minutesPerAppearance, 1)} /><Stat label="Gol" value={int(player.goals)} />
          <Stat label="Gol / 90" value={fmt(player.goalsPer90, 2)} />{player.assists > 0 && <Stat label="Assist" value={int(player.assists)} />}{player.yellowCards > 0 && <Stat label="Ammonizioni" value={int(player.yellowCards)} />}{player.redCards > 0 && <Stat label="Espulsioni" value={int(player.redCards)} />}
        </section>
        {hasPlayerTechnicalData(player) && <section className="panel tablePanel advancedStats">
          <div className="sectionTitle"><div><span className="eyebrow">DATI TECNICI</span><h2>Tracking disponibile</h2></div><span>Veo</span></div>
          <div className="statsGrid advancedGrid">
            {player.shots > 0 && <Stat label="Tiri" value={int(player.shots)} />}
            {player.shots > 0 && <Stat label="Tiri / 90" value={fmt(player.shotsPer90, 2)} />}
            {player.passes > 0 && <Stat label="Passaggi" value={int(player.passes)} />}
            {player.completedPasses > 0 && <Stat label="Passaggi completati" value={int(player.completedPasses)} />}
            {player.passes > 0 && <Stat label="Passaggi %" value={fmt(player.passSuccess, 1)} suffix="%" />}
            {player.distanceKm > 0 && <Stat label="Distanza" value={fmt(player.distanceKm, 1)} suffix=" km" />}
            {player.distanceKm > 0 && <Stat label="Distanza / 90" value={fmt(player.distancePer90, 1)} suffix=" km" />}
            {player.sprints > 0 && <Stat label="Sprint" value={int(player.sprints)} />}
            {player.highIntensityRuns > 0 && <Stat label="Alta intensità" value={int(player.highIntensityRuns)} />}
            {player.recoveredBalls > 0 && <Stat label="Palle recuperate" value={int(player.recoveredBalls)} />}
            {player.tackles > 0 && <Stat label="Contrasti" value={int(player.tackles)} />}
            {player.fouls > 0 && <Stat label="Falli" value={int(player.fouls)} />}
            {player.maxSpeed > 0 && <Stat label="Velocità max" value={fmt(player.maxSpeed, 1)} suffix=" km/h" />}
            {player.averageSpeed > 0 && <Stat label="Velocità media" value={fmt(player.averageSpeed, 1)} suffix=" km/h" />}
          </div>
        </section>}
        <div className="twoCol competitionSplit"><PlayerCompetitionPanel stats={playerCompetitionStats.campionato} /><PlayerCompetitionPanel stats={playerCompetitionStats.coppa} /></div>
        {hasPlayerTechnicalData(player) && <section className="panel tablePanel advancedStats">
          <div className="sectionTitle"><div><span className="eyebrow">ANALISI STAGIONALE</span><h2>Indicatori avanzati</h2></div><span>stagione</span></div>
          <div className="statsGrid advancedGrid">
            {player.passes > 0 && <Stat label="Passaggi / 90" value={fmt(player.passesPer90, 2)} />}
            {player.completedPasses > 0 && <Stat label="Passaggi completati / 90" value={fmt(player.completedPassesPer90, 2)} />}
            {player.sprints > 0 && <Stat label="Sprint / 90" value={fmt(player.sprintsPer90, 2)} />}
            {player.highIntensityRuns > 0 && <Stat label="Alta intensità / 90" value={fmt(player.highIntensityRunsPer90, 2)} />}
            {player.recoveredBalls > 0 && <Stat label="Recuperi / 90" value={fmt(player.recoveredBallsPer90, 2)} />}
            {player.tackles > 0 && <Stat label="Contrasti / 90" value={fmt(player.tacklesPer90, 2)} />}
            {player.fouls > 0 && <Stat label="Falli / 90" value={fmt(player.foulsPer90, 2)} />}
            {player.sprints > 0 && player.distanceKm > 0 && <Stat label="Sprint / km" value={fmt(player.sprintsPerKm, 2)} />}
            {player.highIntensityRuns > 0 && player.distanceKm > 0 && <Stat label="Alta intensità / km" value={fmt(player.highIntensityRunsPerKm, 2)} />}
            {player.shots > 0 && <Stat label="Gol / tiro" value={fmt(player.goalsPerShot, 2)} />}
            <Stat label="Minuti / gol" value={player.goals > 0 ? fmt(player.minutesPerGoal, 1) : '—'} />
            {player.shots > 0 && <Stat label="Minuti / tiro" value={fmt(player.minutesPerShot, 1)} />}
          </div>
        </section>}
        {data.role === 'GIOCATORE' ? <section className="panel tablePanel"><div className="sectionTitle"><div><span className="eyebrow">PARTITE</span><h2>Partite generali</h2></div><span>{generalPlayerMatches.length} gare</span></div><div className="tableWrap"><table><thead><tr><th>Data</th><th>Partita</th><th>Presenza</th><th>Min</th><th>Gol</th><th>Assist</th><th>Amm.</th><th>Esp.</th><th>Report</th></tr></thead><tbody>{generalPlayerMatches.map((m, i) => { const s = m.stats; return <tr key={`${m.matchId}-${i}`}><td>{dateLabel(m.date)}</td><td>{m.match}</td><td>{s ? 'Sì' : 'Non impiegato'}</td><td>{s ? int(s.minutes) : '—'}</td><td>{s && s.goals > 0 ? int(s.goals) : '—'}</td><td>{s && s.assists > 0 ? int(s.assists) : '—'}</td><td>{s && s.yellowCards > 0 ? int(s.yellowCards) : '—'}</td><td>{s && s.redCards > 0 ? int(s.redCards) : '—'}</td><td><a className="reportTableLink" href={`/matches/${encodeURIComponent(m.matchId)}`}>Apri report</a></td></tr>; })}</tbody></table></div></section> : <section className="panel tablePanel"><div className="sectionTitle"><div><span className="eyebrow">MATCH LOG</span><h2>Partite</h2></div><span>{playerMatches.length} gare</span></div><div className="tableWrap"><table><thead><tr><th>Data</th><th>Partita</th><th>Min</th><th>Gol</th><th>Assist</th><th>Amm.</th><th>Esp.</th><th>Report</th></tr></thead><tbody>{playerMatches.map((m, i) => <tr key={`${m.matchId}-${i}`}><td>{dateLabel(m.date)}</td><td>{m.match}</td><td>{int(m.minutes)}</td><td>{m.goals > 0 ? int(m.goals) : '—'}</td><td>{m.assists > 0 ? int(m.assists) : '—'}</td><td>{m.yellowCards > 0 ? int(m.yellowCards) : '—'}</td><td>{m.redCards > 0 ? int(m.redCards) : '—'}</td><td><a className="reportTableLink" href={`/matches/${encodeURIComponent(m.matchId)}`}>Apri report</a></td></tr>)}</tbody></table></div></section>}
        <section className="chartsGrid"><LineChart title="Minuti per partita" unit="min" values={playerMatches.map(m => ({ label: dateLabel(m.date), value: m.minutes }))} /><LineChart title="Gol per partita" unit="gol" values={playerMatches.map(m => ({ label: dateLabel(m.date), value: m.goals }))} /><LineChart title="Cartellini per partita" unit="cartellini" color="neutral" values={playerMatches.map(m => ({ label: dateLabel(m.date), value: m.yellowCards + m.redCards }))} /></section>
      </>}
    </>}

    {view === 'team' && <>
      <section className="hero"><div><p className="eyebrow">TEAM CENTER</p><h1>Dashboard squadra</h1><p>Fotografia aggiornata della rosa: utilizzo, produzione offensiva e disciplina.</p></div><div className="heroMeta"><span>Partite con dati</span><strong>{team.playedMatches}</strong></div></section>
      <section className="statsGrid">
        <Stat label="Rosa utilizzata" value={`${int(team.usedPlayers)}/${int(team.players)}`} /><Stat label="Presenze totali" value={int(team.totalAppearances)} /><Stat label="Minuti squadra" value={int(team.totalMinutes)} /><Stat label="Minuti / presenza" value={fmt(team.minutesPerAppearance, 1)} />
        <Stat label="Gol" value={int(team.goals)} /><Stat label="Gol / partita" value={fmt(team.goalsPerMatch, 2)} /><Stat label="Assist" value={int(team.assists)} /><Stat label="Assist / partita" value={fmt(team.assistsPerMatch, 2)} />
        <Stat label="Ammonizioni" value={int(team.yellowCards)} /><Stat label="Espulsioni" value={int(team.redCards)} /><Stat label="Cartellini / partita" value={fmt(team.cardsPerMatch, 2)} /><Stat label="Minuti medi / giocatore" value={fmt(team.minutesPerUsedPlayer, 0)} />
      </section>
      {team.hasVeoData && <section className="panel tablePanel advancedStats">
        <div className="sectionTitle"><div><span className="eyebrow">VEO</span><h2>Dati fisici e tecnici</h2></div><span>totali squadra</span></div>
        <div className="statsGrid advancedGrid">
          {team.sprints > 0 && <Stat label="Sprint" value={int(team.sprints)} />}
          {team.highIntensity > 0 && <Stat label="Corse alta intensità" value={int(team.highIntensity)} />}
          {team.recoveredBalls > 0 && <Stat label="Palle recuperate" value={int(team.recoveredBalls)} />}
          {team.tackles > 0 && <Stat label="Contrasti" value={int(team.tackles)} />}
          {team.fouls > 0 && <Stat label="Falli" value={int(team.fouls)} />}
          {team.distance > 0 && <Stat label="Distanza" value={fmt(team.distance, 1)} suffix=" km" />}
          {team.shots > 0 && <Stat label="Tiri" value={int(team.shots)} />}
          {team.passes > 0 && <Stat label="Passaggi" value={int(team.passes)} />}
          {team.completedPasses > 0 && <Stat label="Passaggi completati" value={int(team.completedPasses)} />}
          {team.passes > 0 && <Stat label="Passaggi %" value={fmt(team.passSuccess, 1)} suffix="%" />}
          {team.maxSpeed > 0 && <Stat label="Velocità max" value={fmt(team.maxSpeed, 1)} suffix=" km/h" />}
          {team.averageSpeed > 0 && <Stat label="Velocità media" value={fmt(team.averageSpeed, 1)} suffix=" km/h" />}
        </div>
      </section>}
      <TeamMatchesSection matches={teamMatches} />
      <div className="twoCol"><RankTable title="Gol campionato" metricLabel="totale" rows={competitionRankings.campionato.goals} /><RankTable title="Assist campionato" metricLabel="totale" rows={competitionRankings.campionato.assists} /></div>
      <div className="twoCol"><RankTable title="Gol coppa" metricLabel="totale" rows={competitionRankings.coppa.goals} /><RankTable title="Assist coppa" metricLabel="totale" rows={competitionRankings.coppa.assists} /></div>
      <div className="twoCol"><DisciplineRankTable title="Campionato" metricLabel="amm. / esp." rows={competitionRankings.campionato.discipline} /><DisciplineRankTable title="Coppa" metricLabel="amm. / esp." rows={competitionRankings.coppa.discipline} /></div>
      <section className="chartsGrid teamCharts"><LineChart title="Gol squadra per partita" unit="gol" values={matchSummary.map(m => ({label: dateLabel(m.date), value:m.goals}))} /><LineChart title="Giocatori impiegati per partita" unit="giocatori" values={matchSummary.map(m => ({label: dateLabel(m.date), value:m.appearances}))} /><LineChart title="Cartellini squadra per partita" unit="cartellini" color="neutral" values={matchSummary.map(m => ({label: dateLabel(m.date), value:m.cards}))} /></section>
      <div className="twoCol"><RankTable title="Minuti giocati" metricLabel="minuti" rows={rankings.minutes} /><RankTable title="Presenze" metricLabel="gare" rows={rankings.appearances} /></div>
      {(rankings.sprints90.length > 0 || rankings.highIntensity90.length > 0) && <div className="twoCol">{rankings.sprints90.length > 0 && <RankTable title="Sprint / 90" metricLabel="sprint" rows={rankings.sprints90} />}{rankings.highIntensity90.length > 0 && <RankTable title="Alta intensità / 90" metricLabel="corse" rows={rankings.highIntensity90} />}</div>}
      {(rankings.recoveredBalls90.length > 0 || rankings.tackles90.length > 0) && <div className="twoCol">{rankings.recoveredBalls90.length > 0 && <RankTable title="Recuperi / 90" metricLabel="recuperi" rows={rankings.recoveredBalls90} />}{rankings.tackles90.length > 0 && <RankTable title="Contrasti / 90" metricLabel="contrasti" rows={rankings.tackles90} />}</div>}
      <div className="singleCol"><RankTable title="Gol / 90" metricLabel="indicatore" rows={rankings.goals90} /></div>
    </>}

    {view === 'minutes' && data.role === 'STAFF' && <>
      <section className="hero"><div><p className="eyebrow">STAFF MINUTES</p><h1>Minuti giocatori</h1><p>Tutti i giocatori ordinati per minuti totali, con il dettaglio partita per partita.</p></div><div className="heroMeta"><span>Partite</span><strong>{teamMatches.length}</strong></div></section>
      <section className="panel tablePanel minutesPanel">
        <div className="sectionTitle"><div><span className="eyebrow">ROSA</span><h2>Distribuzione minuti</h2></div><span>{minutesRows.length} giocatori</span></div>
        <div className="minutesTableWrap">
          <table className="minutesTable">
            <thead>
              <tr><th className="rankColumn">#</th><th className="playerColumn">Giocatore</th>{teamMatches.map(match => <th key={match.matchId} className="opponentColumn" title={`${dateLabel(match.date)} · ${match.match}`}>{opponentLabel(match.match)}</th>)}<th className="totalColumn">Totale</th></tr>
            </thead>
            <tbody>
              {minutesRows.map((row, index) => <tr key={row.player.playerId}>
                <td className="rankColumn">{index + 1}</td>
                <td className="playerColumn"><strong>{row.player.name}</strong><span>{int(row.player.appearances)} presenze</span></td>
                {row.matchMinutes.map((minutes, i) => <td key={`${row.player.playerId}-${teamMatches[i]?.matchId ?? i}`} className={minutes > 0 ? 'playedMinutes' : 'emptyMinutes'}>{minutes > 0 ? int(minutes) : '—'}</td>)}
                <td className="totalColumn"><strong>{int(row.player.minutes)}</strong></td>
              </tr>)}
            </tbody>
          </table>
        </div>
      </section>
    </>}

    {view === 'tactics' && data.role === 'STAFF' && <>
      <section className="hero"><div><p className="eyebrow">TACTICAL ROOM</p><h1>Tattica</h1><p>Posizioni medie, shot map, tackle map e distribuzione per zone.</p></div><div className="heroMeta"><span>Punti filtrati</span><strong>{filteredTacticalPoints.length}</strong></div></section>
      <section className="panel tacticsControls">
        <label className="selector">Partita<select value={tacticalMatchId} onChange={e => { setTacticalMatchId(e.target.value); setSelectedTacticalPointId(''); }}>
          <option value="ALL">Tutte le partite</option>
          {tacticalMatchOptions.map(match => <option key={match.matchId} value={match.matchId}>{opponentLabel(match.match)} · {match.competition === 'COPPA' ? 'Coppa' : 'Campionato'}</option>)}
        </select></label>
        <label className="selector">Giocatore<select value={tacticalPlayerId} onChange={e => { setTacticalPlayerId(e.target.value); setSelectedTacticalPointId(''); }}>
          <option value="ALL">Tutti i giocatori</option>
          {tacticalPlayerOptions.map(playerOption => <option key={playerOption.playerId} value={playerOption.playerId}>{playerOption.name}</option>)}
        </select></label>
        <label className="selector">Competizione<select value={tacticalCompetition} onChange={e => { setTacticalCompetition(e.target.value as 'ALL' | 'CAMPIONATO' | 'COPPA'); setSelectedTacticalPointId(''); }}>
          <option value="ALL">Tutte</option>
          <option value="CAMPIONATO">Campionato</option>
          <option value="COPPA">Coppa</option>
        </select></label>
        <div className="eventFilter"><span>Evento</span><div className="modeButtons">
          <button type="button" className={tacticalMode === 'average' ? 'active' : ''} onClick={() => { setTacticalMode('average'); setSelectedTacticalPointId(''); }}>Posizioni</button>
          <button type="button" className={tacticalMode === 'shot' ? 'active' : ''} onClick={() => { setTacticalMode('shot'); setSelectedTacticalPointId(''); }}>Tiri</button>
          <button type="button" className={tacticalMode === 'tackle' ? 'active' : ''} onClick={() => { setTacticalMode('tackle'); setSelectedTacticalPointId(''); }}>Tackle</button>
        </div></div>
      </section>
      {!allTacticalPoints.length && <section className="panel tablePanel tacticsEmpty"><div className="sectionTitle"><div><span className="eyebrow">SUPABASE</span><h2>Nessun dato tattico</h2></div><span>0 eventi</span></div><p>Appena le tabelle tattiche contengono coordinate valide, questa sezione popolerà automaticamente campo, mappe e zone.</p></section>}
      <section className="tacticsMaps">
        <TacticalPitch title="Posizione media" mode="average" points={filteredAveragePoints} selectedId={selectedTacticalPointId} onSelect={point => { setSelectedTacticalPointId(point.id); setTacticalMode(point.kind); }} />
        <TacticalPitch title="Shot map" mode="shot" points={filteredShotPoints} selectedId={selectedTacticalPointId} onSelect={point => { setSelectedTacticalPointId(point.id); setTacticalMode(point.kind); }} />
        <TacticalPitch title="Tackle map" mode="tackle" points={filteredTacklePoints} selectedId={selectedTacticalPointId} onSelect={point => { setSelectedTacticalPointId(point.id); setTacticalMode(point.kind); }} />
      </section>
      <section className="tacticsInfoGrid">
        <div className="panel tablePanel zonePanel">
          <div className="sectionTitle"><div><span className="eyebrow">ZONE</span><h2>Riepilogo zone</h2></div><span>{tacticalTitle}</span></div>
          <div className="zoneGroups">
            <div className="zoneGroup"><h3>Sinistra / centro / destra</h3>{tacticalZoneSummary.lanes.map(row => <div className="zoneRow" key={row.label}><div><span>{row.label}</span><strong>{int(row.value)}</strong></div><i><b style={{ width: `${row.percent}%` }} /></i><small>{fmt(row.percent, 0)}%</small></div>)}</div>
            <div className="zoneGroup"><h3>Terzi campo</h3>{tacticalZoneSummary.thirds.map(row => <div className="zoneRow" key={row.label}><div><span>{row.label}</span><strong>{int(row.value)}</strong></div><i><b style={{ width: `${row.percent}%` }} /></i><small>{fmt(row.percent, 0)}%</small></div>)}</div>
          </div>
        </div>
        <div className="panel tablePanel pointDetail">
          <div className="sectionTitle"><div><span className="eyebrow">DETTAGLIO</span><h2>Punto selezionato</h2></div><span>{selectedTacticalPoint ? tacticalKindLabel(selectedTacticalPoint.kind) : '—'}</span></div>
          {selectedTacticalPoint ? <div className="detailRows">
            <div><span>Giocatore</span><strong>{selectedTacticalPoint.playerName || selectedTacticalPoint.playerId || '—'}</strong></div>
            <div><span>Partita</span><strong>{opponentLabel(selectedTacticalPoint.match || '—')}</strong></div>
            <div><span>Evento</span><strong>{tacticalKindLabel(selectedTacticalPoint.kind)}</strong></div>
            <div><span>Minuto</span><strong>{selectedTacticalPoint.minute !== null ? `${int(selectedTacticalPoint.minute)}'` : '—'}</strong></div>
            <div><span>Esito</span><strong>{selectedTacticalPoint.outcome || '—'}</strong></div>
            <div><span>Zona laterale</span><strong>{selectedTacticalZone?.lane ?? '—'}</strong></div>
            <div><span>Terzo</span><strong>{selectedTacticalZone?.third ?? '—'}</strong></div>
            <div><span>Coordinate</span><strong>{fmt(selectedTacticalPoint.x, 1)} · {fmt(selectedTacticalPoint.y, 1)}</strong></div>
          </div> : <p className="detailEmpty">Seleziona un punto su una delle mappe.</p>}
        </div>
      </section>
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
