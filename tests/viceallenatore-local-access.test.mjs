import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
let source=fs.readFileSync(new URL('../lib/viceallenatore/local-server.ts',import.meta.url),'utf8');
source=source.replace("import 'server-only';",'').replace(/import \{ createClient \} from [^;]+;/,`const createClient=async()=>globalThis.__cornerAuth;`);
const {localStaff,safeAsset}=await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`);
const request=(origin='http://localhost:3002',method='GET',from)=>({nextUrl:new URL(origin),method,headers:new Headers(from?{origin:from}:{})});
function auth(role='STAFF',active=true,user=true){globalThis.__cornerAuth={auth:{async getUser(){return {data:{user:user?{id:'staff-user'}:null}};}},from(){return {select(){return this;},eq(){return this;},async maybeSingle(){return {data:{ruolo:role,attivo:active}};}};}};}
test('local CV requires an active authenticated staff session',async()=>{
 auth();assert.equal(await localStaff(request()),'staff-user');
 auth('GIOCATORE');await assert.rejects(localStaff(request()),/FORBIDDEN/);
 auth('STAFF',false);await assert.rejects(localStaff(request()),/FORBIDDEN/);
 auth('STAFF',true,false);await assert.rejects(localStaff(request()),/UNAUTHENTICATED/);
});
test('cloud execution and cross-origin mutations are blocked',async()=>{
 auth();await assert.rejects(localStaff(request('https://analytics.example')),/LOCAL_ONLY/);
 await assert.rejects(localStaff(request('http://localhost:3002','POST','https://other.example')),/FORBIDDEN/);
 assert.equal(await localStaff(request('http://localhost:3002','POST','http://localhost:3002')),'staff-user');
 const previous=process.env.VERCEL;process.env.VERCEL='1';try{await assert.rejects(localStaff(request()),/LOCAL_ONLY/);}finally{if(previous===undefined)delete process.env.VERCEL;else process.env.VERCEL=previous;}
});
test('private media rejects traversal and arbitrary originals before filesystem access',async()=>{
 await assert.rejects(safeAsset('M1','../../.env.local'),/non consentito/);
 await assert.rejects(safeAsset('M1','manifest.sqlite3'),/non consentito/);
 await assert.rejects(safeAsset('M1','corners/event-any/../../../../file.jpg'),/non consentito/);
});
