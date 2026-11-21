import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {stripTypeScriptTypes} from 'node:module';

let source=await fs.readFile(new URL('../app/api/viceallenatore/pdf/route.ts',import.meta.url),'utf8');
source=source.replace(/import \{ localStaff,mediaFolder,runLocal,errorResponse \} from [^;]+;/,'const {localStaff,mediaFolder,runLocal,errorResponse}=globalThis.__pdfDeps;')
 .replace(/import \{ createClient \} from [^;]+;/,'const createClient=async()=>({});')
 .replace(/import \{ playModel \} from [^;]+;/,'const playModel=async(db,id)=>{if(id!=="canonical")throw new Error("Partita non trovata");};');
let root,lastTarget,authorized=true,mode='success';
globalThis.__pdfDeps={
 localStaff:async()=>{if(!authorized)throw new Error('UNAUTHENTICATED');return 'staff';},
 mediaFolder:()=>root,
 runLocal:async payload=>{lastTarget=payload.path;if(mode==='failure')throw new Error('PDF non leggibile');return {id:'source',filename:'plan.pdf',retained_upload:mode!=='duplicate'};},
 errorResponse:error=>Response.json({error:error.message},{status:error.message==='UNAUTHENTICATED'?401:400}),
};
const {POST}=await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`);
function request(content='%PDF- synthetic fixture',id='canonical') {
 const data=new FormData();data.set('match_id',id);data.set('file',new File([content],'plan.pdf',{type:'application/pdf'}));
 return new Request('http://localhost:3002/api/viceallenatore/pdf',{method:'POST',headers:{'content-length':'1000'},body:data});
}

test('PDF upload checks authentication before reading file bytes',async()=>{
 authorized=false;let consumed=false;
 const response=await POST({headers:new Headers(),formData:async()=>{consumed=true;throw new Error('must not run');}});
 assert.equal(response.status,401);assert.equal(consumed,false);authorized=true;
});
test('invalid PDF and wrong canonical match are rejected before creating an upload',async()=>{
 lastTarget=undefined;
 assert.equal((await POST(request('not PDF'))).status,400);
 assert.equal((await POST(request('%PDF- fixture','unknown'))).status,400);
 assert.equal(lastTarget,undefined);
});
test('successful local import retains its registered copy; duplicate import removes only the new copy',async()=>{
 root=await fs.mkdtemp(path.join(os.tmpdir(),'va-upload-'));
 try {
  mode='success';assert.equal((await POST(request())).status,200);
  const original=lastTarget;assert.equal(await fs.readFile(original,'utf8'),'%PDF- synthetic fixture');
  mode='duplicate';assert.equal((await POST(request())).status,200);
  assert.notEqual(lastTarget,original);await assert.rejects(fs.access(lastTarget));
  assert.equal(await fs.readFile(original,'utf8'),'%PDF- synthetic fixture');
 } finally {await fs.rm(root,{recursive:true,force:true});}
});
test('failed import removes the newly created temporary copy',async()=>{
 root=await fs.mkdtemp(path.join(os.tmpdir(),'va-upload-'));
 try {mode='failure';assert.equal((await POST(request())).status,400);await assert.rejects(fs.access(lastTarget));}
 finally {await fs.rm(root,{recursive:true,force:true});mode='success';}
});
