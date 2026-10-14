import type { ZoneDistribution as ZoneDistributionType } from '../../lib/match-report/types';
import { fmtNumber } from './utils';

function ZoneGroup({ title, rows }: { title: string; rows: ZoneDistributionType['vertical'] }) {
  return <div className="reportZoneGroup">
    <h3>{title}</h3>
    {rows.map(row => <div className="zoneRow reportZoneRow" key={row.label}>
      <div><span>{row.label}</span><strong>{row.count}</strong></div>
      <i><b style={{ width: `${row.percent}%` }} /></i>
      <small>{fmtNumber(row.percent, 0)}%</small>
    </div>)}
  </div>;
}

export function ZoneDistribution({ distribution }: { distribution: ZoneDistributionType }) {
  return <section className="panel reportSection">
    <div className="sectionTitle"><div><span className="eyebrow">ZONE</span><h2>Distribuzione zone</h2></div><span>{distribution.sourceLabel}</span></div>
    <div className="reportZoneGrid">
      <ZoneGroup title="Terzi campo" rows={distribution.vertical} />
      <ZoneGroup title="Corsie laterali" rows={distribution.horizontal} />
    </div>
  </section>;
}
