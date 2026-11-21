import test from 'node:test';
import assert from 'node:assert/strict';
import {generateDraft,missingInputs,applicableModel,seasonForMatch,latestReview} from '../lib/viceallenatore/draft.ts';
import {extractReport,reportLines,reportMatchDate} from '../lib/viceallenatore/report-import.ts';
const base=()=>({match:{match_id:'M1',partita:'Villanovese - Montagnana',data:'2026-09-06'},players:[],stats:[],lineups:[],officialEvents:[],sources:[],reconciliations:[]});
const report=(id,provider,minute)=>({id,provider,kind:'mhtml',sha256:id,extracted_metadata:{goal_candidates:[{minute,stoppage:0,excerpt:`gol ${minute}`}],timeline_candidates:[{minute,excerpt:'Gol di Giocatore'}]}});
test('draft works without model, match plan, video or mandatory highlights',()=>{
  const items=generateDraft(base());
  assert.equal(items.length,1);assert.equal(items[0].type,'osservazione');assert.equal(items[0].requires_review,false);
  assert.ok(!items.some(i=>/TOP|FLOP|conformità/.test(i.text)));
});
test('existing Analytics data removes redundant file requests and chronology entry',()=>{
 const input={...base(),stats:[{player_id:'P1',tiri_totali:0}],lineups:[{player_id:'P1',titolare:true}],officialEvents:[{event_type:'GOL',minuto:13,player_id:'P1'}],players:[{player_id:'P1',nome:'Nome canonico'}],sources:[report('Y','youcoach',13)]};
 assert.equal(missingInputs(input).length,0);
 const items=generateDraft(input);assert.ok(items.some(i=>i.text.includes('Nome canonico')));assert.ok(!items.some(i=>i.key.startsWith('report-event:')));
 assert.ok(items.some(i=>i.text.includes('tiri totali: 0')));
});
test('missing metrics are not zero; interpretations and hypotheses never become facts',()=>{
 const input={...base(),stats:[{tiri_totali:null},{tiri_totali:3}],modelVersion:{id:'V1',version:1,snapshot:{principles:[{title:'Pressing'}]}}};
 const items=generateDraft(input);assert.ok(items.some(i=>i.text.includes('3 nelle 1/2')));
 assert.equal(items.find(i=>i.key==='interpretation:limits').type,'interpretazione');
 assert.equal(items.find(i=>i.key==='hypothesis:plan').type,'ipotesi');
 assert.equal(items.find(i=>i.key==='hypothesis:plan').requires_review,true);
});
test('conflict keeps originals and only reuses a matching reconciliation',()=>{
 const input={...base(),sources:[report('V','veo',12),report('Y','youcoach',13)]};
 const item=generateDraft(input).find(i=>i.key==='conflict:first_goal');
 assert.equal(item.requires_review,true);assert.ok(item.text.includes('12′'));assert.ok(item.text.includes('13′'));
 input.reconciliations=[{field_name:'first_goal_minute',source_a_id:'V',source_b_id:'Y',value_a:'12',value_b:'13',approved_value:'13',status:'approved',reason:'Staff'}];
 assert.equal(generateDraft(input).find(i=>i.key===item.key).requires_review,false);
 input.reconciliations[0].source_a_id='OTHER';assert.equal(generateDraft(input).find(i=>i.key===item.key).requires_review,true);
});
test('corrections survive regeneration of unchanged evidence and expire on changes',()=>{
 const item=generateDraft(base())[0];const review={item_key:item.key,evidence_key:item.evidence_key,created_at:'2026-11-20',verdict:'corrected',corrected_text:'Correzione'};
 assert.equal(latestReview(item,[review]),review);
 const changed=generateDraft({...base(),match:{...base().match,partita:'Altra gara'}})[0];assert.equal(latestReview(changed,[review]),undefined);
});
test('season model is reused automatically only when unambiguous',()=>{
 assert.equal(seasonForMatch(base().match),'2026/2027');
 const model={id:'M',season_label:'2026/2027',tactical_model_versions:[{id:'V1',version:1,status:'approved'},{id:'V2',version:2,status:'approved'}]};
 assert.equal(applicableModel([model],'2026/2027').id,'V2');assert.equal(applicableModel([model,{...model,id:'OTHER'}],'2026/2027'),null);
 assert.equal(applicableModel([model],'2025/2026'),null);
 assert.equal(applicableModel([{...model,season_label:'2026/27'}],'2026/2027').id,'V2');
});
test('match dates and UTF-8 survive MIME decoding for ambiguous match checks',()=>{
 assert.equal(reportMatchDate(['Squadra 6 set2026']),'2026-09-06');
 assert.equal(reportMatchDate(['06/09/2026 16:30']),'2026-09-06');
 const raw='Content-Type: text/html; charset=utf-8\r\n\r\n<p>Gol 13′ · qualità</p>';
 assert.deepEqual(reportLines(new TextEncoder().encode(raw)),['Gol 13′ · qualità']);
});
test('MHTML parser decodes MIME and never executes or exports scripts',()=>{
 const raw='MIME-Version: 1.0\r\nContent-Type: multipart/related; boundary="test"\r\n\r\n--test\r\nContent-Type: text/html; charset=utf-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n<div>Partita | YouCoach</div><script>Gol di FALSO 99=E2=80=B2</script><div>13\'</div><div>Gol di Giocatore</div>\r\n--test--';
 const lines=reportLines(new TextEncoder().encode(raw));assert.ok(!lines.join('').includes('FALSO'));
 const result=extractReport(lines);assert.equal(result.provider,'youcoach');assert.equal(result.metadata.goal_candidates[0].minute,13);
});
test('Veo scorecard and KPI columns stay separate and unverified',()=>{
 const result=extractReport(['Veo | Report della partita','Villanovese 3 - 1 Montagnana',"Jersey #7 (12')",'Panoramica','Numeri chiave di entrambe le squadre','Tiri totali','20','12']);
 assert.equal(result.metadata.goal_candidates[0].minute,12);assert.equal(result.metadata.kpi_candidates[0].second_value,'12');assert.equal(result.metadata.kpi_candidates[0].status,'candidate_unverified');
});
