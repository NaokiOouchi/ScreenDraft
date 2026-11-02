import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server/app';

test('警告の確認状態を保存し、新たな警告だけを未確認として扱う',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'sd-warning-review-'));let app=await createApp({dataDir:dir});
 try{
  const p=(await app.inject({method:'POST',url:'/api/proposals',payload:{title:'確認'}})).json();
  const base=`/api/proposals/${p.id}`,input={schemaVersion:1,title:'画面',sourceUrl:'https://example.com/',baseUrl:'https://example.com/',viewport:{width:800,height:600},html:'<html><body>画面</body></html>',stylesheets:[],resourceUrls:[],resources:[],warnings:['埋め込み画面は保存対象外です。'],capturedAt:new Date().toISOString()};
  const screen=(await app.inject({method:'POST',url:base+'/captures',payload:input})).json();
  const confirm=()=>app.inject({method:'POST',url:base+'/screens/'+screen.id+'/capture-review',payload:{snapshotId:screen.snapshotId}});
  assert.equal((await confirm()).statusCode,200);const reviewed=(await app.inject(base)).json();assert.equal(reviewed.screens[0].captureIssuesReviewed,true);assert.deepEqual(reviewed.screens[0].warnings,input.warnings);
  assert.equal((await app.inject(base+'/revisions')).json().length,1);
  await app.close();app=await createApp({dataDir:dir});assert.equal((await app.inject(base)).json().screens[0].captureIssuesReviewed,true);
  const same=(await app.inject({method:'POST',url:base+'/captures',payload:{...input,updateScreenId:screen.id,baseSnapshotId:screen.snapshotId}})).json();assert.equal((await app.inject(base)).json().screens[0].captureIssuesReviewed,true);
  assert.equal((await confirm()).statusCode,409);
  const added=(await app.inject({method:'POST',url:base+'/captures',payload:{...input,warnings:[...input.warnings,'新しい警告'],updateScreenId:screen.id,baseSnapshotId:same.snapshotId}})).json();assert.notEqual(added.snapshotId,same.snapshotId);assert.notEqual((await app.inject(base)).json().screens[0].captureIssuesReviewed,true);
  const archive=await app.inject(base+'/archive');assert.equal(archive.statusCode,200,archive.body);
 }finally{await app.close();await rm(dir,{recursive:true,force:true});}
});
