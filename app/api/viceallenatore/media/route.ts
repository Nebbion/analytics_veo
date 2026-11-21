import type { NextRequest } from 'next/server';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { localStaff,safeAsset,errorResponse } from '../../../../lib/viceallenatore/local-server';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest) {
  try{
    await localStaff(request);const file=await safeAsset(request.nextUrl.searchParams.get('match_id')??'',request.nextUrl.searchParams.get('file')??'');
    const {size}=await stat(file);const headers:Record<string,string>={'Content-Type':file.endsWith('.mp4')?'video/mp4':file.endsWith('.png')?'image/png':'image/jpeg','Cache-Control':'private, no-store','Accept-Ranges':'bytes','X-Content-Type-Options':'nosniff'};
    const range=request.headers.get('range');let start=0,end=size-1,status=200;
    if(range){const match=/^bytes=(\d+)-(\d*)$/.exec(range);if(!match)return new Response(null,{status:416});start=Number(match[1]);end=match[2]?Math.min(Number(match[2]),size-1):size-1;if(start>end||start>=size)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${size}`}});status=206;headers['Content-Range']=`bytes ${start}-${end}/${size}`;}
    headers['Content-Length']=String(end-start+1);
    return new Response(Readable.toWeb(createReadStream(file,{start,end})) as ReadableStream,{status,headers});
  }catch(e){return errorResponse(e);}
}
