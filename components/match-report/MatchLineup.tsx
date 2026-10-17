import type { MatchReportLineupPlayer } from '../../lib/match-report/types';

function LineupGroup({ title, players }: { title: string; players: MatchReportLineupPlayer[] }) {
  return <div className="reportLineupGroup">
    <div className="reportLineupGroupTitle">
      <h3>{title}</h3>
      <span>{players.length || '—'}</span>
    </div>
    {players.length ? <div className="reportLineupGrid">
      {players.map(player => <div className="reportLineupPlayer" key={`${player.starter}-${player.playerId}`}>
        <span>{player.jerseyNumber !== null ? `#${player.jerseyNumber}` : '—'}</span>
        <strong>{player.playerName}</strong>
      </div>)}
    </div> : <p className="reportEmpty">Nessun dato disponibile.</p>}
  </div>;
}

export function MatchLineup({ lineup }: { lineup: MatchReportLineupPlayer[] }) {
  const starters = lineup.filter(player => player.starter);
  const bench = lineup.filter(player => !player.starter);

  return <section className="panel reportSection reportLineupSection">
    <div className="sectionTitle">
      <div><span className="eyebrow">YOUCOACH</span><h2>Formazione</h2></div>
      <span>{lineup.length ? `${starters.length} titolari · ${bench.length} riserve` : '—'}</span>
    </div>
    <div className="reportLineupSplit">
      <LineupGroup title="Primi 11" players={starters} />
      <LineupGroup title="Panchina" players={bench} />
    </div>
  </section>;
}
