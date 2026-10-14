import { MatchReportClient } from '../../../components/match-report/MatchReportClient';

export default async function MatchReportPage({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  return <MatchReportClient matchId={decodeURIComponent(matchId)} />;
}
