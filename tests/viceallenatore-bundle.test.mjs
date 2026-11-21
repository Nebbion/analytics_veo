import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
// Compile the real importer for Node without changing the Next.js JSON import route.
const schema=JSON.parse(fs.readFileSync(new URL('../docs/viceallenatore/event-contract.json',import.meta.url),'utf8'));
const source=fs.readFileSync(new URL('../lib/viceallenatore/bundle.ts',import.meta.url),'utf8').replace(/import eventContract from [^;]+;/,`const eventContract=${JSON.stringify(schema)};`);
const js=stripTypeScriptTypes(source);
const {importTacticalBundle}=await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
function fakeDb() {
 const tables={analysis_sources:[],match_tactical_events:[],tactical_claims:[],claim_evidence:[],event_evidence:[]};
 let writes=0;
 const db={from(table){let filters=[],action=null,row,options,single=false;const q={
  select(){return q;},eq(k,v){filters.push([k,v]);return q;},single(){single=true;return q;},
  insert(r){action='insert';row=r;return q;},upsert(r,o){action='upsert';row=r;options=o;return q;},
  then(resolve,reject){try{
    const rows=tables[table];if(!rows) throw new Error(table);
    if(action){const keys=(options?.onConflict??'id').split(',');const existing=rows.find(x=>keys.every(k=>x[k]===row[k]));
      if(existing){assert.equal(options?.ignoreDuplicates,true,'must never overwrite reviewed history');}
      else{writes++;rows.push({...row});}}
    const result=rows.filter(x=>filters.every(([k,v])=>x[k]===v));return Promise.resolve({data:single?result[0]:result,error:null}).then(resolve,reject);
  }catch(error){return Promise.reject(error).then(resolve,reject);}}
 };return q;}};
 return {db,tables,get writes(){return writes;}};
}
function bundle(){
 const sid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',eid='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',cid='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
 return {schema_version:'1.0.0',match_id:'M1',sources:[{id:sid,match_id:'M1',provider:'veo',kind:'video',filename:'video.mp4',sha256:'a'.repeat(64),metadata:{}},{id:cid,match_id:'M1',provider:'staff',kind:'clip',filename:'clip.mp4',sha256:'b'.repeat(64),metadata:{origin_source_id:sid,start_ms:100,end_ms:200}}],events:[{schema_version:'1.0.0',event_id:eid,match_id:'M1',season_id:null,period:'first_half',video_start_ms:100,video_end_ms:200,game_clock:{minute:null,stoppage:null,mapping_verified:false},event_type:'other',phase:'unknown',team_id:null,player_ids:[],observability:'observable',relevance:'undetermined',source_refs:[{source_id:sid,kind:'video',start_ms:100,end_ms:200}],principle_ref:null,claims:[{type:'osservazione',text:'Evento di prova',review_status:'proposed',confidence:'unknown'}],assessment:{plan_compliance:'non_valutabile',technical_quality:'non_valutabile',review_status:'proposed'},sync:{origin:'local',revision:1}}]};
}
test('bundle retry preserves reviewed claims and append-only evidence with stale UI state',async()=>{
 const f=fakeDb(),b=bundle();await importTacticalBundle(b,f.db,'actor','M1',[],[]);
 f.tables.tactical_claims[0].review_status='reviewed';const count=f.writes;
 await importTacticalBundle(b,f.db,'actor','M1',[],[]);
 assert.equal(f.writes,count);assert.equal(f.tables.tactical_claims[0].review_status,'reviewed');assert.equal(f.tables.event_evidence.length,1);
});
test('wrong match and invalid event fail before any write',async()=>{
 const f=fakeDb();await assert.rejects(importTacticalBundle(bundle(),f.db,'actor','OTHER',[],[]));assert.equal(f.writes,0);
 const b=bundle();b.events[0].video_end_ms=0;await assert.rejects(importTacticalBundle(b,f.db,'actor','M1',[],[]));assert.equal(f.writes,0);
});
