import type { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { mkdir,writeFile,unlink } from 'node:fs/promises';
import path from 'node:path';
import { localStaff,mediaFolder,runLocal,errorResponse } from '../../../../lib/viceallenatore/local-server';
import { createClient } from '../../../../lib/supabase/server';
import { playModel } from '../../../../lib/viceallenatore/play-model';
export const runtime='nodejs';
const MAX=50*1024*1024;

export async function POST(request:NextRequest) {
  let target:string|undefined;
  try {
    await localStaff(request);
    const size=Number(request.headers.get('content-length'));
    if(!Number.isFinite(size)||size<=0||size>MAX+65536)throw new Error('PDF troppo grande: limite 50 MB.');
    const form=await request.formData(),file=form.get('file'),matchId=form.get('match_id');
    if(!(file instanceof File)||typeof matchId!=='string'||!matchId||matchId.length>200)throw new Error('PDF o partita non validi.');
    if(file.size>MAX||!file.name.toLowerCase().endsWith('.pdf'))throw new Error('Seleziona un PDF fino a 50 MB.');
    const bytes=Buffer.from(await file.arrayBuffer());
    if(bytes.subarray(0,5).toString()!=='%PDF-')throw new Error('Il file non è un PDF valido.');
    await playModel(await createClient(),matchId);
    const directory=path.join(mediaFolder(matchId),'uploads',randomUUID());await mkdir(directory,{recursive:true,mode:0o700});
    const name=path.basename(file.name).replace(/[^\p{L}\p{N}._ -]/gu,'_').slice(-150);
    target=path.join(directory,name);await writeFile(target,bytes,{mode:0o600});
    const result=await runLocal({op:'reader_import',match_id:matchId,path:target});
    // A duplicate import references the previous source; only its new temporary copy is removed.
    if(!result.retained_upload){await unlink(target);target=undefined;}
    return Response.json(result,{headers:{'Cache-Control':'no-store'}});
  } catch(error) {
    if(target)await unlink(target).catch(()=>{});
    return errorResponse(error);
  }
}
