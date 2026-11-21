import type { SupabaseClient } from '@supabase/supabase-js';
import eventContract from '../../docs/viceallenatore/event-contract.json';
import type { Row } from './draft';
const text = (value: unknown) => String(value ?? '');
function check(error: {message: string} | null) { if (error) throw new Error(error.message); }
function validateEvent(event: Row, matchId: string) {
  if (event.schema_version !== eventContract.properties.schema_version.const || event.match_id !== matchId || eventContract.required.some(key => !(key in event))) throw new Error('Evento fuori contratto o partita errata.');
  if (!/^[0-9a-f-]{36}$/i.test(text(event.event_id)) || !Array.isArray(event.source_refs) || event.source_refs.length < eventContract.properties.source_refs.minItems || !Array.isArray(event.claims) || event.claims.length < eventContract.properties.claims.minItems) throw new Error('ID o evidenze evento non validi.');
  if (!eventContract.properties.observability.enum.includes(event.observability) || !eventContract.properties.relevance.enum.includes(event.relevance) || !eventContract.properties.period.enum.includes(event.period) || !eventContract.properties.phase.enum.includes(event.phase)) throw new Error('Classificazione evento non valida.');
  if (event.video_start_ms !== null && (!Number.isInteger(event.video_start_ms) || !Number.isInteger(event.video_end_ms) || event.video_start_ms < 0 || event.video_end_ms < event.video_start_ms)) throw new Error('Intervallo evento non valido.');
  if (event.claims.some((c: Row) => !eventContract.properties.claims.items.properties.type.enum.includes(c.type))) throw new Error('Tipo di affermazione non valido.');
}

function eventToRow(event: Row, actor: string) {
  return { id:event.event_id, match_id:event.match_id, event_schema_version:event.schema_version, analysis_pipeline_version:event.analysis_pipeline_version ?? 'manual-1', source_id:event.source_refs[0]?.source_id ?? null, video_start_ms:event.video_start_ms, video_end_ms:event.video_end_ms, game_minute:event.game_clock?.minute ?? null, game_stoppage:event.game_clock?.stoppage ?? null, clock_mapping_verified:Boolean(event.game_clock?.mapping_verified), period:event.period, event_type:event.event_type, phase:event.phase, zone:event.zone ?? null, player_id:event.player_ids?.[0] ?? null, observability:event.observability, relevance:event.relevance, description:event.claims[0]?.text ?? 'Evento senza descrizione', created_by:actor };
}

export async function importTacticalBundle(bundle: Row, supabase: SupabaseClient, actor: string, matchId: string, _sources: Row[], _events: Row[]) {
  if (bundle.schema_version !== '1.0.0' || bundle.match_id !== matchId || !Array.isArray(bundle.sources) || !Array.isArray(bundle.events)) throw new Error('Versione o partita del bundle non corrispondente.');
  for (const event of bundle.events) validateEvent(event, matchId);
  for (const source of bundle.sources) if (source.local_path || source.path || source.match_id !== matchId || !/^[a-f0-9]{64}$/.test(text(source.sha256))) throw new Error('Fonte non valida.');
  const knownSources = await supabase.from('analysis_sources').select('*').eq('match_id',matchId); check(knownSources.error);
  const knownEvents = await supabase.from('match_tactical_events').select('*').eq('match_id',matchId); check(knownEvents.error);
  const sources: Row[] = knownSources.data ?? [], events: Row[] = knownEvents.data ?? [];
  const sourceIdMap = new Map<string,string>();
  for (const source of bundle.sources) {
    let known = sources.find(s => s.id === source.id || s.sha256 === source.sha256);
    if (known && (known.sha256 !== source.sha256 || known.kind !== source.kind || known.provider !== source.provider)) throw new Error('Identità fonte incoerente: revisione necessaria.');
    if (!known) {
      const row = {id:source.id,match_id:matchId,provider:source.provider,kind:source.kind,filename:source.filename,sha256:source.sha256,size_bytes:source.size_bytes,duration_ms:source.metadata?.duration_ms ?? null,width:source.metadata?.width ?? null,height:source.metadata?.height ?? null,source_limits:source.metadata?.notice ?? null,extracted_metadata:source.metadata ?? {},imported_by:actor};
      const result = await supabase.from('analysis_sources').upsert(row,{onConflict:'match_id,sha256',ignoreDuplicates:true}); check(result.error);
      const saved = await supabase.from('analysis_sources').select('*').eq('match_id',matchId).eq('sha256',source.sha256).single(); check(saved.error);
      known=saved.data!; sources.push(known!);
    }
    sourceIdMap.set(source.id,known!.id);
  }
  for (const event of bundle.events) {
    const mapped:Row={...event,source_refs:event.source_refs.map((ref:Row)=>({...ref,source_id:sourceIdMap.get(ref.source_id) ?? ref.source_id}))};
    const existing=events.find(e=>e.id===event.event_id);
    if(existing && (existing.source_id!==mapped.source_refs[0]?.source_id || existing.video_start_ms!==mapped.video_start_ms || existing.video_end_ms!==mapped.video_end_ms || existing.description!==mapped.claims[0]?.text)) throw new Error('Evento già importato ma differente: revisione manuale necessaria.');
    if(!existing){const result=await supabase.from('match_tactical_events').insert(eventToRow(mapped,actor));check(result.error);events.push(eventToRow(mapped,actor));}
    const claim=event.claims[0];
    if(claim){
      const result=await supabase.from('tactical_claims').upsert({id:event.event_id,event_id:event.event_id,claim_type:claim.type,claim_text:claim.text,confidence:claim.confidence,evidence_quality:claim.evidence_quality,observability:event.observability,review_status:'proposed',created_by:actor},{onConflict:'id',ignoreDuplicates:true});check(result.error);
      const sourceId=mapped.source_refs[0]?.source_id;
      if(sourceId){const link=await supabase.from('claim_evidence').upsert({claim_id:event.event_id,source_id:sourceId,stance:'context'},{onConflict:'claim_id,source_id',ignoreDuplicates:true});check(link.error);}
    }
  }
  for(const source of bundle.sources.filter((s:Row)=>s.kind==='clip')){
    const matching=events.filter(e=>e.source_id===(sourceIdMap.get(source.metadata?.origin_source_id) ?? source.metadata?.origin_source_id)&&e.video_start_ms===source.metadata?.start_ms&&e.video_end_ms===source.metadata?.end_ms);
    for(const event of matching){const link=await supabase.from('event_evidence').upsert({event_id:event.id,source_id:sourceIdMap.get(source.id)??source.id,stance:'supports',start_ms:source.metadata.start_ms,end_ms:source.metadata.end_ms},{onConflict:'event_id,source_id',ignoreDuplicates:true});check(link.error);}
  }
}
