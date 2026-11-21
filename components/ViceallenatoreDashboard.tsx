'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '../lib/supabase/browser';
import { applicableModel, canonicalSeason, draftFingerprint, generateDraft, latestReview, missingInputs, seasonForMatch } from '../lib/viceallenatore/draft';
import type { DraftInput, DraftItem, Row } from '../lib/viceallenatore/draft';
import { importTacticalBundle } from '../lib/viceallenatore/bundle';
import { extractReport, reportLines, reportMatchDate } from '../lib/viceallenatore/report-import';
import { ViceallenatoreClient } from './ViceallenatoreClient';

type Match = {match_id:string; data:string|null; partita:string};
const db=createClient();
const check=(error:{message:string}|null)=>{if(error) throw new Error(error.message);};
async function actor() {const {data:{user}}=await db.auth.getUser();if(!user) throw new Error('Accedi di nuovo.');return user.id;}
async function sha(value:string|ArrayBuffer) {const digest=await crypto.subtle.digest('SHA-256',typeof value==='string'?new TextEncoder().encode(value):value);return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('');}
const ordered=(rows:Row[])=>[...rows].sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));

export function ViceallenatoreDashboard({matches,matchError}:{matches:Match[];matchError:string|null}) {
  const [matchId,setMatchId]=useState(matches[0]?.match_id??'');
  const [step,setStep]=useState(0); const [busy,setBusy]=useState(false);const [loading,setLoading]=useState(true);
  const [message,setMessage]=useState('');const [errors,setErrors]=useState<string[]>([]);
  const [data,setData]=useState<Row>({});const [showAdvanced,setShowAdvanced]=useState(false);
  const [modelText,setModelText]=useState('');const request=useRef(0);
  const load=useCallback(async()=>{
    const ticket=++request.current;setLoading(true);setData({});setErrors([]);
    if(!matchId){setLoading(false);return;}
    const tables=['matches','players','player_match_stats','match_lineups','match_events','analysis_sources','source_reconciliations','tactical_models','tactical_season_settings','tactical_analysis_drafts','match_tactical_events'] as const;
    const results=await Promise.all(tables.map(table=>{
      let q=db.from(table).select(table==='tactical_models'?'*,tactical_model_versions(*)':'*');
      if(!['players','tactical_models','tactical_season_settings'].includes(table)) q=q.eq('match_id',matchId);
      return q;
    }));
    if(ticket!==request.current) return;
    const next:Row={};const failures:string[]=[];
    results.forEach((r,i)=>{next[tables[i]]=ordered(r.data??[]);if(r.error) failures.push(`${tables[i]}: ${r.error.message}`);});
    const historyIds=matches.filter(m=>seasonForMatch(m)===seasonForMatch(next.matches?.[0]??{})).map(m=>m.match_id);
    const previous=historyIds.length?await db.from('tactical_analysis_drafts').select('id,match_id,created_at').in('match_id',historyIds).order('created_at',{ascending:false}).limit(100):{data:[],error:null};
    if(previous.error) failures.push(`Memoria: ${previous.error.message}`);
    const draftIds=[...new Set([...(next.tactical_analysis_drafts??[]).map((d:Row)=>d.id),...(previous.data??[]).map(d=>d.id)])];
    const reviewResult=draftIds.length?await db.from('tactical_analysis_reviews').select('*').in('draft_id',draftIds).order('created_at',{ascending:false}):{data:[],error:null};
    if(reviewResult.error) failures.push(`Revisioni: ${reviewResult.error.message}`);
    if(ticket!==request.current) return;
    const ownIds=new Set((next.tactical_analysis_drafts??[]).map((d:Row)=>d.id));
    next.reviews=(reviewResult.data??[]).filter(r=>ownIds.has(r.draft_id));
    next.memory=(reviewResult.data??[]).filter(r=>!ownIds.has(r.draft_id));
    setData(next);setErrors(failures);setLoading(false);
  },[matchId,matches]);
  useEffect(()=>{void load();return()=>{request.current++;};},[load]);
  const match=data.matches?.[0]??matches.find(m=>m.match_id===matchId)??{};
  const season=seasonForMatch(match);
  const settings=(data.tactical_season_settings??[]).find((s:Row)=>s.season_label===season);
  const models=(data.tactical_models??[]).filter((m:Row)=>canonicalSeason(m.season_label)===season);
  const model=applicableModel(models,season,settings?.model_id);
  const selectedModel=models.find((m:Row)=>m.id===(settings?.model_id??(models.length===1?models[0].id:'')));
  useEffect(()=>{setModelText(model?.snapshot?.description??(model?.snapshot?.principles??[]).map((p:Row)=>p.expected_behavior||p.title).join('\n'));},[model?.id,season]);
  const input:DraftInput=useMemo(()=>({match:data.matches?.[0]??matches.find(m=>m.match_id===matchId)??{},players:data.players??[],stats:data.player_match_stats??[],lineups:data.match_lineups??[],officialEvents:data.match_events??[],sources:data.analysis_sources??[],reconciliations:data.source_reconciliations??[],modelVersion:model}),[data,model,matches,matchId]);
  const items=useMemo(()=>generateDraft(input),[input]);
  const pending=items.filter(i=>i.requires_review&&!latestReview(i,data.reviews??[]));
  const missing=missingInputs(input);
  const sourceCount=(data.analysis_sources??[]).length;
  async function act(work:()=>Promise<void>,success='Salvato.') {
    setBusy(true);setMessage('');try{await work();await load();setMessage(success);}catch(e){await load();setMessage(e instanceof Error?e.message:String(e));}finally{setBusy(false);}
  }
  async function saveDraft() {
    const input_sha256=await sha(draftFingerprint(input));
    let existing=(data.tactical_analysis_drafts??[]).find((d:Row)=>d.input_sha256===input_sha256);
    if(!existing){
      const row={match_id:matchId,input_sha256,model_version_id:model?.id??null,input_snapshot:input,items,created_by:await actor()};
      const result=await db.from('tactical_analysis_drafts').upsert(row,{onConflict:'match_id,input_sha256',ignoreDuplicates:true}).select();check(result.error);
      existing=result.data?.[0];
      if(!existing){const retry=await db.from('tactical_analysis_drafts').select('*').eq('match_id',matchId).eq('input_sha256',input_sha256).single();check(retry.error);existing=retry.data;}
    }
    return existing as Row;
  }
  async function review(item:DraftItem,verdict:string,corrected_text:string,note:string) {
    const draft=await saveDraft();const created_by=await actor();
    const result=await db.from('tactical_analysis_reviews').insert({draft_id:draft.id,item_key:item.key,evidence_key:item.evidence_key,verdict,corrected_text:verdict==='corrected'?corrected_text:null,note:note||null,created_by});check(result.error);
  }
  async function saveModel() {
    if(!season) throw new Error('La data della partita non consente di determinare la stagione. Completa il dato in Analytics.');
    if(!modelText.trim()) throw new Error('Descrivi i comportamenti che chiedi alla squadra.');
    if(models.length>1&&!selectedModel) throw new Error('Scegli una volta il modello da usare per questa stagione.');
    const created_by=await actor();let m=selectedModel;
    if(!m){const result=await db.from('tactical_models').insert({season_label:season,title:'Modello Villanovese',created_by}).select().single();check(result.error);m=result.data;}
    const version=Math.max(0,...(m!.tactical_model_versions??[]).map((v:Row)=>v.version))+1;
    const snapshot={description:modelText.trim(),principles:modelText.trim().split('\n').filter(Boolean).map(title=>({title,expected_behavior:title}))};
    const result=await db.from('tactical_model_versions').insert({model_id:m!.id,version,snapshot,snapshot_sha256:await sha(JSON.stringify(snapshot)),status:'approved',approved_by:created_by,approved_at:new Date().toISOString(),created_by});check(result.error);
    const setting=await db.from('tactical_season_settings').upsert({season_label:season,model_id:m!.id,updated_by:created_by});check(setting.error);
  }
  async function importFiles(files:File[]) {
    const user=await actor();const sources=[...(data.analysis_sources??[])];
    for(const file of files){
      if(file.name.toLowerCase().endsWith('.json')){
        if(file.size>10*1024*1024) throw new Error('Bundle oltre 10 MB.');
        const bundle=JSON.parse(await file.text());
        await importTacticalBundle(bundle,db,user,matchId,sources,data.match_tactical_events??[]);
        continue;
      }
      if(file.size>50*1024*1024) throw new Error('Report oltre 50 MB: usa il motore locale per file di grandi dimensioni.');
      const buffer=await file.arrayBuffer();const digest=await sha(buffer);
      if(sources.some(s=>s.sha256===digest)) continue;
      const lines=reportLines(new Uint8Array(buffer));const extracted=extractReport(lines);
      // The selected match is canonical; the report is never allowed to create one.
      const reportDate=reportMatchDate(lines);
      const expected=String(match.data??'').slice(0,10);
      if(reportDate&&/^\d{4}-\d{2}-\d{2}$/.test(expected)){
        if(reportDate!==expected) throw new Error(`${file.name}: data ${reportDate} diversa dalla partita selezionata.`);
      }
      // Name/date in heterogeneous exports can be ambiguous: ask only here.
      const normalized=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]/g,'');
      const title=lines.find(l=>/Villanovese.*(?:\d+\s*-|contro)/i.test(l))??'';
      const words=String(match.partita??'').split(/\s*(?:-|–|contro|vs\.?)\s*/i).map(normalized).filter(w=>w.length>3);
      const identified=reportDate===expected&&title&&words.length>=2&&words.every(w=>normalized(title).includes(w));
      if(!identified&&!window.confirm(`Non riesco ad associare con certezza «${file.name}» a «${match.partita}». Confermi che è il report di questa gara?`)) continue;
      const source={id:crypto.randomUUID(),match_id:matchId,provider:extracted.provider,kind:'mhtml',filename:file.name,sha256:digest,size_bytes:file.size,extracted_metadata:extracted.metadata,imported_by:user};
      const result=await db.from('analysis_sources').upsert(source,{onConflict:'match_id,sha256',ignoreDuplicates:true});check(result.error);sources.push(source);
    }
  }
  function download() {
    const exportedItems=items.map(i=>{const r=latestReview(i,data.reviews??[]);return {...i,original_text:i.text,text:r?.verdict==='corrected'?r.corrected_text:i.text,review:r??null};});
    const value={schema_version:'1.0.0',match_id:matchId,match_name:match.partita,sources:data.analysis_sources??[],reconciliations:data.source_reconciliations??[],draft_items:exportedItems,approved_model_version:model?.version??null,approved_model_hash:model?.snapshot_sha256??null,analysis_mode:'report_draft',limitations:'Nessuna analisi video automatica. Conclusioni tecniche in attesa di revisione.'};
    const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`viceallenatore-${matchId}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  return <main className="page vicePage">
    <header className="topbar"><div className="brand"><img src="/logo_verde.jpeg" alt="ASD Villanovese" className="brandLogo"/><div><b>VILLANOVESE</b><span>VICEALLENATORE AI</span></div></div><a href="/">Dashboard</a></header>
    <section className="hero"><div><p className="eyebrow">IL TUO TEMPO ALLE DECISIONI</p><h1>Viceallenatore AI</h1><p>Partita e dati da Analytics. Aggiungi ciò che manca, rivedi ciò che conta.</p></div></section>
    <section className="panel"><label>Partita <select aria-label="Partita" value={matchId} disabled={busy} onChange={e=>{setMatchId(e.target.value);setMessage('');setShowAdvanced(false);}}>{matches.map(m=><option key={m.match_id} value={m.match_id}>{m.data} · {m.partita}</option>)}</select></label>{matchError&&<p role="alert">{matchError}</p>}{message&&<p role="status">{message}</p>}{errors.length>0&&<div role="alert"><p>Alcuni dati non sono disponibili. Le informazioni mancanti non vengono trattate come zero.</p><details><summary>Dettagli da risolvere</summary>{errors.map(e=><p key={e}>{e}</p>)}<p>Se mancano le tabelle tactical_analysis, applica la migration 20261121120000 al database usato dall’app.</p></details></div>}</section>
    <nav className="vaSteps" aria-label="Fasi dell’analisi">{['Importa','Analizza','Revisiona'].map((label,i)=><button key={label} aria-current={step===i?'step':undefined} onClick={()=>setStep(i)}>{i+1}. {label}{i===2&&!loading?` · ${pending.length}`:''}</button>)}</nav>
    {loading?<p role="status">Recupero dati della partita e verifiche salvate…</p>:!matchId?<p>Nessuna partita disponibile in Analytics.</p>:<>
    {step===0&&<section className="panel"><h2>Importa solo ciò che manca</h2><div className="vaGrid"><div className="vaCard"><b>Dati già disponibili</b><p>{input.players.length} giocatori in rosa · {input.lineups.length} in distinta</p><p>{input.stats.length} statistiche giocatore · {input.officialEvents.length} eventi registrati</p><p>{sourceCount} file indicizzati</p><a href={`/matches/${encodeURIComponent(matchId)}`}>Apri report Analytics</a></div><div className="vaCard"><b>{missing.length?'Puoi integrare':'Dati già sufficienti per una bozza'}</b>{missing.map(m=><p key={m.key}>{m.label} · facoltativo, se vuoi integrare i dati disponibili</p>)}<p>Piano gara e video sono facoltativi. Puoi analizzare subito i dati presenti.</p><label className="vaUpload">Aggiungi report mancanti o bundle locale<input type="file" accept=".mhtml,.mht,.json" multiple disabled={busy} onChange={e=>{const files=Array.from(e.target.files??[]);e.target.value='';if(files.length) void act(()=>importFiles(files),'Report acquisiti. La bozza usa i dati disponibili.');}}/></label></div></div>
      {input.sources.length>0&&<details><summary>File già acquisiti · {input.sources.length}</summary>{input.sources.map(s=><p key={s.id}>{s.filename} · {s.provider} · {s.kind}</p>)}</details>}
      <button disabled={busy} onClick={()=>setStep(1)}>Analizza i dati disponibili →</button>
    </section>}
    {step===1&&<section className="panel"><h2>Bozza dai dati disponibili</h2><p>Generata con regole trasparenti dai dati Analytics e dai report. Ogni punto conserva la fonte. L’analisi automatica del filmato è una fase successiva.</p><p>{model?`Modello stagionale ${season} · v${model.version}, riutilizzato automaticamente.`:'Puoi configurare il modello stagionale quando serve un confronto tattico.'}</p>
      {(['osservazione','interpretazione','ipotesi'] as const).map(type=><div key={type}><h3>{{osservazione:'Fatti documentati',interpretazione:'Interpretazioni',ipotesi:'Ipotesi da verificare'}[type]}</h3>{items.filter(i=>i.type===type).map(i=><DraftPoint key={i.key} item={i} review={latestReview(i,data.reviews??[])} busy={busy} onReview={(v,t,n)=>void act(()=>review(i,v,t,n))}/>)}{!items.some(i=>i.type===type)&&<p>Nessun punto supportato dai dati disponibili.</p>}</div>)}
      <button disabled={busy||errors.length>0} onClick={()=>void act(async()=>{await saveDraft();setStep(2);},'Bozza salvata. Rivedi i soli punti aperti.')}>Salva bozza e revisiona →</button><button onClick={download}>Esporta bozza per PDF</button>
    </section>}
    {step===2&&<section className="panel"><h2>Revisiona ciò che conta</h2><p>{pending.length?`${pending.length} punti richiedono una decisione. Puoi anche rinviarli.`:'Nessun punto aperto da confermare. Le verifiche precedenti sono già recuperate.'}</p>{pending.map(i=><DraftPoint key={i.key} item={i} busy={busy} onReview={(v,t,n)=>void act(()=>review(i,v,t,n))}/>)}<details><summary>Correzioni e verifiche di questa gara</summary>{(data.reviews??[]).map((r:Row)=><p key={r.id}>{r.item_key} · {r.verdict} · {r.corrected_text??r.note??'verifica salvata'}</p>)}</details>{(data.memory??[]).length>0&&<details><summary>Memoria della stagione · {data.memory.length} revisioni precedenti</summary><p>Contesto per le prossime decisioni. Una verifica di un’altra gara non conferma un fatto della gara attuale.</p>{data.memory.map((r:Row)=><p key={r.id}>{r.verdict} · {r.corrected_text??r.note??r.item_key}</p>)}</details>}<button onClick={download}>Esporta analisi per PDF</button></section>}
    <details className="panel"><summary>Modello di gioco stagionale · {season??'stagione da verificare'}{model?` · v${model.version}`:' · da configurare'}</summary><p>Descrivilo una volta. Verrà riutilizzato nelle partite della stagione; ogni modifica approvata conserva la versione precedente.</p>{models.length>1&&<label>Modello della stagione<select value={selectedModel?.id??''} disabled={busy} onChange={e=>void act(async()=>{const r=await db.from('tactical_season_settings').upsert({season_label:season,model_id:e.target.value,updated_by:await actor()});check(r.error);})}><option value="">Scegli una volta</option>{models.map((m:Row)=><option value={m.id} key={m.id}>{m.title}</option>)}</select></label>}<label>Comportamenti attesi, condizioni ed eccezioni<textarea value={modelText} onChange={e=>setModelText(e.target.value)} placeholder="Es. In costruzione bassa cerchiamo…; se l’avversario…"/></label><button disabled={busy||!modelText.trim()||!season} onClick={()=>void act(saveModel,'Modello stagionale approvato e memorizzato.')}>{model?'Approva modifica stagionale':'Approva modello stagionale'}</button></details>
    <details className="panel" onToggle={e=>setShowAdvanced(e.currentTarget.open)}><summary>Strumenti facoltativi · video, piano specifico, episodi e allenamenti</summary><p>Aprili quando hai evidenze da approfondire. Nessuno di questi moduli è necessario per generare la bozza.</p>{showAdvanced&&<ViceallenatoreClient key={matchId} initialMatchId={matchId} matches={matches.filter(m=>m.match_id===matchId)} matchError={null}/>}</details>
    </>}
  </main>;
}
function DraftPoint({item,review,busy,onReview}:{item:DraftItem;review?:Row;busy:boolean;onReview:(verdict:string,text:string,note:string)=>void}) {
  const [editing,setEditing]=useState(false);const [value,setValue]=useState(item.text);const [note,setNote]=useState('');
  const dismissed=review?.verdict==='dismissed';
  return <article className={`vaCard vaDraftPoint ${dismissed?'vaDismissed':''}`}><small>{item.type} · {review?({accepted:item.type==='ipotesi'?'verifica da svolgere':'verificato',corrected:'corretto dallo staff',dismissed:'scartato'}[review.verdict as string]):item.requires_review?'da revisionare':item.type==='osservazione'?'documentato dalla fonte':'bozza da regole trasparenti'}</small><p>{review?.verdict==='corrected'?review.corrected_text:item.text}</p><details><summary>Fonti e storia</summary>{item.sources.map(s=><p key={s}><small>{s}</small></p>)}{review&&<p>Testo originale: {item.text}<br/>Verifica: {review.created_at} · {review.note}</p>}</details>
    {!review&&item.requires_review&&<>{item.options?.length ? item.options.map(option=><button key={option.value} disabled={busy} onClick={()=>onReview('corrected',`Primo gol consolidato dallo staff al ${option.value}′. ${item.text}`,`Scelta verificata: ${option.label}.`)}>Consolida a {option.label}</button>) : <button disabled={busy} onClick={()=>onReview('accepted','',item.important?'Ipotesi mantenuta come verifica da svolgere, non come fatto accertato.':'Dato verificato dallo staff.')}>{item.important?'Mantieni tra le verifiche':'Conferma'}</button>}<button disabled={busy} onClick={()=>onReview('dismissed','','Escluso dalla bozza dallo staff.')}>Scarta</button></>}
    <button disabled={busy} onClick={()=>{setEditing(!editing);setValue(review?.corrected_text??item.text);}}>Correggi</button>{editing&&<div><label>Correzione<textarea value={value} onChange={e=>setValue(e.target.value)}/></label><input aria-label="Nota facoltativa" placeholder="Nota facoltativa" value={note} onChange={e=>setNote(e.target.value)}/><button disabled={busy||!value.trim()} onClick={()=>{onReview('corrected',value,note);setEditing(false);}}>Salva correzione</button></div>}
  </article>;
}
