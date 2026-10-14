export type Competition = 'CAMPIONATO' | 'COPPA';

export type MatchReportMetricKey =
  | 'goals'
  | 'shots'
  | 'totalShots'
  | 'passes'
  | 'completedPasses'
  | 'passSuccess'
  | 'distanceKm'
  | 'sprints'
  | 'highIntensityRuns'
  | 'averageSpeed'
  | 'maxSpeed'
  | 'tackles'
  | 'fouls'
  | 'goalInvolvements';

export type MatchReportPlayer = {
  playerId: string;
  name: string;
  jerseyNumber: number | null;
  minutes: number | null;
  goals: number | null;
  assists: number | null;
  yellowCards: number | null;
  redCards: number | null;
  shots: number | null;
  totalShots: number | null;
  passes: number | null;
  completedPasses: number | null;
  passSuccess: number | null;
  distanceKm: number | null;
  sprints: number | null;
  highIntensityRuns: number | null;
  averageSpeed: number | null;
  maxSpeed: number | null;
  tackles: number | null;
  fouls: number | null;
  goalInvolvements: number | null;
};

export type MatchReportTacticalPoint = {
  id: string;
  source: 'veo_position_stats' | 'veo_event_positions';
  kind: 'average' | 'shot' | 'goal' | 'tackle' | 'event';
  playerId: string;
  playerName: string;
  jerseyNumber: number | null;
  x: number;
  y: number;
  minute: number | null;
  eventType: string;
};

export type ZoneRow = {
  label: string;
  count: number;
  percent: number;
};

export type ZoneDistribution = {
  sourceLabel: string;
  total: number;
  vertical: ZoneRow[];
  horizontal: ZoneRow[];
};

export type MatchReportEvent = {
  type: 'goal' | 'assist' | 'yellowCard' | 'redCard';
  label: string;
  playerName: string;
  playerId: string;
  jerseyNumber: number | null;
  minute: number | null;
  value: number;
};

export type MatchReport = {
  match: {
    matchId: string;
    date: string;
    match: string;
    competition: Competition;
    result: string;
    homeAway: string;
  };
  overview: Record<MatchReportMetricKey, number | null>;
  players: MatchReportPlayer[];
  averagePositions: MatchReportTacticalPoint[];
  shots: MatchReportTacticalPoint[];
  tackles: MatchReportTacticalPoint[];
  zoneDistributions: {
    averagePositions: ZoneDistribution;
    events: ZoneDistribution;
  };
  officialEvents: MatchReportEvent[];
  notes: string[];
  generatedAt: string;
};
