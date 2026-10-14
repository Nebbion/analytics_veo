import { fmtNumber } from './utils';

export type MatchBar = {
  label: string;
  value: number | null;
  secondaryValue?: number | null;
};

export function MatchBarChart({
  title,
  unit,
  bars,
  secondaryLabel,
}: {
  title: string;
  unit: string;
  bars: MatchBar[];
  secondaryLabel?: string;
}) {
  const visibleBars = bars.filter(bar => bar.value !== null || bar.secondaryValue !== null);
  const max = Math.max(...visibleBars.flatMap(bar => [bar.value ?? 0, bar.secondaryValue ?? 0]), 1);
  const width = 760;
  const rowHeight = 34;
  const top = 24;
  const left = 170;
  const barWidth = width - left - 84;
  const height = Math.max(120, top + visibleBars.length * rowHeight + 18);

  return <section className="panel reportChart">
    <div className="chartHead"><span>{title}</span><small>{secondaryLabel ? `${unit} · ${secondaryLabel}` : unit}</small></div>
    {visibleBars.length ? <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title} className="reportBarSvg">
      {visibleBars.map((bar, index) => {
        const y = top + index * rowHeight;
        const primaryWidth = ((bar.value ?? 0) / max) * barWidth;
        const secondaryWidth = ((bar.secondaryValue ?? 0) / max) * barWidth;

        return <g key={`${bar.label}-${index}`}>
          <text x="0" y={y + 13} className="reportBarLabel">{bar.label}</text>
          {bar.secondaryValue !== undefined && <rect x={left} y={y + 13} width={secondaryWidth} height="8" rx="4" className="reportBarSecondary" />}
          <rect x={left} y={y} width={primaryWidth} height="12" rx="5" className="reportBarPrimary" />
          <text x={left + barWidth + 12} y={y + 12} className="reportBarValue">{fmtNumber(bar.value, unit === 'km' || unit === 'km/h' ? 1 : 0)}</text>
          {bar.secondaryValue !== undefined && <text x={left + barWidth + 12} y={y + 24} className="reportBarValue secondary">{fmtNumber(bar.secondaryValue, 0)}</text>}
        </g>;
      })}
    </svg> : <p className="reportEmpty">Nessun dato disponibile.</p>}
  </section>;
}
