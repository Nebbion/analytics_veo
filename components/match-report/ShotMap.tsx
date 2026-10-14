import type { MatchReport } from '../../lib/match-report/types';
import { TacticalPitch } from './TacticalPitch';

export function ShotMap({ report }: { report: MatchReport }) {
  const goals = report.shots.filter(point => point.kind === 'goal').length;

  return <TacticalPitch
    title="Shot map"
    subtitle={`${report.shots.length} tiri · ${goals} gol`}
    points={report.shots}
    variant="shot"
  />;
}
