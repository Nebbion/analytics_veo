import test from 'node:test';
import assert from 'node:assert/strict';
import {cornerPointsForSide} from '../lib/viceallenatore/corner-sides.ts';
const plan=()=>({side_rule:{assignment_complete:true},points:[
 {id:'a',role_key:'same',sides:['left']},
 {id:'b',role_key:'same',sides:['right']},
 {id:'c',role_key:'shared',sides:['left','right']}
]});
test('UI shows mutually exclusive alternatives for the selected side',()=>{
 assert.deepEqual(cornerPointsForSide(plan(),'left').map(p=>p.id),['a','c']);
 assert.deepEqual(cornerPointsForSide(plan(),'right').map(p=>p.id),['b','c']);
 assert.deepEqual(cornerPointsForSide(plan(),''),[]);
});
test('incomplete assignments and simultaneous duplicate roles are not usable',()=>{
 const p=plan();p.points[1].sides=['left','right'];assert.deepEqual(cornerPointsForSide(p,'left'),[]);
 assert.equal(cornerPointsForSide(p,'right').length,2);
 p.side_rule.assignment_complete=false;assert.deepEqual(cornerPointsForSide(p,'right'),[]);
});
