import type { MatchReport } from '../../lib/match-report/types';
import { AveragePositionMap } from './AveragePositionMap';
import { MatchBarChart } from './MatchBarChart';
import { MatchOfficialEvents } from './MatchOfficialEvents';
import { MatchOverview } from './MatchOverview';
import { MatchRankings } from './MatchRankings';
import { MatchLineup } from './MatchLineup';
import { MatchSubstitutions } from './MatchSubstitutions';
import { PlayerMatchTable } from './PlayerMatchTable';
import { ShotMap } from './ShotMap';
import { TackleMap } from './TackleMap';
import { playerLabel } from './utils';
import { ZoneDistribution } from './ZoneDistribution';

export function MatchReportView({ report }: { report: MatchReport }) {
  const chartPlayers = report.players.map(player => ({
    label: playerLabel(player),
    player,
  }));

  return <>
    <MatchOverview report={report} />
    <section className="reportMatchPeople">
      <MatchLineup lineup={report.lineup} />
      <MatchSubstitutions substitutions={report.substitutions} lineup={report.lineup} />
    </section>
    <section className="reportChartsGrid">
      <MatchBarChart title="Distanza per giocatore" unit="km" bars={chartPlayers.map(({ label, player }) => ({ label, value: player.distanceKm }))} />
      <MatchBarChart title="Sprint per giocatore" unit="sprint" bars={chartPlayers.map(({ label, player }) => ({ label, value: player.sprints }))} />
      <MatchBarChart title="Corse alta intensità" unit="corse" bars={chartPlayers.map(({ label, player }) => ({ label, value: player.highIntensityRuns }))} />
      <MatchBarChart title="Passaggi / completati" unit="passaggi" secondaryLabel="completati" bars={chartPlayers.map(({ label, player }) => ({ label, value: player.passes, secondaryValue: player.completedPasses }))} />
      <MatchBarChart title="Velocità massima" unit="km/h" bars={chartPlayers.map(({ label, player }) => ({ label, value: player.maxSpeed }))} />
    </section>
    <section className="reportMapsGrid">
      <AveragePositionMap report={report} />
      <ShotMap report={report} />
      <TackleMap report={report} />
    </section>
    <section className="reportZoneSplit">
      <ZoneDistribution distribution={report.zoneDistributions.averagePositions} />
      <ZoneDistribution distribution={report.zoneDistributions.events} />
    </section>
    <PlayerMatchTable players={report.players} />
    <MatchRankings players={report.players} />
    <MatchOfficialEvents events={report.officialEvents} />
    <section className="panel reportSection reportNotes">
      <div className="sectionTitle"><div><span className="eyebrow">NOTE</span><h2>Dati e copertura</h2></div><span>no dati inventati</span></div>
      <ul>{report.notes.map(note => <li key={note}>{note}</li>)}</ul>
    </section>
  </>;
}
