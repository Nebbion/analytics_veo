import type { MatchReportLineupPlayer, MatchReportSubstitution } from '../../lib/match-report/types';

const playerLabel = (
  playerId: string,
  playerName: string,
  jerseyByPlayerId: Map<string, number | null>
) => {
  const number = jerseyByPlayerId.get(playerId);
  return `${number !== undefined && number !== null ? `#${number} ` : ''}${playerName || playerId || 'Giocatore'}`;
};

export function MatchSubstitutions({
  substitutions,
  lineup,
}: {
  substitutions: MatchReportSubstitution[];
  lineup: MatchReportLineupPlayer[];
}) {
  const jerseyByPlayerId = new Map(lineup.map(player => [player.playerId, player.jerseyNumber]));

  return <section className="panel reportSection reportSubstitutionsSection">
    <div className="sectionTitle">
      <div><span className="eyebrow">YOUCOACH</span><h2>Sostituzioni</h2></div>
      <span>{substitutions.length || '—'}</span>
    </div>
    {substitutions.length ? <div className="reportSubstitutions">
      {substitutions.map((substitution, index) => <div className="reportSubstitution" key={`${substitution.minute}-${substitution.playerOutId}-${substitution.playerInId}-${index}`}>
        <div className="reportSubstitutionMinute">
          <strong>{substitution.minute}&apos;</strong>
          {substitution.injuryTime ? <span>recupero</span> : null}
        </div>
        <div className="reportSubstitutionPlayers">
          <span className="reportPlayerOut">{playerLabel(substitution.playerOutId, substitution.playerOutName, jerseyByPlayerId)}</span>
          <b aria-hidden="true">→</b>
          <span className="reportPlayerIn">{playerLabel(substitution.playerInId, substitution.playerInName, jerseyByPlayerId)}</span>
        </div>
      </div>)}
    </div> : <p className="reportEmpty">Nessuna sostituzione disponibile per questa partita.</p>}
  </section>;
}
