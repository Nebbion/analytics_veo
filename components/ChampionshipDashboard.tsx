'use client';

type ChampionshipMatch = {
  matchId: string;
  date: string;
  match: string;
  competition: 'CAMPIONATO' | 'COPPA';
  result: string;
  teamGoals: number | null;
  opponentGoals: number | null;
  outcome: 'V' | 'N' | 'P' | null;
  summary: {
    yellowCards: number;
    redCards: number;
  } | null;
};

const number = (value: number) => value.toLocaleString('it-IT');

const dateLabel = (date: string) => date
  ? new Date(`${date}T12:00:00`).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })
  : '—';

const opponentLabel = (match: string) => {
  const namedScore = match.match(/^\s*(.+?)\s+(\d+)\s*[-–—]\s*(.+?)\s+(\d+)\s*$/);

  if (namedScore) {
    const firstTeam = namedScore[1].trim();
    const secondTeam = namedScore[3].trim();
    if (/villanovese/i.test(firstTeam)) return secondTeam;
    if (/villanovese/i.test(secondTeam)) return firstTeam;
  }

  const withoutScore = match
    .replace(/\b\d+\s*[-–—]\s*\d+\b/g, ' ')
    .replace(/\b\d+\s*[-–—]\s*/g, ' ')
    .replace(/\s*[-–—]\s*\d+\b/g, ' ');

  return withoutScore
    .replace(/A\.?S\.?D\.?\s+Villanovese|Villanovese/gi, '')
    .replace(/\s+\d+\s*$/g, '')
    .replace(/\s*(?:-|–|—|vs\.?)\s*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim() || match;
};

function Kpi({ label, value, accent = false }: { label: string; value: string | number; accent?: boolean }) {
  return <div className={`championshipKpi ${accent ? 'accent' : ''}`}><span>{label}</span><strong>{value}</strong></div>;
}

export function ChampionshipDashboard({ matches }: { matches: ChampionshipMatch[] }) {
  const championshipMatches = matches
    .filter(match => match.competition === 'CAMPIONATO' && match.outcome !== null)
    .sort((a, b) => a.date.localeCompare(b.date));

  const wins = championshipMatches.filter(match => match.outcome === 'V').length;
  const draws = championshipMatches.filter(match => match.outcome === 'N').length;
  const losses = championshipMatches.filter(match => match.outcome === 'P').length;
  const goalsFor = championshipMatches.reduce((total, match) => total + (match.teamGoals ?? 0), 0);
  const goalsAgainst = championshipMatches.reduce((total, match) => total + (match.opponentGoals ?? 0), 0);
  const yellowCards = championshipMatches.reduce((total, match) => total + (match.summary?.yellowCards ?? 0), 0);
  const redCards = championshipMatches.reduce((total, match) => total + (match.summary?.redCards ?? 0), 0);
  const points = wins * 3 + draws;
  const recentMatches = championshipMatches.slice(-5);
  const latestMatch = championshipMatches.at(-1);

  return <>
    <section className="hero championshipHero">
      <div><p className="eyebrow">CAMPIONATO 2026/2027</p><h1>Dashboard campionato</h1><p>Risultati, rendimento e disciplina della Villanovese.</p></div>
      <div className="heroMeta"><span>Punti</span><strong>{number(points)}</strong></div>
    </section>

    <section className="panel championshipOverview">
      <div className="sectionTitle"><div><span className="eyebrow">PANORAMICA</span><h2>Il campionato fin qui</h2></div><span>{championshipMatches.length} partite con risultato</span></div>
      <div className="championshipKpiGrid">
        <Kpi label="Partite" value={number(championshipMatches.length)} />
        <Kpi label="Vittorie" value={number(wins)} accent />
        <Kpi label="Pareggi" value={number(draws)} />
        <Kpi label="Sconfitte" value={number(losses)} />
        <Kpi label="Gol fatti" value={number(goalsFor)} accent />
        <Kpi label="Gol subiti" value={number(goalsAgainst)} />
        <Kpi label="Differenza reti" value={`${goalsFor - goalsAgainst > 0 ? '+' : ''}${number(goalsFor - goalsAgainst)}`} />
        <Kpi label="Ammonizioni" value={number(yellowCards)} />
        <Kpi label="Espulsioni" value={number(redCards)} />
        <Kpi label="Media punti" value={championshipMatches.length ? (points / championshipMatches.length).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'} />
      </div>
    </section>

    <div className="championshipHomeGrid">
      <section className="panel tablePanel championshipFormPanel">
        <div className="sectionTitle"><div><span className="eyebrow">FORMA</span><h2>Ultime cinque</h2></div><span>V · N · P</span></div>
        {recentMatches.length ? <div className="resultStreak">
          {recentMatches.map(match => <div className="resultStreakItem" key={match.matchId}>
            <span className={`resultBadge result${match.outcome}`}>{match.outcome}</span>
            <div><strong>{opponentLabel(match.match)}</strong><small>{dateLabel(match.date)} · {match.result}</small></div>
          </div>)}
        </div> : <p className="rankEmpty">Nessun risultato di campionato disponibile.</p>}
      </section>

      <section className="panel tablePanel latestChampionshipMatch">
        <div className="sectionTitle"><div><span className="eyebrow">ULTIMA GARA</span><h2>{latestMatch ? opponentLabel(latestMatch.match) : 'Nessun risultato'}</h2></div>{latestMatch && <span>{dateLabel(latestMatch.date)}</span>}</div>
        {latestMatch ? <>
          <div className="latestResult"><span className={`resultBadge result${latestMatch.outcome}`}>{latestMatch.outcome}</span><strong>{latestMatch.result}</strong></div>
          <a className="reportTableLink" href={`/matches/${encodeURIComponent(latestMatch.matchId)}`}>Apri report</a>
        </> : <p className="rankEmpty">Il riepilogo apparirà quando sarà disponibile un risultato.</p>}
      </section>
    </div>
  </>;
}
