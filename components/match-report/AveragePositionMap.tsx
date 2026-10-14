import type { MatchReport } from '../../lib/match-report/types';
import { TacticalPitch } from './TacticalPitch';

export function AveragePositionMap({ report }: { report: MatchReport }) {
  return <TacticalPitch
    title="Posizione media"
    subtitle={`${report.averagePositions.length} posizioni`}
    points={report.averagePositions}
    variant="average"
  />;
}
