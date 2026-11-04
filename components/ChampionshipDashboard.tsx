'use client';

import { useEffect, useState } from 'react';

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

type ChampionshipPlayerStat = {
  playerId: string;
  playerName: string;
  competition: 'CAMPIONATO' | 'COPPA';
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
};

type Standing = {
  position: number;
  team: string;
  points: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
};

type StandingsResponse = {
  competition: string;
  updatedAt: string;
  sourceUrl: string;
  rows: Standing[];
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

function LeagueStandings() {
  const [data, setData] = useState<StandingsResponse | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();

    fetch('/api/championship/standings', { signal: controller.signal })
      .then(async response => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Classifica non disponibile');
        return payload as StandingsResponse;
      })
      .then(setData)
      .catch(fetchError => {
        if (fetchError instanceof DOMException && fetchError.name === 'AbortError') return;
        setError(fetchError instanceof Error ? fetchError.message : 'Classifica non disponibile');
      });

    return () => controller.abort();
  }, []);

  return <section className="panel tablePanel leagueStandingsPanel">
    <div className="sectionTitle">
      <div><span className="eyebrow">CLASSIFICA AGGIORNATA</span><h2>{data?.competition ?? 'Prima Categoria - Girone E'}</h2></div>
      <a className="standingsSource" href={data?.sourceUrl ?? 'https://www.tuttocampo.it/Veneto/PrimaCategoria/GironeE/Classifica'} target="_blank" rel="noreferrer">Fonte Tuttocampo</a>
    </div>
    {data ? <>
      <div className="tableWrap"><table className="leagueStandingsTable">
        <thead><tr><th>#</th><th>Squadra</th><th>PT</th><th>G</th><th>V</th><th>N</th><th>P</th><th>GF</th><th>GS</th><th>DR</th></tr></thead>
        <tbody>{data.rows.map(row => <tr className={/villanovese/i.test(row.team) ? 'currentTeam' : ''} key={row.team}>
          <td>{row.position}</td><td>{row.team}</td><td><strong>{row.points}</strong></td><td>{row.played}</td><td>{row.wins}</td><td>{row.draws}</td><td>{row.losses}</td><td>{row.goalsFor}</td><td>{row.goalsAgainst}</td><td>{row.goalDifference > 0 ? '+' : ''}{row.goalDifference}</td>
        </tr>)}</tbody>
      </table></div>
      <p className="standingsUpdated">Dati recuperati il {new Date(data.updatedAt).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })}</p>
    </> : error
      ? <div className="standingsStatus"><strong>Classifica momentaneamente non disponibile.</strong><span>{error}</span></div>
      : <div className="standingsStatus"><strong>Caricamento classifica...</strong></div>}
  </section>;
}

function SeasonalRanking({ title, rows }: { title: string; rows: { name: string; value: number }[] }) {
  return <section className="panel tablePanel seasonalRankingPanel">
    <div className="sectionTitle"><div><span className="eyebrow">CAMPIONATO</span><h2>{title}</h2></div><span>totale</span></div>
    <div className="rankingList">{rows.length
      ? rows.slice(0, 8).map((row, index) => <div className="rankRow" key={row.name}><span className="rankNo">{index + 1}</span><strong>{row.name}</strong><span>{number(row.value)}</span></div>)
      : <p className="rankEmpty">Nessun dato disponibile.</p>}
    </div>
  </section>;
}

export function ChampionshipDashboard({ matches, playerStats }: { matches: ChampionshipMatch[]; playerStats: ChampionshipPlayerStat[] }) {
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
  const discipline = new Map<string, { name: string; yellowCards: number; redCards: number }>();

  playerStats
    .filter(stat => stat.competition === 'CAMPIONATO')
    .forEach(stat => {
      const key = stat.playerId || stat.playerName;
      if (!key) return;
      const current = discipline.get(key) ?? { name: stat.playerName || stat.playerId, yellowCards: 0, redCards: 0 };
      current.yellowCards += stat.yellowCards;
      current.redCards += stat.redCards;
      discipline.set(key, current);
    });

  const bookedPlayers = [...discipline.values()]
    .filter(player => player.yellowCards > 0)
    .sort((a, b) => b.yellowCards - a.yellowCards || a.name.localeCompare(b.name, 'it'));
  const sentOffPlayers = [...discipline.values()]
    .filter(player => player.redCards > 0)
    .sort((a, b) => b.redCards - a.redCards || a.name.localeCompare(b.name, 'it'));
  const production = new Map<string, { name: string; goals: number; assists: number }>();

  playerStats.filter(stat => stat.competition === 'CAMPIONATO').forEach(stat => {
    const key = stat.playerId || stat.playerName;
    if (!key) return;
    const current = production.get(key) ?? { name: stat.playerName || stat.playerId, goals: 0, assists: 0 };
    current.goals += stat.goals;
    current.assists += stat.assists;
    production.set(key, current);
  });

  const goalsRanking = [...production.values()]
    .filter(player => player.goals > 0)
    .sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name, 'it'))
    .map(player => ({ name: player.name, value: player.goals }));
  const assistsRanking = [...production.values()]
    .filter(player => player.assists > 0)
    .sort((a, b) => b.assists - a.assists || a.name.localeCompare(b.name, 'it'))
    .map(player => ({ name: player.name, value: player.assists }));

  return <>
    <LeagueStandings />

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

    <div className="homeProductionGrid">
      <SeasonalRanking title="Classifica gol" rows={goalsRanking} />
      <SeasonalRanking title="Classifica assist" rows={assistsRanking} />
    </div>

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

    <div className="homeDisciplineGrid">
      <section className="panel tablePanel homeDisciplinePanel">
        <div className="sectionTitle"><div><span className="eyebrow">DISCIPLINA</span><h2>Ammoniti</h2></div><span>{yellowCards} cartellini</span></div>
        <div className="homeDisciplineList">
          {bookedPlayers.length ? bookedPlayers.map((player, index) => <div className="homeDisciplineRow" key={player.name}>
            <span className="rankNo">{index + 1}</span><strong>{player.name}</strong><span className="disciplineCount yellowCount">{player.yellowCards}</span>
          </div>) : <p className="rankEmpty">Nessuna ammonizione in campionato.</p>}
        </div>
      </section>

      <section className="panel tablePanel homeDisciplinePanel">
        <div className="sectionTitle"><div><span className="eyebrow">DISCIPLINA</span><h2>Espulsi</h2></div><span>{redCards} cartellini</span></div>
        <div className="homeDisciplineList">
          {sentOffPlayers.length ? sentOffPlayers.map((player, index) => <div className="homeDisciplineRow" key={player.name}>
            <span className="rankNo">{index + 1}</span><strong>{player.name}</strong><span className="disciplineCount redCount">{player.redCards}</span>
          </div>) : <p className="rankEmpty">Nessuna espulsione in campionato.</p>}
        </div>
      </section>
    </div>
  </>;
}
