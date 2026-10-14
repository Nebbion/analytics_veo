import type { MatchReport } from '../../lib/match-report/types';
import { fmtNumber } from './utils';

const overviewLabels: { key: keyof MatchReport['overview']; label: string; digits?: number; suffix?: string }[] = [
  { key: 'goals', label: 'Gol' },
  { key: 'shots', label: 'Tiri' },
  { key: 'totalShots', label: 'Tiri totali' },
  { key: 'passes', label: 'Passaggi' },
  { key: 'completedPasses', label: 'Passaggi completati' },
  { key: 'passSuccess', label: 'Precisione passaggi', digits: 1, suffix: '%' },
  { key: 'distanceKm', label: 'Distanza totale', digits: 1, suffix: ' km' },
  { key: 'sprints', label: 'Sprint' },
  { key: 'highIntensityRuns', label: 'Alta intensità' },
  { key: 'maxSpeed', label: 'Velocità massima', digits: 1, suffix: ' km/h' },
  { key: 'tackles', label: 'Contrasti' },
  { key: 'fouls', label: 'Falli' },
];

export function MatchOverview({ report }: { report: MatchReport }) {
  const metrics = overviewLabels.filter(item => report.overview[item.key] !== null);

  return <section className="panel reportSection">
    <div className="sectionTitle"><div><span className="eyebrow">OVERVIEW</span><h2>Match overview</h2></div><span>{metrics.length} KPI</span></div>
    <div className="reportKpiGrid">
      {metrics.length ? metrics.map(item => <div className="reportKpi" key={item.key}>
        <span>{item.label}</span>
        <strong>{fmtNumber(report.overview[item.key], item.digits ?? 0)}{report.overview[item.key] !== null ? item.suffix ?? '' : ''}</strong>
      </div>) : <p className="reportEmpty">Nessun KPI disponibile per questa partita.</p>}
    </div>
  </section>;
}
