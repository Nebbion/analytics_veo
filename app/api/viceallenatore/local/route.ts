import type { NextRequest } from 'next/server';
import { localStaff,runLocal,startScan,cancelScan,errorResponse } from '../../../../lib/viceallenatore/local-server';
import { createClient } from '../../../../lib/supabase/server';
import { playModel,readerRoster } from '../../../../lib/viceallenatore/play-model';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest) {
  try{
    await localStaff(request);const matchId=request.nextUrl.searchParams.get('match_id')??'';
    const play=request.nextUrl.searchParams.get('mode')==='play';
    const seasonal_model=play?await playModel(await createClient(),matchId):undefined;
    return Response.json(await runLocal({op:play?'play_prepare':'prepare',match_id:matchId,seasonal_model}),{headers:{'Cache-Control':'no-store'}});
  }catch(e){return errorResponse(e);}
}
export async function POST(request:NextRequest) {
  try{
    const staff=await localStaff(request);const text=await request.text();if(text.length>1024*1024)throw new Error('Richiesta troppo grande.');
    const payload=JSON.parse(text);if(typeof payload.match_id!=='string'||!payload.match_id||payload.match_id.length>200)throw new Error('Partita non valida.');
    if(payload.op==='cancel')return Response.json(await cancelScan(payload.match_id,payload.run_id));
    if(payload.op==='scan'){
      if(typeof payload.source_id!=='string'||!Number.isInteger(payload.start_ms)||payload.start_ms<0||payload.end_ms!==undefined&&(!Number.isInteger(payload.end_ms)||payload.end_ms<=payload.start_ms))throw new Error('Intervallo non valido.');
      const ready=await runLocal({op:'prepare',match_id:payload.match_id});
      if(!ready.videos.some((v:{id:string})=>v.id===payload.source_id))throw new Error('Video non registrato per questa partita.');
      return Response.json(await startScan(payload.match_id,payload.source_id,payload.start_ms,payload.end_ms),{status:202});
    }
    if(!['save_plan','event','review','play_save_plan','play_review','reader_read','reader_page','reader_review'].includes(payload.op))throw new Error('Operazione non supportata.');
    if(payload.op.startsWith('reader_')){
      const db=await createClient();await playModel(db,payload.match_id);
      const reader_roster=await readerRoster(db);
      return Response.json(await runLocal({...payload,reader_roster,reviewed_by:staff}),{headers:{'Cache-Control':'no-store'}});
    }
    const seasonal_model=payload.op.startsWith('play_')?await playModel(await createClient(),payload.match_id):undefined;
    return Response.json(await runLocal({...payload,seasonal_model,reviewed_by:staff}));
  }catch(e){return errorResponse(e);}
}
