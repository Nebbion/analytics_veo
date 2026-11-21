import { applicableModel, seasonForMatch } from './draft';

// Resolve the current approved season on the server; never accept a client snapshot.
export async function playModel(db:any,matchId:string) {
  const match=await db.from('matches').select('*').eq('match_id',matchId).maybeSingle();
  if(match.error)throw new Error(match.error.message);
  if(!match.data)throw new Error('Partita non trovata in Analytics.');
  const season=seasonForMatch(match.data);
  if(!season)return null;
  const [models,settings]=await Promise.all([
    db.from('tactical_models').select('*,tactical_model_versions(*)'),
    db.from('tactical_season_settings').select('*').eq('season_label',season).maybeSingle(),
  ]);
  if(models.error||settings.error)throw new Error((models.error??settings.error).message);
  const version=applicableModel(models.data??[],season,settings.data?.model_id);
  return version?{...version,season_label:season}:null;
}
