import type { MatchReport } from '../../lib/match-report/types';
import { TacticalPitch } from './TacticalPitch';

export function TackleMap({ report }: { report: MatchReport }) {
  return <TacticalPitch
    title="Tackle map"
    subtitle={`${report.tackles.length} contrasti`}
    points={report.tackles}
    variant="tackle"
  />;
}
