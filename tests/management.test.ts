import{test}from'node:test';import assert from'node:assert/strict';import{mkdtemp,rm}from'node:fs/promises';import{tmpdir}from'node:os';import{join}from'node:path';import{createApp}from'../server/app.js';
const capture={schemaVersion:1,title:'元の画面名',sourceUrl:'https://example.test/users',baseUrl:'https://example.test/',viewport:{width:1280,height:900},html:'<html><body><h1 data-cn-id="heading">元の内容</h1></body></html>',stylesheets:[],resourceUrls:[],resources:[],warnings:[],capturedAt:new Date().toISOString()};
test('screen rename/trash/restore records new revisions while history and latest AI snapshot survive restart',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'cn-manage-'));let app=await createApp({dataDir:dir,aiRunner:async req=>({summary:'AI編集',replacements:req.scopes.map(s=>({targetId:s.id,html:s.html.replace('元の内容','AI編集後')}))})});
 const request=(method:any,url:string,payload?:any)=>app.inject({method,url,payload});
 try{
 const p=(await request('POST','/api/proposals',{title:'管理テスト'})).json();const base='/api/proposals/'+p.id;
 const screen=(await request('POST',base+'/captures',capture)).json();const original=(await request('GET',base+'/revisions')).json()[0];
 const started=(await request('POST',base+'/edits',{screenId:screen.id,baseRevisionId:original.id,selectedIds:['heading'],prompt:'内容変更'})).json();let job;for(let i=0;i<100;i++){job=(await request('GET','/api/edits/'+started.id)).json();if(job.status==='ready')break;await new Promise(r=>setTimeout(r,10));}assert.equal(job.status,'ready');
 assert.equal((await request('DELETE',base+'/screens/'+screen.id)).statusCode,409);
 await request('POST','/api/edits/'+job.id+'/accept',{});
 assert.equal((await request('PATCH',base+'/screens/'+screen.id,{title:'変更後の画面名'})).statusCode,200);
 const beforeDelete=(await request('GET',base)).json();assert.equal(beforeDelete.screens[0].title,'変更後の画面名');const latest=beforeDelete.screens[0].snapshotId;assert.notEqual(latest,screen.snapshotId);
 const earliest=(await request('GET',base+'/revisions/'+original.id)).json();assert.equal(earliest.screens[0].title,'元の画面名');assert.equal(earliest.screens[0].snapshotId,screen.snapshotId);
 assert.equal((await request('DELETE',base+'/screens/'+screen.id)).statusCode,200);assert.equal((await request('GET',base)).json().screens.length,0);
 assert.deepEqual((await request('GET',base+'/revisions/'+original.id)).json(),earliest);
 const trash=(await request('GET','/api/trash')).json();assert.equal(trash.screens[0].id,screen.id);
 const deletedRevision=(await request('GET',base+'/revisions')).json()[0];assert.equal(deletedRevision.screenCount,0);
 await app.close();app=await createApp({dataDir:dir});
 assert.equal((await request('POST',base+'/screens/'+screen.id+'/restore',{})).statusCode,200);const restored=(await request('GET',base)).json();assert.equal(restored.screens[0].snapshotId,latest);assert.equal(restored.screens[0].title,'変更後の画面名');assert.match((await request('GET','/api/snapshots/'+latest)).body,/AI編集後/);
 assert.equal((await request('POST',base+'/screens/'+screen.id+'/restore',{})).statusCode,409);
 assert.deepEqual((await request('GET',base+'/revisions/'+original.id)).json(),earliest);
 assert.equal((await request('GET',base+'/revisions/'+deletedRevision.id)).json().screens.length,0);
 }finally{await app.close();await rm(dir,{recursive:true,force:true});}
});
test('proposal trash preserves its identity, head, screen trash and history; wrong-parent operations fail',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'cn-trash-'));const app=await createApp({dataDir:dir});const r=(method:any,url:string,payload?:any)=>app.inject({method,url,payload});
 try{const p=(await r('POST','/api/proposals',{title:'変更前'})).json(),q=(await r('POST','/api/proposals',{title:'別の変更案'})).json(),base='/api/proposals/'+p.id;
 const s=(await r('POST',base+'/captures',capture)).json();assert.equal((await r('PATCH','/api/proposals/'+q.id+'/screens/'+s.id,{title:'不正'})).statusCode,404);
 assert.equal((await r('PATCH',base,{title:'名前変更済み'})).statusCode,200);assert.equal((await r('PATCH',base,{title:'  '})).statusCode,400);
 await r('DELETE',base+'/screens/'+s.id);const d=(await r('GET',base)).json();const revisions=(await r('GET',base+'/revisions')).json();
 assert.equal((await r('DELETE',base)).statusCode,200);assert.equal((await r('GET',base)).statusCode,404);assert.ok(!(await r('GET','/api/proposals')).json().some((x:any)=>x.id===p.id));assert.equal((await r('GET','/api/trash')).json().proposals[0].title,'名前変更済み');assert.equal((await r('GET','/api/trash')).json().screens.length,0);
 assert.equal((await r('POST',base+'/screens/'+s.id+'/restore',{})).statusCode,404);await r('POST',base+'/restore',{});assert.deepEqual((await r('GET',base)).json().screens,d.screens);assert.equal((await r('GET',base)).json().proposal.headRevisionId,d.proposal.headRevisionId);assert.deepEqual((await r('GET',base+'/revisions')).json(),revisions);assert.equal((await r('GET','/api/trash')).json().screens[0].id,s.id);
 await r('POST',base+'/screens/'+s.id+'/restore',{});assert.equal((await r('GET',base)).json().screens.length,1);
 await r('DELETE',base);await r('DELETE','/api/proposals/'+q.id);assert.deepEqual((await r('GET','/api/proposals')).json(),[]);assert.equal((await r('GET','/api/trash')).json().proposals.length,2);await r('POST',base+'/restore',{});assert.equal((await r('GET','/api/proposals')).json().length,1);
 }finally{await app.close();await rm(dir,{recursive:true,force:true});}
});

