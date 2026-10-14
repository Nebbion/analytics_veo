import type { MatchReportPlayer, MatchReportTacticalPoint } from '../../lib/match-report/types';

export const fmtNumber = (value: number | null, digits = 0) =>
  value === null
    ? '—'
    : value.toLocaleString('it-IT', { maximumFractionDigits: digits, minimumFractionDigits: digits });

export const fmtDate = (date: string) =>
  date ? new Date(`${date}T12:00:00`).toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' }) : '—';

export const playerLabel = (player: Pick<MatchReportPlayer, 'name' | 'jerseyNumber'>) =>
  `${player.jerseyNumber !== null ? `#${player.jerseyNumber} ` : ''}${player.name || 'Giocatore'}`.trim();

export const pointLabel = (point: MatchReportTacticalPoint) => {
  const number = point.jerseyNumber !== null ? `#${point.jerseyNumber}` : '';
  if (number && point.playerName) return `${number} - ${point.playerName}`;
  return number || point.playerName || 'Giocatore';
};

export const metricUnit = (key: string) => {
  if (key === 'distanceKm') return 'km';
  if (key === 'maxSpeed' || key === 'averageSpeed') return 'km/h';
  if (key === 'passSuccess') return '%';
  return '';
};
