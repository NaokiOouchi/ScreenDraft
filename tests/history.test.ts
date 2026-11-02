import {test} from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {createApp} from '../server/app.js';import type {AiRunner} from '../server/ai.js';
const capture={schemaVersion:1,title:'ユーザー一覧',sourceUrl:'http://localhost/users',baseUrl:'http://localhost/',viewport:{width:1280,height:900},html:'<html><body><h1 data-cn-id="heading">一覧</h1><p>そのまま</p></body></html>',stylesheets:[],resourceUrls:[],resources:[],warnings:[],capturedAt:new Date().toISOString()};
test('proposal history is ordered, scoped, immutable and retains each screen snapshot across edits and restart',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'cn-history-'));let aiCalls=0;const aiRunner:AiRunner=async request=>{aiCalls++;return {summary:'見出しを変更',replacements:request.scopes.map(s=>({targetId:s.id,html:s.html.replace('一覧','変更後の一覧')}))};};let app=await createApp({dataDir:dir,aiRunner});
 try{
  const p=(await app.inject({method:'POST',url:'/api/proposals',payload:{title:'履歴比較'}})).json();
  assert.deepEqual((await app.inject(`/api/proposals/${p.id}/revisions`)).json(),[]);
  const first=(await app.inject({method:'POST',url:`/api/proposals/${p.id}/captures`,payload:capture})).json();
  const v1=(await app.inject(`/api/proposals/${p.id}/revisions`)).json()[0];assert.equal(v1.version,1);assert.equal(v1.screenCount,1);
  const second=(await app.inject({method:'POST',url:`/api/proposals/${p.id}/captures`,payload:{...capture,title:'設定'}})).json();
  const d=(await app.inject(`/api/proposals/${p.id}`)).json();
  const started=await app.inject({method:'POST',url:`/api/proposals/${p.id}/edits`,payload:{screenId:first.id,baseRevisionId:d.proposal.headRevisionId,selectedIds:['heading'],prompt:'見出しを変更'}});assert.equal(started.statusCode,202);
  let job;for(let i=0;i<100;i++){job=(await app.inject('/api/edits/'+started.json().id)).json();if(job.status==='ready')break;await new Promise(r=>setTimeout(r,10));}assert.equal(job.status,'ready');
  await app.inject({method:'POST',url:'/api/edits/'+job.id+'/accept',payload:{}});
  const versions=(await app.inject(`/api/proposals/${p.id}/revisions`)).json();assert.deepEqual(versions.map((r:any)=>r.version),[3,2,1]);assert.deepEqual(versions.map((r:any)=>r.screenCount),[2,2,1]);assert.equal(versions[0].reason,'見出しを変更');
  const earliest=(await app.inject(`/api/proposals/${p.id}/revisions/${v1.id}`)).json();assert.equal(earliest.screens.length,1);assert.equal(earliest.screens[0].snapshotId,first.snapshotId);assert.equal(earliest.screens.some((s:any)=>s.id===second.id),false,'later screen is explicitly absent from earliest revision');
  const middle=(await app.inject(`/api/proposals/${p.id}/revisions/${versions[1].id}`)).json();assert.equal(middle.screens[0].snapshotId,first.snapshotId);
  const latest=(await app.inject(`/api/proposals/${p.id}/revisions/${versions[0].id}`)).json();assert.equal(latest.screens[0].snapshotId,job.candidateSnapshotId);assert.equal(latest.screens[1].snapshotId,second.snapshotId);
  assert.match((await app.inject('/api/snapshots/'+latest.screens[0].snapshotId)).body,/変更後の一覧/);assert.doesNotMatch((await app.inject('/api/snapshots/'+first.snapshotId)).body,/変更後/);
  const other=(await app.inject({method:'POST',url:'/api/proposals',payload:{title:'別の変更案'}})).json();assert.equal((await app.inject(`/api/proposals/${other.id}/revisions/${v1.id}`)).statusCode,404);assert.equal((await app.inject(`/api/proposals/missing/revisions`)).statusCode,404);assert.equal((await app.inject(`/api/proposals/${p.id}/revisions/missing`)).statusCode,404);
  assert.equal(aiCalls,1,'history reads never invoke AI');assert.equal((await app.inject(`/api/proposals/${p.id}`)).json().proposal.headRevisionId,versions[0].id,'selecting a revision never moves current head');
  await app.close();app=await createApp({dataDir:dir,aiRunner});assert.deepEqual((await app.inject(`/api/proposals/${p.id}/revisions`)).json(),versions);assert.deepEqual((await app.inject(`/api/proposals/${p.id}/revisions/${v1.id}`)).json(),earliest);
 }finally{await app.close();await rm(dir,{recursive:true,force:true});}
});
