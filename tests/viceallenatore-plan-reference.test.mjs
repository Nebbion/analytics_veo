import test from 'node:test';
import assert from 'node:assert/strict';
import {rosterCrosscheck,samePlanName,suggestTakerReference} from '../lib/viceallenatore/plan-reference.ts';

test('PDF names reuse canonical players across order, accents and captain markers',()=>{
 assert.equal(samePlanName('Corà Diego (VC)','Diego Cora'),true);
 assert.equal(samePlanName('Rossi Luca','Rossi Marco'),false);
 const result=rosterCrosscheck([{name:'Corà Diego (VC)',shirt_number:13}], [{player_id:'canonical',nome:'Diego Cora'}], [{player_id:'canonical',titolare:false}]);
 assert.equal(result[0].player_id,'canonical');assert.equal(result[0].in_lineup,true);
 assert.equal(result[0].is_starter,undefined);
});
test('ambiguous roster names do not become automatic player links',()=>{
 const players=[{player_id:'a',nome:'Rossi Luca'},{player_id:'b',nome:'Luca Rossi'}];
 const [person]=rosterCrosscheck([{name:'Rossi Luca'}],players,[]);
 assert.equal(person.ambiguous,true);assert.equal(person.player_id,null);
 const [missing]=rosterCrosscheck([{name:'Rossi Marco'}],players,[]);
 assert.equal(missing.linked,false);assert.equal(missing.in_lineup,null);
});
test('taker name correspondence is proposed only for an unambiguous source reference',()=>{
 const roster=[{name:'Rossi Luca'},{name:'Verdi Paolo'}];
 assert.equal(suggestTakerReference(['Rossi','Verdi'],'Luca Rossi',roster),'Rossi');
 assert.equal(suggestTakerReference(['Verdi'],'Luca Rossi',roster),'not_listed');
 assert.equal(suggestTakerReference(['Rossi'],'Luca Rossi',[...roster,{name:'Rossi Marco'}]),null);
 assert.equal(suggestTakerReference(['Rossi','Luca Rossi'],'Luca Rossi',roster),null);
});
