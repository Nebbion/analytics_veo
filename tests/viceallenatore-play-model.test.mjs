import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
const moduleUrl=source=>`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`;
const draft=moduleUrl(fs.readFileSync(new URL('../lib/viceallenatore/draft.ts',import.meta.url),'utf8'));
const source=fs.readFileSync(new URL('../lib/viceallenatore/play-model.ts',import.meta.url),'utf8').replace("'./draft'",JSON.stringify(draft));
const {playModel}=await import(moduleUrl(source));
const db=(tables)=>({from(name){return {select(){return this;},eq(){return this;},async maybeSingle(){return {data:tables[name],error:null};},then(resolve){resolve({data:tables[name],error:null});}};}});
const model=(id,season='2026/2027')=>({id,season_label:season,tactical_model_versions:[{id:`${id}-approved`,version:1,status:'approved',snapshot:{description:'Principi già approvati'}},{id:`${id}-draft`,version:2,status:'draft'}]});
test('video review reuses the approved model for the canonical match season',async()=>{
 const result=await playModel(db({matches:{match_id:'M1',data:'2026-09-06'},tactical_models:[model('old','2025/2026'),model('current')],tactical_season_settings:null}),'M1');
 assert.equal(result.id,'current-approved');assert.equal(result.season_label,'2026/2027');
 assert.equal(result.snapshot.description,'Principi già approvati');
});
test('multiple models remain ambiguous until the season preference is known',async()=>{
 const tables={matches:{data:'2026-09-06'},tactical_models:[model('a'),model('b')],tactical_season_settings:null};
 assert.equal(await playModel(db(tables),'M1'),null);
 tables.tactical_season_settings={model_id:'b'};
 assert.equal((await playModel(db(tables),'M1')).id,'b-approved');
});
test('missing canonical match cannot acquire an unrelated model',async()=>{
 await assert.rejects(playModel(db({matches:null}),'unknown'),/Partita non trovata/);
});
