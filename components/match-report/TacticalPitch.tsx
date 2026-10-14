import type { MatchReportTacticalPoint } from '../../lib/match-report/types';
import { pointLabel } from './utils';

export function TacticalPitch({
  title,
  subtitle,
  points,
  variant,
}: {
  title: string;
  subtitle: string;
  points: MatchReportTacticalPoint[];
  variant: 'average' | 'shot' | 'tackle';
}) {
  return <section className="panel reportPitchPanel">
    <div className="sectionTitle"><div><span className="eyebrow">TACTICAL FIELD</span><h2>{title}</h2></div><span>{subtitle}</span></div>
    <div className="reportPitchWrap">
      <svg viewBox="0 0 100 68" role="img" aria-label={title} className="footballPitch reportPitch">
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
        {points.map(point => {
          const pitchY = point.y * 0.68;
          const label = pointLabel(point);
          const isGoal = point.kind === 'goal';

          return <g key={point.id} className={`reportTacticalPoint ${variant} ${isGoal ? 'goal' : ''}`}>
            <circle cx={point.x} cy={pitchY} r={variant === 'average' ? 2.6 : isGoal ? 2.5 : 2} />
            {variant === 'average' && <text x={point.x} y={pitchY + 0.9} textAnchor="middle">{point.jerseyNumber ?? '?'}</text>}
            <title>{label}{point.minute !== null ? ` · ${point.minute}'` : ''}{point.eventType ? ` · ${point.eventType}` : ''}</title>
          </g>;
        })}
      </svg>
      {!points.length && <div className="pitchEmpty">Nessun dato disponibile.</div>}
    </div>
  </section>;
}
