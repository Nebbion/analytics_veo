'use client';

import { useEffect, useState } from 'react';
import type { MatchReport } from '../../lib/match-report/types';
import { MatchReportHeader } from './MatchReportHeader';
import { MatchReportView } from './MatchReportView';

export function MatchReportClient({ matchId, printMode = false }: { matchId: string; printMode?: boolean }) {
  const [report, setReport] = useState<MatchReport | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setReport(null);
    setError('');
    fetch(`/api/matches/${encodeURIComponent(matchId)}/report`, { cache: 'no-store' })
      .then(async response => {
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || 'Errore report partita');
        return json as MatchReport;
      })
      .then(setReport)
      .catch(error => setError(error.message));
  }, [matchId]);

  if (error) {
    return <main className="page reportPage"><div className="panel error"><h1>Match Report</h1><p>{error}</p></div></main>;
  }

  if (!report) {
    return <main className="page reportPage"><div className="loading">Caricamento match report…</div></main>;
  }

  return <main className={`page reportPage ${printMode ? 'reportPrintMode' : ''}`}>
    <MatchReportHeader report={report} printMode={printMode} onPrint={() => window.print()} />
    <MatchReportView report={report} />
    <footer className="reportFooter">
      <span>ASD Villanovese</span>
      <span>{report.match.match}</span>
      <span>{new Date(report.generatedAt).toLocaleDateString('it-IT')}</span>
    </footer>
  </main>;
}
