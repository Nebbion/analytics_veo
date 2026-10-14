import Link from 'next/link';
import type { MatchReport } from '../../lib/match-report/types';
import { fmtDate } from './utils';

export function MatchReportHeader({
  report,
  printMode,
  onPrint,
}: {
  report: MatchReport;
  printMode?: boolean;
  onPrint?: () => void;
}) {
  return <header className="reportHeader">
    <div className="reportTopline">
      <Link href="/" className="reportBack">← Torna alla dashboard</Link>
      <div className="reportActions">
        {printMode
          ? <button type="button" onClick={onPrint}>Salva / Stampa PDF</button>
          : <Link href={`/matches/${encodeURIComponent(report.match.matchId)}/print`}>Esporta PDF</Link>}
      </div>
    </div>
    <div className="reportHero panel">
      <div>
        <span className="eyebrow">MATCH REPORT</span>
        <h1>{report.match.match}</h1>
        <p>{report.match.competition === 'COPPA' ? 'Coppa' : 'Campionato'} · {fmtDate(report.match.date)}{report.match.homeAway ? ` · ${report.match.homeAway}` : ''}</p>
      </div>
      <div className="reportScore">
        <span>Risultato</span>
        <strong>{report.match.result || '—'}</strong>
      </div>
    </div>
  </header>;
}
