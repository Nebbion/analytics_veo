import 'server-only';
import { createHash,randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir,open,readFile,realpath,unlink,writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { NextRequest } from 'next/server';
import { createClient } from '../supabase/server';

export const engine=path.join(process.cwd(),'local_engine/corner_engine.py');
export const python=path.join(process.cwd(),'local_engine/.venv/bin/python');
export function mediaFolder(matchId:string) {
  if(!matchId||matchId.length>200)throw new Error('Partita non valida.');
  return path.join(process.cwd(),'data/local/matches',createHash('sha256').update(matchId).digest('hex').slice(0,24));
}
export async function localStaff(request:NextRequest) {
  if(process.env.VERCEL || !['localhost','127.0.0.1','[::1]'].includes(request.nextUrl.hostname)) throw new Error('LOCAL_ONLY');
  const db=await createClient();const {data:{user}}=await db.auth.getUser();
  if(!user)throw new Error('UNAUTHENTICATED');
  const {data:profile}=await db.from('utenti').select('ruolo,attivo').eq('id',user.id).maybeSingle();
  if(!profile?.attivo||profile.ruolo!=='STAFF')throw new Error('FORBIDDEN');
  if(request.method==='POST'&&request.headers.get('origin')!==request.nextUrl.origin)throw new Error('FORBIDDEN');
  return user.id;
}
export function runLocal(payload:Record<string,unknown>,timeout=150000):Promise<any> {
  return new Promise((resolve,reject)=>{
    const child=spawn(python,[engine,'api'],{cwd:process.cwd(),stdio:['pipe','pipe','pipe']});
    let out='',err='';const timer=setTimeout(()=>{child.kill();reject(new Error('Elaborazione non terminata: prova un episodio più breve.'));},timeout);
    child.stdout.on('data',d=>{out+=d.toString();if(out.length>32*1024*1024)child.kill();});
    child.stderr.on('data',d=>{err=(err+d.toString()).slice(-4000);});
    child.on('error',e=>{clearTimeout(timer);reject(e);});
    child.on('close',()=>{clearTimeout(timer);try{const result=JSON.parse(out);if(result.error)reject(new Error(result.error));else resolve(result);}catch{reject(new Error(err||'Motore locale non disponibile.'));}});
    child.stdin.end(JSON.stringify(payload));
  });
}
export async function startScan(matchId:string,sourceId:string,startMs:number,endMs?:number) {
  const base=path.join(mediaFolder(matchId),'corners');await mkdir(base,{recursive:true});
  const lock=path.join(base,'active-scan.lock');let handle;
  try{handle=await open(lock,'wx');}catch{throw new Error('Una ricerca è già in corso per questa partita.');}
  const id=randomUUID();const job=path.join(base,`run-${id}`);await mkdir(job);
  await handle.writeFile(id);await handle.close();
  await writeFile(path.join(job,'state.json'),JSON.stringify({id,match_id:matchId,source_id:sourceId,created_at:Date.now()/1000,status:'starting',progress:0,frames:[],candidates:[]}));
  const args=[engine,'scan','--match-id',matchId,'--source-id',sourceId,'--run-id',id,'--start-ms',String(startMs)];
  if(endMs!==undefined)args.push('--end-ms',String(endMs));
  const log=await open(path.join(job,'process.log'),'a');
  const child=spawn(python,args,{cwd:process.cwd(),detached:true,stdio:['ignore',log.fd,log.fd]});
  child.on('error',()=>{void unlink(lock).catch(()=>{});});
  child.on('close',()=>{void unlink(lock).catch(()=>{});});
  child.unref();await log.close();return {id,status:'starting'};
}
export async function cancelScan(matchId:string,runId:string) {
  if(!/^[a-f0-9-]{36}$/.test(runId))throw new Error('Ricerca non valida.');
  const job=path.join(mediaFolder(matchId),'corners',`run-${runId}`);
  const state=JSON.parse(await readFile(path.join(job,'state.json'),'utf8'));
  if(state.match_id!==matchId)throw new Error('Ricerca di un’altra partita.');
  await writeFile(path.join(job,'cancel'),'1');return {status:'cancelling'};
}
export async function safeAsset(matchId:string,relative:string) {
  if(!/^(?:corners\/(?:(?:plan|reader)-[a-f0-9-]+\.png|(?:run|event)-[a-f0-9-]+\/frame-\d+\.jpg)|clip-[a-f0-9-]+-\d+-\d+\.mp4)$/.test(relative))throw new Error('File non consentito.');
  const base=await realpath(mediaFolder(matchId));const file=await realpath(path.join(base,relative));
  if(!file.startsWith(base+path.sep))throw new Error('File non consentito.');
  return file;
}
export function errorResponse(error:unknown) {
  const message=error instanceof Error?error.message:String(error);
  const status=message==='UNAUTHENTICATED'?401:message==='FORBIDDEN'?403:message==='LOCAL_ONLY'?409:400;
  return Response.json({error:message==='LOCAL_ONLY'?'L’analisi video funziona sull’app avviata sul Mac.':message},{status});
}
