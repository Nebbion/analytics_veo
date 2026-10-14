import { MatchReportClient } from '../../../../components/match-report/MatchReportClient';

export default async function MatchReportPrintPage({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  return <MatchReportClient matchId={decodeURIComponent(matchId)} printMode />;
}
