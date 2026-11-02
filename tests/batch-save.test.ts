import {test} from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';import {randomUUID} from 'node:crypto';
import {createApp} from '../server/app.js';
const capture={schemaVersion:1,title:'一括取得',sourceUrl:'http://localhost/users',baseUrl:'http://localhost/',viewport:{width:1280,height:900},html:'<html><body><h1>一覧</h1></body></html>',stylesheets:[],resourceUrls:[],resources:[],warnings:[],capturedAt:new Date().toISOString()};
test('capture import ID prevents duplicate screens across parallel retries and server restart',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'cn-batch-'));let app=await createApp({dataDir:dir});
 try{
  const p=(await app.inject({method:'POST',url:'/api/proposals',payload:{title:'一括'}})).json(),key=randomUUID();
  const send=()=>app.inject({method:'POST',url:`/api/proposals/${p.id}/captures`,headers:{'Idempotency-Key':key},payload:capture});
  const results=await Promise.all([send(),send()]);assert.ok(results.every(r=>r.statusCode===201));assert.equal(results[0].json().id,results[1].json().id);
  assert.equal((await app.inject(`/api/proposals/${p.id}`)).json().screens.length,1);assert.equal((await app.inject(`/api/proposals/${p.id}/revisions`)).json().length,1);
  await app.close();app=await createApp({dataDir:dir});assert.equal((await send()).json().id,results[0].json().id);
  const other=(await app.inject({method:'POST',url:'/api/proposals',payload:{title:'別案'}})).json();const saved=await app.inject({method:'POST',url:`/api/proposals/${other.id}/captures`,headers:{'Idempotency-Key':key},payload:capture});assert.equal(saved.statusCode,201);assert.notEqual(saved.json().id,results[0].json().id);
  const mismatch=await app.inject({method:'POST',url:`/api/proposals/${p.id}/captures`,headers:{'Idempotency-Key':key},payload:{...capture,title:'別の内容'}});assert.equal(mismatch.statusCode,409);
 }finally{await app.close();await rm(dir,{recursive:true,force:true});}
});
test('malformed import IDs are rejected; single-screen capture without ID still creates distinct screens',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'cn-batch-validation-'));const app=await createApp({dataDir:dir});
 try{const p=(await app.inject({method:'POST',url:'/api/proposals',payload:{title:'test'}})).json();const url=`/api/proposals/${p.id}/captures`;
  assert.equal((await app.inject({method:'POST',url,headers:{'Idempotency-Key':'invalid'},payload:capture})).statusCode,400);
  const first=(await app.inject({method:'POST',url,payload:capture})).json(),second=(await app.inject({method:'POST',url,payload:capture})).json();assert.notEqual(first.id,second.id);
 }finally{await app.close();await rm(dir,{recursive:true,force:true});}
});
