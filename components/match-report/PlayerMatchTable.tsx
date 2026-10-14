import type { MatchReportPlayer } from '../../lib/match-report/types';
import { fmtNumber } from './utils';

export function PlayerMatchTable({ players }: { players: MatchReportPlayer[] }) {
  return <section className="panel tablePanel reportTablePanel">
    <div className="sectionTitle"><div><span className="eyebrow">PLAYER STATS</span><h2>Statistiche individuali</h2></div><span>{players.length} giocatori</span></div>
    <div className="tableWrap">
      <table className="reportPlayerTable">
        <thead>
          <tr>
            <th>Numero</th><th>Giocatore</th><th>Minuti</th><th>Gol</th><th>Assist</th><th>Amm.</th><th>Esp.</th>
            <th>Tiri</th><th>Tiri tot.</th><th>Passaggi</th><th>Compl.</th><th>Pass %</th><th>Distanza</th>
            <th>Sprint</th><th>Alta int.</th><th>V. media</th><th>V. max</th><th>Contrasti</th><th>Falli</th><th>Coinv. gol</th>
          </tr>
        </thead>
        <tbody>
          {players.map(player => <tr key={player.playerId || `${player.name}-${player.jerseyNumber ?? 'no-number'}`}>
            <td>{player.jerseyNumber ?? '—'}</td>
            <td><strong>{player.name}</strong></td>
            <td>{fmtNumber(player.minutes)}</td>
            <td>{fmtNumber(player.goals)}</td>
            <td>{fmtNumber(player.assists)}</td>
            <td>{fmtNumber(player.yellowCards)}</td>
            <td>{fmtNumber(player.redCards)}</td>
            <td>{fmtNumber(player.shots)}</td>
            <td>{fmtNumber(player.totalShots)}</td>
            <td>{fmtNumber(player.passes)}</td>
            <td>{fmtNumber(player.completedPasses)}</td>
            <td>{player.passSuccess !== null ? `${fmtNumber(player.passSuccess, 1)}%` : '—'}</td>
            <td>{player.distanceKm !== null ? `${fmtNumber(player.distanceKm, 1)} km` : '—'}</td>
            <td>{fmtNumber(player.sprints)}</td>
            <td>{fmtNumber(player.highIntensityRuns)}</td>
            <td>{player.averageSpeed !== null ? `${fmtNumber(player.averageSpeed, 1)} km/h` : '—'}</td>
            <td>{player.maxSpeed !== null ? `${fmtNumber(player.maxSpeed, 1)} km/h` : '—'}</td>
            <td>{fmtNumber(player.tackles)}</td>
            <td>{fmtNumber(player.fouls)}</td>
            <td>{fmtNumber(player.goalInvolvements)}</td>
          </tr>)}
        </tbody>
      </table>
    </div>
  </section>;
}