test('legacy database migration preserves existing screens, history and names across repeated opens',async()=>{
 const {DatabaseSync}=await import('node:sqlite');const {SqliteRepository}=await import('../server/repository.js');const dir=await mkdtemp(join(tmpdir(),'cn-legacy-'));const path=join(dir,'old.sqlite');const db=new DatabaseSync(path);
 db.exec(`CREATE TABLE proposals(id TEXT PRIMARY KEY,title TEXT,createdAt TEXT,updatedAt TEXT,headRevisionId TEXT);CREATE TABLE snapshots(id TEXT PRIMARY KEY,html TEXT);CREATE TABLE screens(id TEXT PRIMARY KEY,proposalId TEXT,title TEXT,sourceUrl TEXT,snapshotId TEXT,width INTEGER,height INTEGER,createdAt TEXT,assetCount INTEGER,warnings TEXT);CREATE TABLE revisions(id TEXT PRIMARY KEY,proposalId TEXT,parentId TEXT,createdAt TEXT,reason TEXT);CREATE TABLE revision_screens(revisionId TEXT,screenId TEXT,snapshotId TEXT,position INTEGER,PRIMARY KEY(revisionId,screenId));INSERT INTO proposals VALUES('p','旧変更案','now','now','r');INSERT INTO snapshots VALUES('snap','<h1>既存内容</h1>');INSERT INTO screens VALUES('s','p','旧画面','https://example.test/','snap',1280,900,'now',0,'[]');INSERT INTO revisions VALUES('r','p',NULL,'now','画面を追加');INSERT INTO revision_screens VALUES('r','s','snap',0);`);db.close();let repo=new SqliteRepository(path);
 try{assert.equal(repo.detail('p')!.screens[0].title,'旧画面');repo.renameScreen('p','s','新画面');assert.equal(repo.revision('p','r')!.screens[0].title,'旧画面');repo.trashScreen('p','s');assert.equal(repo.revision('p','r')!.screens[0].title,'旧画面');repo.close();repo=new SqliteRepository(path);repo.restoreScreen('p','s');assert.equal(repo.detail('p')!.screens[0].title,'新画面');assert.equal(repo.snapshot('snap')!.html,'<h1>既存内容</h1>');assert.equal(repo.revision('p','r')!.screens[0].title,'旧画面');}finally{repo.close();await rm(dir,{recursive:true,force:true});}
});
test('management UI client can delete and restore with Fastify JSON parsing enabled',async()=>{
 const{manageApi}=await import('../src/management-api.js');const dir=await mkdtemp(join(tmpdir(),'cn-management-client-'));const app=await createApp({dataDir:dir});const prior=globalThis.fetch;
 try{globalThis.fetch=(async(input:any,options:any)=>{const response=await app.inject({method:options.method,url:String(input),headers:options.headers,payload:options.body});return new Response(response.body,{status:response.statusCode});})as any;
 const p=(await app.inject({method:'POST',url:'/api/proposals',payload:{title:'クライアント境界'}})).json();const base='/proposals/'+p.id;
 await manageApi(base,'DELETE');assert.equal((await app.inject('/api/proposals/'+p.id)).statusCode,404);await manageApi(base+'/restore','POST');assert.equal((await app.inject('/api/proposals/'+p.id)).statusCode,200);
 }finally{globalThis.fetch=prior;await app.close();await rm(dir,{recursive:true,force:true});}
});
