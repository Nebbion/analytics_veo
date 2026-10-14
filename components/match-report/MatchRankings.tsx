import type { MatchReportMetricKey, MatchReportPlayer } from '../../lib/match-report/types';
import { fmtNumber, metricUnit, playerLabel } from './utils';

const rankingConfig: { key: MatchReportMetricKey; title: string; digits?: number }[] = [
  { key: 'distanceKm', title: 'Più distanza', digits: 1 },
  { key: 'sprints', title: 'Più sprint' },
  { key: 'highIntensityRuns', title: 'Più alta intensità' },
  { key: 'maxSpeed', title: 'Velocità massima', digits: 1 },
  { key: 'passes', title: 'Più passaggi' },
  { key: 'tackles', title: 'Più contrasti' },
  { key: 'shots', title: 'Più tiri' },
];

export function MatchRankings({ players }: { players: MatchReportPlayer[] }) {
  return <section className="reportRankings">
    {rankingConfig.map(config => {
      const rows = [...players]
        .filter(player => player[config.key] !== null)
        .sort((a, b) => (b[config.key] ?? 0) - (a[config.key] ?? 0))
        .slice(0, 5);

      return <div className="panel tablePanel reportRankingCard" key={config.key}>
        <div className="sectionTitle"><div><span className="eyebrow">TOP 5</span><h2>{config.title}</h2></div><span>{metricUnit(config.key)}</span></div>
        <div className="rankingList">
          {rows.length ? rows.map((player, index) => <div className="rankRow" key={`${config.key}-${player.playerId || player.name}`}>
            <span className="rankNo">{index + 1}</span>
            <strong>{playerLabel(player)}</strong>
            <span>{fmtNumber(player[config.key], config.digits ?? 0)}</span>
          </div>) : <div className="rankEmpty">Dato non disponibile.</div>}
        </div>
      </div>;
    })}
  </section>;
}
