import { redirect } from 'next/navigation';
import { createClient } from '../../lib/supabase/server';
import { ViceallenatoreDashboard } from '../../components/ViceallenatoreDashboard';

export const dynamic = 'force-dynamic';

export default async function ViceallenatorePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('utenti').select('ruolo,attivo').eq('id', user.id).maybeSingle();
  if (!profile?.attivo || profile.ruolo !== 'STAFF') {
    return <main className="page"><section className="panel tablePanel"><h1>Analisi tattica</h1><p>Accesso riservato allo staff attivo.</p><a href="/">Torna alla dashboard</a></section></main>;
  }
  const { data: matches, error } = await supabase.from('matches').select('match_id,data,partita').order('data', { ascending: false }).limit(200);
  return <ViceallenatoreDashboard matches={matches ?? []} matchError={error?.message ?? null} />;
}
