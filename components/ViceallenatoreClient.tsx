'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '../lib/supabase/browser';
import eventContract from '../docs/viceallenatore/event-contract.json';

type Match = { match_id: string; data: string | null; partita: string };
type Row = Record<string, any>;
type Bundle = { schema_version: string; match_id: string; sources: Row[]; events: Row[] };

const supabase = createClient();
const text = (value: unknown) => String(value ?? '');
const formatMs = (ms: number | null) => ms === null ? '—' : `${Math.floor(ms / 60000).toString().padStart(2, '0')}:${Math.floor((ms % 60000) / 1000).toString().padStart(2, '0')}`;

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

export function ViceallenatoreClient({ matches, matchError }: { matches: Match[]; matchError: string | null }) {
  const [matchId, setMatchId] = useState(matches[0]?.match_id ?? '');
  const [sources, setSources] = useState<Row[]>([]);
  const [players, setPlayers] = useState<Row[]>([]);
  const [evidence, setEvidence] = useState<Row[]>([]);
  const [clockSegments, setClockSegments] = useState<Row[]>([]);
  const [reconciliations, setReconciliations] = useState<Row[]>([]);
  const [events, setEvents] = useState<Row[]>([]);
  const [assessments, setAssessments] = useState<Row[]>([]);
  const [claims, setClaims] = useState<Row[]>([]);
  const [plans, setPlans] = useState<Row[]>([]);
  const [models, setModels] = useState<Row[]>([]);
  const [selectedModelId, setSelectedModelId] = useState('');
  const [modelForm, setModelForm] = useState({season_label:'',title:''});
  const [dnaForm, setDnaForm] = useState({title:'',phase:'costruzione',conditions:'',zone:'',roles:'',expected_behavior:'',justified_exceptions:''});
  const [principles, setPrinciples] = useState<Row[]>([]);
  const [impressions, setImpressions] = useState<Row[]>([]);
  const [findings, setFindings] = useState<Row[]>([]);
  const [findingEvidence, setFindingEvidence] = useState<Row[]>([]);
  const [interventions, setInterventions] = useState<Row[]>([]);
  const [followups, setFollowups] = useState<Row[]>([]);
  const [briefingItems, setBriefingItems] = useState<Row[]>([]);
  const [briefings, setBriefings] = useState<Row[]>([]);
  const [decisionForm, setDecisionForm] = useState({decision_text:'',rationale:'',supporting_evidence:'',contrary_evidence:'',confidence_reason:'',alternatives:'',next_match_check:''});
  const [status, setStatus] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [pdfUrl, setPdfUrl] = useState('');
  const [selectedPdfId, setSelectedPdfId] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ description: '', event_type: 'other', phase: 'unknown', period:'unknown', observability: 'observable', relevance: 'relevant', start: '', end: '', minute: '', player_id: '', source_id: '' });
  const [clockForm, setClockForm] = useState({source_id:'',video_start_ms:'',video_end_ms:'',period:'first_half',game_start_minute:'',notes:''});
  const [principleForm, setPrincipleForm] = useState({ title: '', phase: 'costruzione', expected_behavior: '', conditions: '', pdf_page: '' });
  const [impression, setImpression] = useState('');
  const [findingForm, setFindingForm] = useState({ scope: 'weakness', title: '', context: '' });

  const load = useCallback(async () => {
    if (!matchId) return;
    const [a,b,c,d,e,f,g,h,i,j,k,l,m,n,o,p,q] = await Promise.all([
      supabase.from('analysis_sources').select('*').eq('match_id', matchId).order('imported_at'),
      supabase.from('match_tactical_events').select('*').eq('match_id', matchId).order('video_start_ms'),
      supabase.from('event_assessments').select('*,match_tactical_events!inner(match_id)').eq('match_tactical_events.match_id', matchId),
      supabase.from('match_game_plans').select('*,game_plan_versions(*,tactical_principles(*))').eq('match_id', matchId),
      supabase.from('coach_impressions').select('*,impression_reviews(*)').eq('match_id', matchId).order('created_at'),
      supabase.from('tactical_findings').select('*').eq('match_id', matchId).order('created_at'),
      supabase.from('training_interventions').select('*,tactical_findings!inner(match_id)').eq('tactical_findings.match_id', matchId),
      supabase.from('followup_checks').select('*,tactical_findings!inner(match_id)').eq('tactical_findings.match_id', matchId),
      supabase.from('briefing_items').select('*,decision_briefings!inner(match_id,status,created_at)').eq('decision_briefings.match_id', matchId),
      supabase.from('source_reconciliations').select('*').eq('match_id', matchId),
      supabase.from('players').select('player_id,nome').order('nome'),
      supabase.from('event_evidence').select('*,match_tactical_events!inner(match_id)').eq('match_tactical_events.match_id', matchId),
      supabase.from('tactical_claims').select('*,match_tactical_events!inner(match_id)').eq('match_tactical_events.match_id', matchId),
      supabase.from('decision_briefings').select('*').eq('match_id', matchId).order('created_at', {ascending:false}),
      supabase.from('video_clock_segments').select('*').eq('match_id', matchId).order('video_start_ms'),
      supabase.from('finding_evidence').select('*,tactical_findings!inner(match_id)').eq('tactical_findings.match_id', matchId),
      supabase.from('tactical_models').select('*,tactical_model_versions(*)').order('created_at', {ascending:false}),
    ]);
    const error = [a,b,c,d,e,f,g,h,i,j,k,l,m,n,o,p,q].find(r => r.error)?.error;
    if (error) setStatus(`Lettura dati: ${error.message}. Verifica che la migrazione sia stata applicata al DB di sviluppo.`);
    setSources(a.data ?? []); setReconciliations(j.data ?? []); setPlayers(k.data ?? []); setEvidence(l.data ?? []); setClaims(m.data ?? []); setClockSegments(o.data ?? []); setEvents(b.data ?? []); setAssessments(c.data ?? []);
    setPlans(d.data ?? []); setImpressions(e.data ?? []); setFindings(f.data ?? []);
    setInterventions(g.data ?? []); setFollowups(h.data ?? []); setBriefingItems(i.data ?? []); setBriefings(n.data ?? []); setFindingEvidence(p.data ?? []); setModels(q.data ?? []);
    const versions = (d.data ?? []).flatMap((plan: Row) => plan.game_plan_versions ?? []);
    setPrinciples(versions.flatMap((version: Row) => (version.tactical_principles ?? []).map((p: Row) => ({...p, version_status: version.status}))));
  }, [matchId]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => () => { if (videoUrl) URL.revokeObjectURL(videoUrl); }, [videoUrl]);
  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); }, [pdfUrl]);

  const versions = plans.flatMap(p => p.game_plan_versions ?? []);
  const approved = [...versions].filter(v => v.status === 'approved').sort((a,b) => b.version-a.version)[0];
  const draft = [...versions].filter(v => v.status === 'draft').sort((a,b) => b.version-a.version)[0];
  const activeAssessments = assessments.filter(a => a.review_status === 'reviewed' && a.game_plan_version_id === approved?.id).sort((a,b) => String(b.created_at).localeCompare(String(a.created_at)));
  const byEvent = new Map<string,Row>();
  for (const assessment of activeAssessments) if (!byEvent.has(assessment.event_id)) byEvent.set(assessment.event_id,assessment);
  const latestAssessments = [...byEvent.values()];
  const judged = latestAssessments.filter(a => a.relevance === 'relevant' && a.observability !== 'not_observable' && a.plan_compliance !== 'non_valutabile');
  const compliance = { conforme: judged.filter(a => a.plan_compliance === 'conforme').length, non_conforme: judged.filter(a => a.plan_compliance === 'non_conforme').length, adattamenti: judged.filter(a => a.plan_compliance === 'adattamento_giustificato').length, non_valutabili: latestAssessments.filter(a => a.plan_compliance === 'non_valutabile').length };

  async function act(action: () => Promise<void>) {
    setBusy(true); setStatus('');
    try { await action(); await load(); setStatus('Salvato.'); }
    catch (error) { setStatus(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }
  async function userId() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Sessione scaduta.');
    return user.id;
  }
  function check(error: { message: string } | null) { if (error) throw new Error(error.message); }

  async function createModel() {
    if (!modelForm.season_label.trim() || !modelForm.title.trim()) throw new Error('Stagione e titolo sono richiesti.');
    const actor = await userId();
    const result = await supabase.from('tactical_models').insert({...modelForm,created_by:actor}).select().single(); check(result.error);
    const version = await supabase.from('tactical_model_versions').insert({model_id:result.data.id,version:1,snapshot:{principles:[]},created_by:actor}); check(version.error);
    setSelectedModelId(result.data.id);
  }
  async function createModelDraft() {
    if (!selectedModel) throw new Error('Scegli un modello stagionale.');
    const versions = selectedModel.tactical_model_versions ?? [];
    const number = Math.max(0,...versions.map((v: Row) => v.version)) + 1;
    const snapshot = approvedModel?.snapshot ?? {principles:[]};
    const result = await supabase.from('tactical_model_versions').insert({model_id:selectedModel.id,version:number,snapshot,created_by:await userId()}); check(result.error);
  }
  async function addDnaPrinciple() {
    if (!modelDraft || !dnaForm.title.trim() || !dnaForm.expected_behavior.trim()) throw new Error('Bozza, titolo e comportamento osservabile sono richiesti.');
    const snapshot = {...modelDraft.snapshot,principles:[...(modelDraft.snapshot?.principles ?? []),{...dnaForm,roles:dnaForm.roles.split(',').map((x:string)=>x.trim()).filter(Boolean)}]};
    const result = await supabase.from('tactical_model_versions').update({snapshot}).eq('id',modelDraft.id); check(result.error);
    setDnaForm({title:'',phase:'costruzione',conditions:'',zone:'',roles:'',expected_behavior:'',justified_exceptions:''});
  }
  async function approveDna() {
    if (!modelDraft?.snapshot?.principles?.length) throw new Error('Aggiungi almeno un principio.');
    const digest = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(modelDraft.snapshot)));
    const snapshot_sha256 = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2,'0')).join('');
    const result = await supabase.from('tactical_model_versions').update({status:'approved',snapshot_sha256,approved_by:await userId(),approved_at:new Date().toISOString()}).eq('id',modelDraft.id); check(result.error);
  }

  async function importBundle(file: File) {
    if (file.size > 10 * 1024 * 1024) throw new Error('Bundle oltre 10 MB.');
    const bundle = JSON.parse(await file.text()) as Bundle;
    if (bundle.schema_version !== '1.0.0' || bundle.match_id !== matchId || !Array.isArray(bundle.sources) || !Array.isArray(bundle.events)) throw new Error('Versione o partita del bundle non corrispondente.');
    const actor = await userId();
    const sourceIdMap = new Map<string,string>();
    for (const source of bundle.sources) {
      if (source.local_path || source.path || source.match_id !== matchId || !/^[a-f0-9]{64}$/.test(text(source.sha256))) throw new Error('Fonte non valida o path locale nel bundle.');
      const known = sources.find(s => s.id === source.id || s.sha256 === source.sha256);
      if (known) {
        if (known.sha256 !== source.sha256) throw new Error('ID fonte già usato per un file differente.');
        sourceIdMap.set(source.id,known.id);
        continue;
      }
      const { error } = await supabase.from('analysis_sources').upsert({ id: source.id, match_id: matchId, provider: source.provider, kind: source.kind, filename: source.filename, sha256: source.sha256, size_bytes: source.size_bytes, duration_ms: source.metadata?.duration_ms ?? null, width: source.metadata?.width ?? null, height: source.metadata?.height ?? null, source_limits: source.metadata?.notice ?? null, extracted_metadata: source.metadata ?? {}, imported_by: actor }, { onConflict: 'id' });
      check(error);
      sourceIdMap.set(source.id,source.id);
    }
    for (const event of bundle.events) {
      validateEvent(event,matchId);
      const mapped: Row = {...event,source_refs:event.source_refs.map((ref: Row) => ({...ref,source_id:sourceIdMap.get(ref.source_id) ?? ref.source_id}))};
      const existing = events.find(e => e.id === event.event_id);
      if (existing) {
        if (existing.source_id !== mapped.source_refs[0]?.source_id || existing.video_start_ms !== mapped.video_start_ms || existing.video_end_ms !== mapped.video_end_ms || existing.description !== mapped.claims[0]?.text) throw new Error('Evento già importato ma differente: revisione manuale necessaria.');
        continue;
      }
      const { error } = await supabase.from('match_tactical_events').insert(eventToRow(mapped,actor));
      check(error);
      if (event.claims[0]) {
        const claim = event.claims[0];
        const result = await supabase.from('tactical_claims').upsert({id:event.event_id,event_id:event.event_id,claim_type:claim.type,claim_text:claim.text,confidence:claim.confidence,evidence_quality:claim.evidence_quality,observability:event.observability,review_status:claim.review_status,created_by:actor},{onConflict:'id'}); check(result.error);
        const sourceId = mapped.source_refs[0]?.source_id;
        if (sourceId) { const link = await supabase.from('claim_evidence').upsert({claim_id:event.event_id,source_id:sourceId,stance:'context'},{onConflict:'claim_id,source_id'}); check(link.error); }
      }
    }
    for (const source of bundle.sources.filter(s => s.kind === 'clip')) {
      const localEvents = bundle.events.map(e => ({id:e.event_id,source_id:sourceIdMap.get(e.source_refs?.[0]?.source_id) ?? e.source_refs?.[0]?.source_id,video_start_ms:e.video_start_ms,video_end_ms:e.video_end_ms}));
      const matching = [...events,...localEvents].filter(e => e.source_id === (sourceIdMap.get(source.metadata?.origin_source_id) ?? source.metadata?.origin_source_id) && e.video_start_ms === source.metadata?.start_ms && e.video_end_ms === source.metadata?.end_ms);
      for (const event of matching) {
        const { error } = await supabase.from('event_evidence').upsert({ event_id:event.id, source_id:sourceIdMap.get(source.id) ?? source.id, stance:'supports', start_ms:source.metadata.start_ms, end_ms:source.metadata.end_ms }, { onConflict:'event_id,source_id' }); check(error);
      }
    }
  }

  async function createPlan() {
    const actor = await userId();
    const pdf = sources.find(s => s.id === selectedPdfId && s.kind === 'pdf');
    if (!pdf) throw new Error('Scegli una fonte PDF del piano gara.');
    if (!approvedModel) throw new Error('Approva e scegli prima una versione del modello stagionale.');
    let plan = plans[0];
    if (!plan) {
      const result = await supabase.from('match_game_plans').insert({ match_id: matchId, model_version_id:approvedModel.id, created_by: actor }).select().single(); check(result.error); plan = result.data;
    } else if (plan.model_version_id !== approvedModel.id) {
      const result = await supabase.from('match_game_plans').update({model_version_id:approvedModel.id}).eq('id',plan.id); check(result.error);
    }
    const versions = plan.game_plan_versions ?? [];
    const version = versions.reduce((n: number, v: Row) => Math.max(n, v.version), 0) + 1;
    const result = await supabase.from('game_plan_versions').insert({ plan_id: plan.id, model_version_id:approvedModel.id, version, pdf_source_id: pdf?.id ?? null, created_by: actor }); check(result.error);
  }

  async function approvePlan() {
    if (!draft?.pdf_source_id) throw new Error('La bozza richiede una fonte PDF.');
    if (sources.find(s => s.id === draft.pdf_source_id)?.review_status !== 'reviewed') throw new Error('Verifica prima la fonte PDF.');
    const rows = principles.filter(p => p.game_plan_version_id === draft.id).sort((a,b) => String(a.id).localeCompare(String(b.id))).map(p => ({title:p.title,phase:p.phase,conditions:p.conditions,expected_behavior:p.expected_behavior,pdf_page:p.pdf_page}));
    if (!rows.length) throw new Error('Aggiungi almeno un principio.');
    const pdfSha = sources.find(s => s.id === draft.pdf_source_id)?.sha256;
    const bytes = new TextEncoder().encode(JSON.stringify({pdfSha,modelVersionId:draft.model_version_id,rows}));
    const digest = await crypto.subtle.digest('SHA-256',bytes);
    const snapshot_sha256 = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2,'0')).join('');
    const result = await supabase.from('game_plan_versions').update({status:'approved',snapshot_sha256,approved_by:await userId(),approved_at:new Date().toISOString()}).eq('id',draft.id); check(result.error);
  }

  async function createEvent() {
    const actor = await userId();
    const start = form.start === '' ? null : Math.round(Number(form.start) * 1000);
    const end = form.end === '' ? null : Math.round(Number(form.end) * 1000);
    if (start !== null && (end === null || end < start)) throw new Error('Intervallo video non valido.');
    const event = {schema_version:eventContract.properties.schema_version.const,analysis_pipeline_version:'manual-1',event_id:crypto.randomUUID(),match_id:matchId,season_id:null,period:form.period,video_start_ms:start,video_end_ms:end,game_clock:{minute:form.minute === '' ? null : Number(form.minute),stoppage:null,mapping_verified:false},event_type:form.event_type,phase:form.phase,zone:null,team_id:null,player_ids:form.player_id ? [form.player_id] : [],observability:form.observability,relevance:form.relevance,source_refs:[{source_id:form.source_id,kind:sources.find(s => s.id === form.source_id)?.kind ?? 'annotation',start_ms:start,end_ms:end}],principle_ref:null,claims:[{type:'osservazione',text:form.description,review_status:'proposed',confidence:'unknown',evidence_quality:'unknown'}],assessment:{plan_compliance:'non_valutabile',technical_quality:'non_valutabile',review_status:'proposed'},sync:{origin:'cloud',revision:1}};
    validateEvent(event,matchId);
    const result = await supabase.from('match_tactical_events').insert(eventToRow(event,actor)); check(result.error);
    const claim = await supabase.from('tactical_claims').insert({id:event.event_id,event_id:event.event_id,claim_type:'osservazione',claim_text:form.description,confidence:'unknown',evidence_quality:'unknown',observability:form.observability,review_status:'proposed',created_by:actor}); check(claim.error);
    const link = await supabase.from('claim_evidence').insert({claim_id:event.event_id,source_id:form.source_id,stance:'context'}); check(link.error);
    setForm(f => ({ ...f, description: '', start: '', end: '', minute: '' }));
  }

  async function assess(event: Row, principleId: string, verdict: string, technical: string, reason: string) {
    if (!approved) throw new Error('Approva prima una versione del piano.');
    const result = await supabase.from('event_assessments').insert({ event_id: event.id, principle_id: principleId, game_plan_version_id: approved.id, plan_compliance: verdict, technical_quality: technical, reason, observability: event.observability, relevance: event.relevance, review_status: 'reviewed', reviewed_by: await userId(), reviewed_at: new Date().toISOString() }); check(result.error);
  }
  async function addClaim(event: Row, claimType: string, claimText: string, confidence: string) {
    const actor = await userId();
    const result = await supabase.from('tactical_claims').insert({ event_id:event.id, claim_type:claimType, claim_text:claimText, confidence, evidence_quality:'da_verificare', observability:event.observability, review_status:'proposed', created_by:actor }).select().single(); check(result.error);
    if (event.source_id && result.data) {
      const link = await supabase.from('claim_evidence').insert({ claim_id:result.data.id, source_id:event.source_id, stance:'context' }); check(link.error);
    }
  }
  async function createClockSegment() {
    const start = Number(clockForm.video_start_ms), end = Number(clockForm.video_end_ms), minute = Number(clockForm.game_start_minute);
    if (!clockForm.source_id || !clockForm.video_start_ms || !clockForm.video_end_ms || !clockForm.game_start_minute || !clockForm.notes || !Number.isInteger(start) || !Number.isInteger(end) || !Number.isInteger(minute) || start < 0 || end < start || minute < 0) throw new Error('Segmento cronometro non valido.');
    const result = await supabase.from('video_clock_segments').insert({match_id:matchId,source_id:clockForm.source_id,video_start_ms:start,video_end_ms:end,period:clockForm.period,game_start_minute:minute,notes:clockForm.notes,verified_by:await userId()}); check(result.error);
    setClockForm({source_id:'',video_start_ms:'',video_end_ms:'',period:'first_half',game_start_minute:'',notes:''});
  }
  async function verifyClock(event: Row, segmentId: string) {
    const segment = clockSegments.find(s => s.id === segmentId);
    if (!segment || event.source_id !== segment.source_id || event.period !== segment.period || event.video_start_ms === null || event.video_start_ms < segment.video_start_ms || event.video_end_ms > segment.video_end_ms || event.game_minute === null) throw new Error('Evento fuori dal segmento o minuto gara assente.');
    const result = await supabase.from('match_tactical_events').update({clock_mapping_verified:true}).eq('id',event.id); check(result.error);
  }

  const approvedPrinciples = principles.filter(p => p.game_plan_version_id === approved?.id);
  const evidencedAssessments = latestAssessments.filter(a => events.some(e => e.id === a.event_id && e.player_id && evidence.some(v => v.event_id === e.id && sources.some(s => s.id === v.source_id && s.kind === 'clip' && s.review_status === 'reviewed'))));
  const verifiedEvents = events.filter(e => latestAssessments.some(a => a.event_id === e.id) && evidence.some(v => v.event_id === e.id && sources.some(s => s.id === v.source_id && s.kind === 'clip' && s.review_status === 'reviewed')));
  const playerHighlights = players.map(p => ({ player:p, top:evidencedAssessments.filter(a => a.technical_quality === 'positiva' && events.some(e => e.id === a.event_id && e.player_id === p.player_id)).slice(0,3), flop:evidencedAssessments.filter(a => a.technical_quality === 'negativa' && events.some(e => e.id === a.event_id && e.player_id === p.player_id)).slice(0,3) })).filter(x => x.top.length || x.flop.length);
  const draftBriefing = briefings.find(b => b.status === 'draft');
  const draftItems = briefingItems.filter(i => i.briefing_id === draftBriefing?.id);
  const selectedModel = models.find(m => m.id === selectedModelId);
  const modelVersions = selectedModel?.tactical_model_versions ?? [];
  const modelDraft = modelVersions.find((v: Row) => v.status === 'draft');
  const approvedModel = [...modelVersions].filter((v: Row) => v.status === 'approved').sort((a: Row,b: Row) => b.version-a.version)[0];
  function downloadReportData() {
    const highlight = (assessment: Row) => { const event = events.find(e => e.id === assessment.event_id); const clip = evidence.filter(v => v.event_id === event?.id).map(v => sources.find(s => s.id === v.source_id)).find(s => s?.kind === 'clip'); return { description:event?.description, event_id:event?.id, video_start_ms:event?.video_start_ms, clip_source_id:clip?.id, reason:assessment.reason }; };
    const modelVersion = models.flatMap(m => m.tactical_model_versions ?? []).find(v => v.id === approved?.model_version_id);
    const snapshot = { schema_version:'1.0.0', match_id:matchId, match_name:matches.find(m => m.match_id === matchId)?.partita, sources, reconciliations, clock_segments:clockSegments, events, claims, assessments, principles, impressions, findings, finding_evidence:findingEvidence, interventions, followups, decisions:briefingItems, approved_plan_version:approved?.version ?? null, approved_plan_hash:approved?.snapshot_sha256 ?? null, approved_model_version: modelVersion?.version ?? null, approved_model_hash:modelVersion?.snapshot_sha256 ?? null, compliance:{ denominator:judged.length, ...compliance }, player_highlights:playerHighlights.map(x => ({name:x.player.nome,top:x.top.map(highlight),flop:x.flop.map(highlight)})) };
    const url = URL.createObjectURL(new Blob([JSON.stringify(snapshot,null,2)], {type:'application/json'}));
    const link = document.createElement('a'); link.href=url; link.download=`viceallenatore-${matchId.replace(/[^a-zA-Z0-9_-]/g,'_')}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const veo = sources.find(s => s.provider === 'veo' && s.kind === 'mhtml');
  const youcoach = sources.find(s => s.provider === 'youcoach' && s.kind === 'mhtml');
  const veoGoal = veo?.extracted_metadata?.goal_candidates?.[0];
  const youcoachGoal = youcoach?.extracted_metadata?.goal_candidates?.[0];
  const goalConflict = veoGoal && youcoachGoal && veoGoal.minute !== youcoachGoal.minute;
  return <main className="page vicePage">
    <header className="topbar"><div className="brand"><img src="/logo_verde.jpeg" alt="ASD Villanovese" className="brandLogo" /><div><b>VILLANOVESE</b><span>ANALYTICS · VICEALLENATORE AI</span></div></div><a href="/">Dashboard</a></header>
    <section className="hero"><div><p className="eyebrow">ANALISI TATTICA · STAFF</p><h1>Viceallenatore AI</h1><p>Annotazioni verificabili, fonti e decisioni approvate dallo staff.</p></div></section>
    <section className="panel tablePanel"><label className="selector">Partita canonica<select value={matchId} onChange={e => setMatchId(e.target.value)}>{matches.map(m => <option value={m.match_id} key={m.match_id}>{m.data ?? 'Data da verificare'} · {m.partita}</option>)}</select></label>{matchError && <p role="alert">{matchError}</p>}{status && <p role="status">{status}</p>}</section>
    {!matchId ? <p>Nessuna partita disponibile.</p> : <>
      <section className="panel tablePanel"><h2>Fonti locali e riconciliazione</h2><p>Importa sul Mac con il comando locale; qui carica solo il bundle JSON. I video e i PDF originali restano sul Mac.</p><input type="file" accept=".json,application/json" aria-label="Bundle locale" onChange={e => { const file = e.target.files?.[0]; if (file) void act(() => importBundle(file)); }} />
        <div className="vaGrid">{sources.map(s => <article className="vaCard" key={s.id}><b>{s.provider.toUpperCase()} · {s.kind}</b><p>{s.filename}</p><small>SHA-256 {s.sha256.slice(0, 16)}… · {s.review_status}</small>{s.duration_ms && <p>Durata {formatMs(s.duration_ms)} · {s.width}×{s.height}</p>}{s.review_status === 'pending' && <button disabled={busy} onClick={() => void act(async () => { const result = await supabase.from('analysis_sources').update({review_status:'reviewed'}).eq('id',s.id); check(result.error); })}>Segna fonte verificata</button>}</article>)}</div>
        <p className="vaNote">Eventi/statistiche dei report MHTML sono candidati da verificare. Minuti YouCoach e Veo divergenti restano due valori distinti finché lo staff non sceglie un dato consolidato.</p>
        {veo && veo.extracted_metadata?.kpi_candidates?.length > 0 && <div className="vaCard"><b>Veo · numeri chiave candidati</b><p className="vaNote">Prima e seconda colonna nell&apos;ordine del report. Verificare squadra, periodo e metodo prima di usare questi valori in un giudizio.</p><div className="vaGrid">{veo.extracted_metadata.kpi_candidates.map((k: Row) => <p key={k.metric}>{k.metric}: {k.first_value} / {k.second_value}</p>)}</div></div>}
        {youcoach && youcoach.extracted_metadata?.timeline_candidates?.length > 0 && <div className="vaCard"><b>YouCoach · cronaca candidata</b><p className="vaNote">Le etichette del report non identificano automaticamente un giocatore canonico, un titolare o un timestamp video.</p>{youcoach.extracted_metadata.timeline_candidates.map((item: Row, index: number) => <p key={`${item.minute}-${index}`}>{item.minute}{item.stoppage ? `+${item.stoppage}` : ''}′ · {item.event_type} · {item.excerpt}</p>)}</div>}
        {goalConflict && <ReconciliationCard label="Primo gol candidato" veo={veoGoal} youcoach={youcoachGoal} saved={reconciliations.find(r => r.field_name === 'first_goal_minute')} onSave={(value,reason) => void act(async () => { const result = await supabase.from('source_reconciliations').upsert({ match_id:matchId, field_name:'first_goal_minute', source_a_id:veo.id, value_a:String(veoGoal.minute), source_b_id:youcoach.id, value_b:String(youcoachGoal.minute), approved_value:value, status:'approved', reason, reviewed_by:await userId(), reviewed_at:new Date().toISOString() }, { onConflict:'match_id,field_name,source_a_id,source_b_id' }); check(result.error); })} />}
      </section>
      <section className="panel tablePanel"><h2>Tactical DNA stagionale</h2><p>Il modello descrive comportamenti attesi per fase e condizioni. Una variazione di modulo, da sola, non è un errore.</p><div className="vaGrid"><input placeholder="Stagione, es. 2026/27" value={modelForm.season_label} onChange={e => setModelForm({...modelForm,season_label:e.target.value})} /><input placeholder="Nome del modello" value={modelForm.title} onChange={e => setModelForm({...modelForm,title:e.target.value})} /><button disabled={busy || !modelForm.season_label || !modelForm.title} onClick={() => void act(createModel)}>Crea modello stagionale</button></div><select value={selectedModelId} onChange={e => setSelectedModelId(e.target.value)}><option value="">Scegli modello</option>{models.map(m => <option key={m.id} value={m.id}>{m.season_label} · {m.title}</option>)}</select>{selectedModel && <><p>Versione approvata: {approvedModel ? `v${approvedModel.version}` : 'nessuna'} · bozza: {modelDraft ? `v${modelDraft.version}` : 'nessuna'}</p><button disabled={busy || Boolean(modelDraft)} onClick={() => void act(createModelDraft)}>Nuova bozza del modello</button>{modelDraft && <><div className="vaGrid"><input placeholder="Titolo principio" value={dnaForm.title} onChange={e => setDnaForm({...dnaForm,title:e.target.value})} /><select value={dnaForm.phase} onChange={e => setDnaForm({...dnaForm,phase:e.target.value})}>{['costruzione','sviluppo','rifinitura','pressing','transizione','difesa','corner','punizione'].map(x => <option key={x}>{x}</option>)}</select><input placeholder="Condizioni" value={dnaForm.conditions} onChange={e => setDnaForm({...dnaForm,conditions:e.target.value})} /><input placeholder="Zona" value={dnaForm.zone} onChange={e => setDnaForm({...dnaForm,zone:e.target.value})} /><input placeholder="Ruoli separati da virgola" value={dnaForm.roles} onChange={e => setDnaForm({...dnaForm,roles:e.target.value})} /><input placeholder="Comportamento osservabile" value={dnaForm.expected_behavior} onChange={e => setDnaForm({...dnaForm,expected_behavior:e.target.value})} /><input placeholder="Eccezioni giustificate" value={dnaForm.justified_exceptions} onChange={e => setDnaForm({...dnaForm,justified_exceptions:e.target.value})} /><button disabled={busy || !dnaForm.title || !dnaForm.expected_behavior} onClick={() => void act(addDnaPrinciple)}>Aggiungi alla bozza</button></div><button disabled={busy || !modelDraft.snapshot?.principles?.length} onClick={() => void act(approveDna)}>Approva versione DNA</button></>}{modelVersions.map((v: Row) => <article className="vaCard" key={v.id}><b>Versione {v.version} · {v.status}</b><p>{(v.snapshot?.principles ?? []).map((p: Row) => `${p.title} (${p.phase}: ${p.expected_behavior})`).join(' · ') || 'Nessun principio'}</p><small>Hash {v.snapshot_sha256 ?? 'bozza'}</small></article>)}</>}</section>
      <section className="panel tablePanel"><h2>Game Plan PDF e principi</h2><p>Modello stagionale collegato: {plans[0]?.model_version_id ?? 'nessuno'} · versione piano approvata: {approved ? `v${approved.version}` : 'nessuna'} · bozza: {draft ? `v${draft.version}` : 'nessuna'}. Frecce e diagrammi richiedono interpretazione umana.</p><input type="file" accept="application/pdf,.pdf" aria-label="Apri piano PDF locale" onChange={e => { const file = e.target.files?.[0]; if (file) setPdfUrl(URL.createObjectURL(file)); }} />{pdfUrl && <embed src={pdfUrl} type="application/pdf" className="vaPdf" />}<select value={selectedPdfId} onChange={e => setSelectedPdfId(e.target.value)}><option value="">Fonte PDF da associare alla nuova versione</option>{sources.filter(s => s.kind === 'pdf').map(s => <option key={s.id} value={s.id}>{s.filename} · {s.sha256.slice(0,12)}…</option>)}</select><button disabled={busy || Boolean(draft) || !selectedPdfId} onClick={() => void act(createPlan)}>Nuova bozza</button>
        {draft && <><div className="vaGrid"><input placeholder="Titolo principio" value={principleForm.title} onChange={e => setPrincipleForm({ ...principleForm, title: e.target.value })} /><select value={principleForm.phase} onChange={e => setPrincipleForm({ ...principleForm, phase: e.target.value })}>{['costruzione','sviluppo','rifinitura','pressing','transizione','difesa','corner','punizione'].map(x => <option key={x}>{x}</option>)}</select><input placeholder="Condizioni" value={principleForm.conditions} onChange={e => setPrincipleForm({ ...principleForm, conditions: e.target.value })} /><input placeholder="Comportamento osservabile" value={principleForm.expected_behavior} onChange={e => setPrincipleForm({ ...principleForm, expected_behavior: e.target.value })} /><input type="number" min="1" placeholder="Pagina PDF" value={principleForm.pdf_page} onChange={e => setPrincipleForm({ ...principleForm, pdf_page: e.target.value })} /></div><button disabled={busy || !principleForm.title || !principleForm.expected_behavior} onClick={() => void act(async () => { const result = await supabase.from('tactical_principles').insert({ game_plan_version_id: draft.id, title: principleForm.title, phase: principleForm.phase, conditions: principleForm.conditions, expected_behavior: principleForm.expected_behavior, pdf_page: principleForm.pdf_page ? Number(principleForm.pdf_page) : null }); check(result.error); setPrincipleForm({ title: '', phase: 'costruzione', expected_behavior: '', conditions: '', pdf_page: '' }); })}>Salva principio</button><button disabled={busy || !principles.some(p => p.game_plan_version_id === draft.id)} onClick={() => void act(approvePlan)}>Approva versione</button></>}
        <div className="vaGrid">{principles.map(p => <article className="vaCard" key={p.id}><b>{p.title}</b><p>{p.phase} · pagina {p.pdf_page ?? '—'} · {p.version_status}</p><p>{p.expected_behavior}</p><small>{p.conditions}</small></article>)}</div>
      </section>
      <section className="panel tablePanel"><h2>Sincronizzazione manuale</h2><p>Registra un tratto continuo del filmato con il suo periodo e il minuto gara iniziale. Tagli e recupero richiedono tratti distinti. Nessun minuto viene calcolato automaticamente dall'offset.</p><div className="vaGrid"><select value={clockForm.source_id} onChange={e => setClockForm({...clockForm,source_id:e.target.value})}><option value="">Video di questa partita</option>{sources.filter(s => s.kind === 'video').map(s => <option value={s.id} key={s.id}>{s.filename}</option>)}</select><input type="number" min="0" placeholder="Inizio video ms" value={clockForm.video_start_ms} onChange={e => setClockForm({...clockForm,video_start_ms:e.target.value})} /><input type="number" min="0" placeholder="Fine video ms" value={clockForm.video_end_ms} onChange={e => setClockForm({...clockForm,video_end_ms:e.target.value})} /><select value={clockForm.period} onChange={e => setClockForm({...clockForm,period:e.target.value})}><option value="first_half">Primo tempo</option><option value="second_half">Secondo tempo</option><option value="extra_time">Supplementari</option></select><input type="number" min="0" placeholder="Minuto gara iniziale" value={clockForm.game_start_minute} onChange={e => setClockForm({...clockForm,game_start_minute:e.target.value})} /><input placeholder="Metodo di verifica e tagli" value={clockForm.notes} onChange={e => setClockForm({...clockForm,notes:e.target.value})} /><button disabled={busy} onClick={() => void act(createClockSegment)}>Salva tratto verificato</button></div>{clockSegments.map(s => <p key={s.id}>{s.period}: video {formatMs(s.video_start_ms)}–{formatMs(s.video_end_ms)} · gara da {s.game_start_minute}′ · {s.notes}</p>)}</section>
      <section className="panel tablePanel"><h2>Episodi e affermazioni</h2><p>Il tempo video è in secondi; il minuto gara è separato e resta non sincronizzato finché non viene verificato. Seleziona l'originale sul Mac: il browser lo apre localmente senza caricarlo.</p><input type="file" accept="video/mp4,video/quicktime,.mp4,.mov" aria-label="Apri video locale" onChange={e => { const file = e.target.files?.[0]; if (file) setVideoUrl(URL.createObjectURL(file)); }} />{videoUrl && <><video ref={videoRef} className="vaVideo" controls src={videoUrl} /><div><button onClick={() => setForm(f => ({...f,start:String(videoRef.current?.currentTime ?? 0)}))}>Segna inizio</button><button onClick={() => setForm(f => ({...f,end:String(videoRef.current?.currentTime ?? 0)}))}>Segna fine</button></div></>}<div className="vaGrid"><input placeholder="Osservazione documentata" value={form.description} onChange={e => setForm({...form,description:e.target.value})} /><select value={form.event_type} onChange={e => setForm({...form,event_type:e.target.value})}>{['other','pressing','build_up','transition','set_piece'].map(x => <option key={x}>{x}</option>)}</select><input type="number" min="0" placeholder="Inizio video (s)" value={form.start} onChange={e => setForm({...form,start:e.target.value})} /><input type="number" min="0" placeholder="Fine video (s)" value={form.end} onChange={e => setForm({...form,end:e.target.value})} /><input type="number" min="0" placeholder="Minuto gara non verificato" value={form.minute} onChange={e => setForm({...form,minute:e.target.value})} /><select value={form.observability} onChange={e => setForm({...form,observability:e.target.value})}>{['observable','partially_observable','not_observable'].map(x => <option key={x}>{x}</option>)}</select><select value={form.relevance} onChange={e => setForm({...form,relevance:e.target.value})}>{['relevant','not_relevant','undetermined'].map(x => <option key={x}>{x}</option>)}</select><select value={form.source_id} onChange={e => setForm({...form,source_id:e.target.value})}><option value="">Fonte da collegare</option>{sources.map(s => <option value={s.id} key={s.id}>{s.provider} · {s.filename}</option>)}</select></div><button disabled={busy || !form.description || !form.source_id} onClick={() => void act(createEvent)}>Registra osservazione</button>
        <label>Periodo video: <select value={form.period} onChange={e => setForm({...form,period:e.target.value})}><option value="unknown">Non noto</option><option value="first_half">Primo tempo</option><option value="second_half">Secondo tempo</option><option value="extra_time">Supplementari</option></select></label>
        <label>Giocatore verificato: <select value={form.player_id} onChange={e => setForm({...form,player_id:e.target.value})}><option value="">Non identificato</option>{players.map(p => <option value={p.player_id} key={p.player_id}>{p.nome}</option>)}</select></label>
        {events.map(event => <EventCard key={event.id} event={event} claims={claims.filter(c => c.event_id === event.id)} segments={clockSegments.filter(s => s.source_id === event.source_id && s.period === event.period && event.video_start_ms >= s.video_start_ms && event.video_end_ms <= s.video_end_ms)} principles={approvedPrinciples} onAssess={(principle, verdict, technical, reason) => void act(() => assess(event, principle, verdict, technical, reason))} onClaim={(type,claimText,confidence) => void act(() => addClaim(event,type,claimText,confidence))} onSync={segmentId => void act(() => verifyClock(event,segmentId))} />)}
      </section>
      <section className="panel tablePanel"><h2>Game Plan Compliance</h2><p>Campione annotato e potenzialmente distorto. Denominatore: {judged.length} episodi pertinenti, osservabili, giudicati e collegati al piano approvato. {compliance.conforme} conformi · {compliance.non_conforme} non conformi · {compliance.adattamenti} adattamenti giustificati. {compliance.non_valutabili} non valutabili esclusi.</p>{judged.length > 0 && <strong>Conformità {Math.round(compliance.conforme / judged.length * 100)}% ({compliance.conforme}/{judged.length})</strong>}</section>
      <section className="panel tablePanel"><h2>Player Tactical Coach</h2><p>TOP/FLOP mostrati soltanto con giocatore confermato, valutazione rivista e clip locale associata.</p>{playerHighlights.length === 0 && <p>Nessuna evidenza sufficiente.</p>}{playerHighlights.map(x => <article className="vaCard" key={x.player.player_id}><b>{x.player.nome}</b><p>TOP ({x.top.length}): {x.top.map(a => events.find(e => e.id === a.event_id)?.description).join(' · ') || '—'}</p><p>FLOP ({x.flop.length}): {x.flop.map(a => events.find(e => e.id === a.event_id)?.description).join(' · ') || '—'}</p></article>)}</section>
      <section className="panel tablePanel"><h2>Impressioni dell'allenatore</h2><p>L'impressione originale rimane immutata. La revisione richiede episodi verificati, anche contrari.</p><textarea value={impression} onChange={e => setImpression(e.target.value)} placeholder="Impressione iniziale" /><button disabled={busy || !impression} onClick={() => void act(async () => { const result = await supabase.from('coach_impressions').insert({ match_id: matchId, impression_text: impression, created_by: await userId() }); check(result.error); setImpression(''); })}>Salva impressione</button>{impressions.map(i => <ImpressionCard key={i.id} impression={i} onReview={(verdict,reason,response) => void act(async () => { const revision = Math.max(0,...(i.impression_reviews ?? []).map((r: Row) => r.revision)) + 1; const result = await supabase.from('impression_reviews').insert({ impression_id:i.id, revision, verdict, reasoning:reason, staff_response:response || null, created_by:await userId() }); check(result.error); })} />)}</section>
      <section className="panel tablePanel"><h2>Memoria stagionale · allenamenti e verifiche</h2><p>Registro manuale. Nessuna inferenza automatica di ricorrenza o causalità.</p><div className="vaGrid"><select value={findingForm.scope} onChange={e => setFindingForm({...findingForm,scope:e.target.value})}><option value="strength">Forza</option><option value="weakness">Criticità</option><option value="opponent_vulnerability">Vulnerabilità avversaria</option></select><input placeholder="Titolo finding" value={findingForm.title} onChange={e => setFindingForm({...findingForm,title:e.target.value})} /><input placeholder="Contesto e limiti" value={findingForm.context} onChange={e => setFindingForm({...findingForm,context:e.target.value})} /></div><button disabled={busy || !findingForm.title} onClick={() => void act(async () => { const result = await supabase.from('tactical_findings').insert({ match_id:matchId, ...findingForm, created_by:await userId() }); check(result.error); setFindingForm({scope:'weakness',title:'',context:''}); })}>Registra finding ipotizzato</button>{findings.map(f => <FindingCard key={f.id} finding={f} verifiedEvents={verifiedEvents} linkedEventIds={findingEvidence.filter(v => v.finding_id === f.id).map(v => v.event_id)} interventions={interventions.filter(x => x.finding_id === f.id)} followups={followups.filter(x => x.finding_id === f.id)} matches={matches} onIntervention={(objective,exercise) => void act(async () => { const result = await supabase.from('training_interventions').insert({ finding_id:f.id, observable_objective:objective, exercise, created_by:await userId() }); check(result.error); })} onFollowup={(target) => void act(async () => { const result = await supabase.from('followup_checks').insert({ finding_id:f.id, target_match_id:target || null, created_by:await userId() }); check(result.error); })} />)}</section>
      <section className="panel tablePanel"><h2>Briefing decisionale · massimo tre</h2><p>Solo decisioni motivate e approvate dallo staff entrano nel PDF. Episodi valutati disponibili: {judged.map(a => a.event_id).join(', ') || 'nessuno'}.</p><button disabled={busy || Boolean(draftBriefing)} onClick={() => void act(async () => { const result = await supabase.from('decision_briefings').insert({match_id:matchId,game_plan_version_id:approved?.id ?? null,created_by:await userId()}); check(result.error); })}>Nuovo briefing in bozza</button>{draftBriefing && <><p>{draftItems.length}/3 decisioni in bozza</p>{draftItems.map(i => <p key={i.id}>{i.position}. {i.decision_text} · Pro: {i.supporting_evidence} · Contro: {i.contrary_evidence || 'non registrate'}</p>)}{draftItems.length < 3 && <div className="vaGrid"><input placeholder="Decisione" value={decisionForm.decision_text} onChange={e => setDecisionForm({...decisionForm,decision_text:e.target.value})} /><input placeholder="Motivazione" value={decisionForm.rationale} onChange={e => setDecisionForm({...decisionForm,rationale:e.target.value})} /><input placeholder="Evidenze pro: ID episodi e fonti" value={decisionForm.supporting_evidence} onChange={e => setDecisionForm({...decisionForm,supporting_evidence:e.target.value})} /><input placeholder="Evidenze contrarie" value={decisionForm.contrary_evidence} onChange={e => setDecisionForm({...decisionForm,contrary_evidence:e.target.value})} /><input placeholder="Confidenza e motivo" value={decisionForm.confidence_reason} onChange={e => setDecisionForm({...decisionForm,confidence_reason:e.target.value})} /><input placeholder="Alternative e costi" value={decisionForm.alternatives} onChange={e => setDecisionForm({...decisionForm,alternatives:e.target.value})} /><input placeholder="Verifica partita seguente" value={decisionForm.next_match_check} onChange={e => setDecisionForm({...decisionForm,next_match_check:e.target.value})} /><button disabled={busy || !decisionForm.decision_text || !decisionForm.rationale || !decisionForm.supporting_evidence || !decisionForm.confidence_reason || !decisionForm.next_match_check || judged.length === 0} onClick={() => void act(async () => { const result = await supabase.from('briefing_items').insert({briefing_id:draftBriefing.id,position:draftItems.length+1,...decisionForm}); check(result.error); setDecisionForm({decision_text:'',rationale:'',supporting_evidence:'',contrary_evidence:'',confidence_reason:'',alternatives:'',next_match_check:''}); })}>Aggiungi decisione</button></div>}<button disabled={busy || draftItems.length === 0} onClick={() => void act(async () => { const result = await supabase.from('decision_briefings').update({status:'approved',approved_by:await userId(),approved_at:new Date().toISOString()}).eq('id',draftBriefing.id); check(result.error); })}>Approva briefing</button></>}</section>
      <section className="panel tablePanel"><h2>Sintesi critica</h2><p>Forze: {findings.filter(f => f.scope === 'strength' && f.status === 'confermato').slice(0,3).map(f => f.title).join(' · ') || 'nessuna confermata'}.</p><p>Criticità: {findings.filter(f => f.scope === 'weakness' && f.status === 'confermato').slice(0,3).map(f => f.title).join(' · ') || 'nessuna confermata'}.</p><p>Scouting avversario: {findings.filter(f => f.scope === 'opponent_vulnerability' && f.status === 'confermato').slice(0,5).map(f => f.title).join(' · ') || 'evidenza insufficiente'}.</p><p>TOP/FLOP individuali e briefing decisionale vengono mostrati solo con evidenze verificate e approvazione staff; qui non sono ancora generati automaticamente.</p><button onClick={downloadReportData}>Esporta dati per PDF locale</button><button onClick={() => window.print()}>Stampa / salva PDF della scheda</button></section>
    </>}
  </main>;
}

function EventCard({ event, claims, segments, principles, onAssess, onClaim, onSync }: { event: Row; claims: Row[]; segments: Row[]; principles: Row[]; onAssess: (principle: string, verdict: string, technical: string, reason: string) => void; onClaim: (type: string, text: string, confidence: string) => void; onSync: (segmentId: string) => void }) {
  const [principle,setPrinciple] = useState(''); const [verdict,setVerdict] = useState('non_valutabile'); const [technical,setTechnical] = useState('non_valutabile'); const [reason,setReason] = useState('');
  const [claimType,setClaimType] = useState('interpretazione'); const [claimText,setClaimText] = useState(''); const [confidence,setConfidence] = useState('non_calibrata');
  return <article className="vaCard"><b>Osservazione · {event.event_type} · video {formatMs(event.video_start_ms)}–{formatMs(event.video_end_ms)}</b><p>{event.description}</p><small>Minuto gara {event.game_minute ?? 'non noto'} · sincronizzazione {event.clock_mapping_verified ? 'verificata' : 'non verificata'} · {event.observability} · {event.relevance}</small>{!event.clock_mapping_verified && event.game_minute !== null && segments.length > 0 && <button onClick={() => onSync(segments[0].id)}>Conferma minuto rispetto al tratto verificato</button>}{claims.map(c => <p key={c.id}><b>{c.claim_type}</b> · {c.claim_text} · confidenza {c.confidence} · {c.review_status}</p>)}<div className="vaGrid"><select value={claimType} onChange={e => setClaimType(e.target.value)}><option value="osservazione">osservazione</option><option value="interpretazione">interpretazione</option><option value="ipotesi">ipotesi</option></select><input placeholder="Affermazione e alternative" value={claimText} onChange={e => setClaimText(e.target.value)} /><input placeholder="Confidenza motivata" value={confidence} onChange={e => setConfidence(e.target.value)} /><button disabled={!claimText} onClick={() => { onClaim(claimType,claimText,confidence); setClaimText(''); }}>Aggiungi claim</button></div>{principles.length > 0 && <div className="vaGrid"><select value={principle} onChange={e => setPrinciple(e.target.value)}><option value="">Principio approvato</option>{principles.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}</select><select value={verdict} onChange={e => setVerdict(e.target.value)}>{['non_valutabile','conforme','non_conforme','adattamento_giustificato'].map(x => <option key={x}>{x}</option>)}</select><select value={technical} onChange={e => setTechnical(e.target.value)}>{['non_valutabile','positiva','negativa','mista'].map(x => <option key={x}>{x}</option>)}</select><input placeholder="Motivo del giudizio" value={reason} onChange={e => setReason(e.target.value)} /><button disabled={!principle || !reason} onClick={() => onAssess(principle,verdict,technical,reason)}>Valuta</button></div>}</article>;
}

function ImpressionCard({ impression, onReview }: { impression: Row; onReview: (verdict: string, reason: string, response: string) => void }) {
  const [verdict,setVerdict] = useState('evidenza_insufficiente'); const [reason,setReason] = useState(''); const [response,setResponse] = useState('');
  return <article className="vaCard"><b>Impressione originale</b><p>{impression.impression_text}</p>{(impression.impression_reviews ?? []).map((r: Row) => <p key={r.id}>Revisione {r.revision}: {r.verdict} · {r.reasoning} · risposta: {r.staff_response ?? 'nessuna'}</p>)}<div className="vaGrid"><select value={verdict} onChange={e => setVerdict(e.target.value)}>{['evidenza_insufficiente','supportata','contraddetta','parzialmente_supportata'].map(x => <option key={x}>{x}</option>)}</select><input placeholder="Evidenze, controevidenze e limiti" value={reason} onChange={e => setReason(e.target.value)} /><select value={response} onChange={e => setResponse(e.target.value)}><option value="">Risposta staff</option><option value="accetto">Accetto</option><option value="contesto">Contesto</option><option value="rinvio">Rinvio</option></select><button disabled={!reason} onClick={() => { onReview(verdict,reason,response); setReason(''); }}>Nuova revisione</button></div></article>;
}

function FindingCard({ finding, verifiedEvents, linkedEventIds, interventions, followups, matches, onIntervention, onFollowup }: { finding: Row; verifiedEvents: Row[]; linkedEventIds: string[]; interventions: Row[]; followups: Row[]; matches: Match[]; onIntervention: (objective: string, exercise: string) => void; onFollowup: (target: string) => void }) {
  const [objective,setObjective] = useState(''); const [exercise,setExercise] = useState(''); const [target,setTarget] = useState('');
  const [verdict,setVerdict] = useState('non_valutabile'); const [opportunities,setOpportunities] = useState(''); const [incidents,setIncidents] = useState(''); const [explanation,setExplanation] = useState('');
  const [evidenceEventId,setEvidenceEventId] = useState('');
  async function update(table: string, id: string, values: Row) { const { error } = await supabase.from(table).update(values).eq('id',id); if (error) window.alert(error.message); else window.location.reload(); }
  async function linkEvidence() { if (!evidenceEventId) return; const { error } = await supabase.from('finding_evidence').insert({finding_id:finding.id,event_id:evidenceEventId,stance:'supports'}); if (error) window.alert(error.message); else window.location.reload(); }
  return <article className="vaCard"><b>{finding.scope} · {finding.title} · {finding.status}</b><p>{finding.context}</p><small>{finding.violations}/{finding.observed_opportunities} opportunità annotate; evidenza {finding.evidence_quality}</small><div className="vaGrid"><select value={evidenceEventId} onChange={e => setEvidenceEventId(e.target.value)}><option value="">Episodio verificato con clip</option>{verifiedEvents.filter(e => !linkedEventIds.includes(e.id)).map(e => <option key={e.id} value={e.id}>{e.description.slice(0,80)} · {e.id.slice(0,8)}</option>)}</select><button disabled={!evidenceEventId} onClick={() => void linkEvidence()}>Collega prova</button>{finding.status === 'ipotizzato' && <button disabled={linkedEventIds.length === 0} onClick={() => void update('tactical_findings',finding.id,{status:'confermato'})}>Conferma con prova</button>}</div><p>Prove collegate: {linkedEventIds.length ? linkedEventIds.join(', ') : 'nessuna'}</p><div className="vaGrid"><input placeholder="Obiettivo osservabile" value={objective} onChange={e => setObjective(e.target.value)} /><input placeholder="Esercitazione proposta" value={exercise} onChange={e => setExercise(e.target.value)} /><button disabled={!objective || !exercise} onClick={() => { onIntervention(objective,exercise); setObjective(''); setExercise(''); }}>Proponi esercizio</button><select value={target} onChange={e => setTarget(e.target.value)}><option value="">Partita futura da verificare</option>{matches.map(m => <option value={m.match_id} key={m.match_id}>{m.partita}</option>)}</select><button disabled={!target} onClick={() => onFollowup(target)}>Crea follow-up</button></div>{interventions.map(i => <p key={i.id}>Esercizio: {i.exercise} · {i.performed_at ? 'svolto' : 'non ancora registrato come svolto'} {!i.performed_at && <button onClick={() => void update('training_interventions',i.id,{performed_at:new Date().toISOString()})}>Registra svolgimento</button>}</p>)}{followups.map(f => <div key={f.id}><p>Verifica: {matches.find(m => m.match_id === f.target_match_id)?.partita ?? 'da assegnare'} · {f.verdict ?? 'in attesa'}</p>{!f.verdict && <div className="vaGrid"><select value={verdict} onChange={e => setVerdict(e.target.value)}>{['non_valutabile','incerto','migliorato','non_migliorato'].map(x => <option key={x}>{x}</option>)}</select><input type="number" min="0" placeholder="Opportunità osservate" value={opportunities} onChange={e => setOpportunities(e.target.value)} /><input type="number" min="0" placeholder="Incidenti osservati" value={incidents} onChange={e => setIncidents(e.target.value)} /><input placeholder="Contesto, prove e limiti" value={explanation} onChange={e => setExplanation(e.target.value)} /><button disabled={!explanation || opportunities === '' || incidents === '' || Number(incidents)>Number(opportunities)} onClick={() => void update('followup_checks',f.id,{verdict,observed_opportunities:Number(opportunities),observed_incidents:Number(incidents),explanation})}>Salva verifica</button></div>}</div>)}</article>;
}

function ReconciliationCard({ label, veo, youcoach, saved, onSave }: { label: string; veo: Row; youcoach: Row; saved?: Row; onSave: (value: string, reason: string) => void }) {
  const [value,setValue] = useState(''); const [reason,setReason] = useState('');
  return <article className="vaCard"><b>Conflitto da risolvere · {label}</b><p>Veo: {veo.minute}′ · «{veo.excerpt}»</p><p>YouCoach: {youcoach.minute}′ · «{youcoach.excerpt}»</p><p>Consolidato approvato: {saved?.approved_value ?? 'nessuno'} · {saved?.reason ?? 'in attesa'}</p><p className="vaNote">Sono candidati estratti automaticamente; verificare gli originali prima della scelta. Il minuto gara non sincronizza il video.</p><div className="vaGrid"><select value={value} onChange={e => setValue(e.target.value)}><option value="">Scegli valore verificato</option><option value={String(veo.minute)}>Veo · {veo.minute}′</option><option value={String(youcoach.minute)}>YouCoach · {youcoach.minute}′</option></select><input placeholder="Motivo e fonte controllata" value={reason} onChange={e => setReason(e.target.value)} /><button disabled={!value || !reason} onClick={() => onSave(value,reason)}>Approva dato</button></div></article>;
}
