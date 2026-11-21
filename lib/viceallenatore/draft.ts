// Deterministic, source-bound draft. No video inference or external LLM calls.
export type Row = Record<string, any>;
export type DraftItem = {
  key: string; evidence_key: string; type: 'osservazione' | 'interpretazione' | 'ipotesi';
  text: string; sources: string[]; requires_review: boolean; important: boolean;
  options?: { value: string; label: string }[];
};
export type DraftInput = {
  match: Row; players: Row[]; stats: Row[]; lineups: Row[]; officialEvents: Row[];
  sources: Row[]; reconciliations: Row[]; modelVersion?: Row | null; memory?: Row[];
};
export function canonicalSeason(value: string) {
  const found=/^(\d{4})\s*[\/-]\s*(\d{2}|\d{4})$/.exec(value.trim());
  return found ? `${found[1]}/${found[2].length===2?found[1].slice(0,2)+found[2]:found[2]}` : value;
}
export function seasonForMatch(match: Row) {
  const explicit = match.stagione || match.season_label;
  if (explicit) return canonicalSeason(String(explicit));
  const date = String(match.data ?? '');
  let y: number, m: number;
  if (/^\d{4}-\d{2}/.test(date)) { y = Number(date.slice(0,4)); m = Number(date.slice(5,7)); }
  else if (/^\d{2}\/\d{2}\/\d{4}/.test(date)) { y = Number(date.slice(6,10)); m = Number(date.slice(3,5)); }
  else return null;
  const start = m >= 7 ? y : y - 1;
  return `${start}/${start + 1}`;
}
export function applicableModel(models: Row[], season: string | null, modelId?: string | null) {
  const eligible = models.filter(m => canonicalSeason(m.season_label) === season && (!modelId || m.id === modelId));
  // Multiple models require a one-time seasonal selection, never a random choice.
  if (eligible.length !== 1) return null;
  return [...(eligible[0].tactical_model_versions ?? [])].filter(v => v.status === 'approved')
    .sort((a,b) => b.version - a.version)[0] ?? null;
}
export function missingInputs(input: DraftInput) {
  const has = (provider: string) => input.sources.some(s => s.provider === provider && s.kind === 'mhtml' && s.review_status !== 'rejected');
  return [
    { key:'youcoach', label:'Report YouCoach', missing:!input.officialEvents.length && !input.lineups.length && !has('youcoach'), optional:true },
    { key:'veo', label:'Report Veo', missing:!input.stats.length && !has('veo'), optional:true },
  ].filter(x => x.missing);
}
export function generateDraft(input: DraftInput): DraftItem[] {
  const items: DraftItem[] = [];
  const add = (key: string, type: DraftItem['type'], text: string, refs: unknown[], requires_review = false, important = false, options?: DraftItem['options']) => {
    const sources = refs.map(String);
    items.push({key, type, text, sources, evidence_key:JSON.stringify([text,sources]),requires_review,important,...(options ? {options} : {})});
  };
  const {match, sources, modelVersion} = input;
  add('match','osservazione',`${match.partita} · ${match.data ?? 'data non disponibile'}${match.risultato ? ` · risultato registrato ${match.risultato}` : ''}`, [`matches:${match.match_id}`]);
  if (input.lineups.length) add('lineup','osservazione',`${input.lineups.length} giocatori nella distinta Analytics, ${input.lineups.filter(p => p.titolare).length} indicati come titolari.`,[`match_lineups:${match.match_id}`]);
  // Only actual numeric rows are summed; missing is never replaced by zero.
  for (const [field,label] of [['tiri_totali','tiri totali'],['passaggi','passaggi'],['passaggi_completati','passaggi completati']] as const) {
    const observed = input.stats.filter(r => r[field] !== null && r[field] !== undefined && r[field] !== '' && Number.isFinite(Number(r[field])));
    if (observed.length) add(`stat:${field}`,'osservazione',`${label}: ${observed.reduce((n,r) => n+Number(r[field]),0)} nelle ${observed.length}/${input.stats.length} righe giocatore disponibili; somma parziale se mancano valori.`,[`player_match_stats:${match.match_id}:${field}`]);
  }
  input.officialEvents.forEach((e,i) => {
    const p = input.players.find(p => p.player_id === e.player_id);
    add(`official:${e.id ?? `${e.event_type}:${e.minuto}:${e.player_id ?? e.player_name}:${i}`}`,'osservazione',
      `${e.event_type} · ${e.minuto ?? '?'}′${e.recupero ? ' (recupero)' : ''} · ${p?.nome ?? e.player_name ?? 'giocatore non identificato'} (registrato in Analytics).`,
      [`match_events:${e.id ?? `${match.match_id}:${e.event_type}:${e.minuto}:${e.player_id ?? e.player_name}`}`]);
  });
  const reports = sources.filter(s => s.kind === 'mhtml' && s.review_status !== 'rejected');
  for (const source of reports) {
    const meta = source.extracted_metadata ?? source.metadata ?? {};
    const ref = `${source.id}:${source.sha256}:extractor-${meta.extractor_version ?? 1}`;
    for (const k of meta.kpi_candidates ?? []) add(`kpi:${source.id}:${k.metric}`,'osservazione',`${source.provider}: «${k.metric}» ${k.first_value} / ${k.second_value}, nell'ordine delle colonne del report; attribuzione e periodo non verificati.`,[ref]);
    const shots=(meta.kpi_candidates ?? []).find((k:Row)=>k.metric==='Tiri totali');
    if(shots && /^\d+$/.test(shots.first_value) && /^\d+$/.test(shots.second_value)) {
      const difference=Number(shots.first_value)-Number(shots.second_value);
      add(`interpretation:shots:${source.id}`,'interpretazione',`Il report registra ${Math.abs(difference)} tiri di differenza ${difference===0?'tra le colonne':difference>0?'a favore della prima colonna':'a favore della seconda colonna'}. È un confronto del volume registrato: non dimostra da solo qualità delle occasioni o superiorità tattica.`,[ref]);
    }
    // Official events already present: do not ask the coach to re-enter the chronology.
    if (!input.officialEvents.length) for (const [i,e] of (meta.timeline_candidates ?? meta.goal_candidates ?? []).entries()) {
      add(`report-event:${source.id}:${i}`,'osservazione',`${source.provider}: ${e.minute}′${e.stoppage ? `+${e.stoppage}` : ''} · ${e.excerpt} (documentato nel report; identità e tempo video non verificati).`,[ref]);
    }
  }
  const goal = (provider: string) => reports.filter(s => s.provider === provider).map(s => ({s, goals:[...(s.extracted_metadata ?? s.metadata ?? {}).goal_candidates ?? []].sort((a,b) => (a.minute+a.stoppage)-(b.minute+b.stoppage))})).filter(x => x.goals.length);
  const va = goal('veo'), ya = goal('youcoach');
  // Multiple reports from the same provider are ambiguous and require source selection.
  if (va.length > 1 || ya.length > 1) add('reports:multiple','ipotesi','Sono presenti più report della stessa fonte: verificare quale descrive la gara completa prima di consolidare i minuti.',reports.map(s=>`${s.id}:${s.sha256}`),true,true);
  else if (va.length && ya.length && va[0].goals[0].minute !== ya[0].goals[0].minute) {
    const a=va[0], b=ya[0], av=String(a.goals[0].minute), bv=String(b.goals[0].minute);
    const decision = [...input.reconciliations].reverse().find(r => r.field_name === 'first_goal_minute' && r.status === 'approved' && r.source_a_id === a.s.id && r.source_b_id === b.s.id && r.value_a === av && r.value_b === bv);
    add('conflict:first_goal','osservazione',decision ? `Primo gol: ${decision.approved_value}′ consolidato dallo staff. Veo conserva ${av}′, YouCoach ${bv}′. Motivo: ${decision.reason ?? 'non indicato'}.` : `Primo gol: Veo ${av}′, YouCoach ${bv}′. Il minuto gara resta da consolidare.`,[`${a.s.id}:${a.s.sha256}:${av}`,`${b.s.id}:${b.s.sha256}:${bv}`],!decision,false,decision ? undefined : [{value:av,label:`${av}′ · Veo`},{value:bv,label:`${bv}′ · YouCoach`}]);
  }
  if (modelVersion) add('model','osservazione',`Modello stagionale approvato v${modelVersion.version}: ${(modelVersion.snapshot?.principles ?? []).map((p:Row) => p.expected_behavior || p.title).join('; ') || modelVersion.snapshot?.description || 'principi configurati'}.`,[`tactical_model_versions:${modelVersion.id}:${modelVersion.snapshot_sha256}`]);
  // Transparent interpretation: aggregate statistics alone cannot establish a tactical cause.
  if (input.stats.length || reports.some(s => (s.extracted_metadata ?? s.metadata)?.kpi_candidates?.length)) {
    add('interpretation:limits','interpretazione','I numeri disponibili descrivono il volume delle azioni registrate; da soli non permettono di stabilire la qualità dell’organizzazione o le cause del risultato.',[...input.stats.length ? [`player_match_stats:${match.match_id}`] : [],...reports.map(s=>`${s.id}:${s.sha256}`)]);
    if (modelVersion) add('hypothesis:plan','ipotesi','Verificare su episodi osservabili se i comportamenti del modello stagionale sono stati applicati nelle condizioni previste. I report aggregati non consentono ancora di confermarlo.',[`tactical_model_versions:${modelVersion.id}`, ...reports.map(s=>`${s.id}:${s.sha256}`)],true,true);
  }
  return items;
}
export function latestReview(item: DraftItem, reviews: Row[]) {
  return reviews.filter(r => r.item_key === item.key && r.evidence_key === item.evidence_key)
    .sort((a,b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
}
export function draftFingerprint(input: DraftInput) {
  // Deterministic serialization; timestamps unrelated to evidence are excluded by callers.
  return JSON.stringify({pipeline:'draft-rules-1',match:input.match,players:input.players,stats:input.stats,lineups:input.lineups,events:input.officialEvents,sources:input.sources,model:input.modelVersion,reconciliations:input.reconciliations});
}
