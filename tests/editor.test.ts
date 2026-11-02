import {test} from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {createApp} from '../server/app.js';import type {AiRunner} from '../server/ai.js';import {editContext,applyEdit} from '../server/editing.js';import {editorPreview} from '../server/preview.js';
const html='<html><head></head><body><h1 data-cn-id="heading">ユーザー一覧</h1><table data-cn-id="table"><thead data-cn-id="head"><tr data-cn-id="hr"><th data-cn-id="name">氏名</th><th data-cn-id="email">メール</th></tr></thead><tbody data-cn-id="body"><tr data-cn-id="row"><td data-cn-id="a">山田</td><td data-cn-id="b">hana@example.com</td></tr></tbody></table><p data-cn-id="outside">変更しない</p></body></html>';
const payload={schemaVersion:1,title:'一覧',sourceUrl:'http://localhost/users',baseUrl:'http://localhost/',viewport:{width:1280,height:900},html,stylesheets:[],resourceUrls:[],resources:[],warnings:[],capturedAt:new Date().toISOString()};
const store={put:async()=>{},get:async()=>Buffer.from('')};
test('cell selection expands scope to table; selected DOM only; executable/duplicate/outside edits rejected',async()=>{
 const {scopes}=editContext(html,['email']);assert.equal(scopes[0].id,'table');assert.match(scopes[0].html,/hana@example.com/);assert.doesNotMatch(scopes[0].html,/変更しない/);
 const result={summary:'性別列を追加',replacements:[{targetId:'table',html:scopes[0].html.replace('</tr></thead>','<th>性別</th></tr></thead>').replace('</tr></tbody>','<td>未回答</td></tr></tbody>')}]};
 const next=await applyEdit(html,scopes,result,store,()=>false);assert.match(next,/性別/);assert.match(next,/未回答/);assert.match(next,/<p data-cn-id="outside">変更しない/);
 await assert.rejects(()=>applyEdit(html,scopes,{summary:'bad',replacements:[{targetId:'outside',html:'<p>bad</p>'}]},store,()=>false),/選択範囲外/);
 await assert.rejects(()=>applyEdit(html,scopes,{summary:'bad',replacements:[{targetId:'table',html:'<table data-cn-id="table" onclick="x()"><tr><td>X</td></tr></table>'}]},store,()=>false),/許可されない/);
 await assert.rejects(()=>applyEdit(html,scopes,{summary:'bad',replacements:[{targetId:'table',html:'<table data-cn-id="table"><tr><td data-cn-id="outside">X</td></tr></table>'}]},store,()=>false),/重複/);
 const preview=editorPreview(html,'channel');assert.match(preview.csp,/sandbox allow-scripts/);assert.doesNotMatch(preview.csp,/unsafe-eval|script-src 'unsafe-inline'|allow-same-origin/);assert.match(preview.html,/postMessage/);
});
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function waitReady(app:Awaited<ReturnType<typeof createApp>>,id:string){for(let i=0;i<100;i++){const j=(await app.inject('/api/edits/'+id)).json();if(!['queued','running'].includes(j.status))return j;await sleep(10);}throw new Error('timeout');}
test('job candidate, discard, accept, immutable old snapshot, other-screen preservation, restart recovery and conflicts',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'cn-editor-'));const runner:AiRunner=async request=>({summary:'一覧に性別を追加',replacements:request.scopes.map(s=>({targetId:s.id,html:s.html.replace('</tr></thead>','<th>性別</th></tr></thead>').replace('</tr></tbody>','<td>未回答</td></tr></tbody>')}))});let app=await createApp({dataDir:dir,aiRunner:runner});
 try{
 const proposal=(await app.inject({method:'POST',url:'/api/proposals',payload:{title:'複数画面'}})).json();const screen=(await app.inject({method:'POST',url:`/api/proposals/${proposal.id}/captures`,payload})).json();
 const second=(await app.inject({method:'POST',url:`/api/proposals/${proposal.id}/captures`,payload:{...payload,title:'設定'}})).json();let detail=(await app.inject(`/api/proposals/${proposal.id}`)).json();
 const start=()=>app.inject({method:'POST',url:`/api/proposals/${proposal.id}/edits`,payload:{screenId:screen.id,baseRevisionId:detail.proposal.headRevisionId,selectedIds:['email'],prompt:'性別を追加'}});
 let response=await start();assert.equal(response.statusCode,202,response.body);let job=await waitReady(app,response.json().id);assert.equal(job.status,'ready',job.error);await app.close();app=await createApp({dataDir:dir,aiRunner:runner});assert.equal((await app.inject('/api/edits/'+job.id)).json().status,'ready');assert.match((await app.inject('/api/snapshots/'+job.candidateSnapshotId)).body,/性別/);assert.equal((await app.inject(`/api/proposals/${proposal.id}`)).json().screens[0].snapshotId,screen.snapshotId);
 assert.equal((await app.inject({method:'POST',url:'/api/edits/'+job.id+'/cancel',payload:{}})).json().status,'discarded');
 response=await start();job=await waitReady(app,response.json().id);assert.equal((await app.inject({method:'POST',url:'/api/edits/'+job.id+'/accept',payload:{}})).statusCode,200);
 detail=(await app.inject(`/api/proposals/${proposal.id}`)).json();assert.equal(detail.screens[0].snapshotId,job.candidateSnapshotId);assert.equal(detail.screens[1].snapshotId,second.snapshotId);assert.doesNotMatch((await app.inject('/api/snapshots/'+screen.snapshotId)).body,/性別/);
 await app.close();app=await createApp({dataDir:dir,aiRunner:runner});assert.equal((await app.inject(`/api/proposals/${proposal.id}`)).json().screens[0].snapshotId,job.candidateSnapshotId);
 response=await start();job=await waitReady(app,response.json().id);await app.inject({method:'POST',url:`/api/proposals/${proposal.id}/captures`,payload:{...payload,title:'追加画面'}});assert.equal((await app.inject({method:'POST',url:'/api/edits/'+job.id+'/accept',payload:{}})).statusCode,200);
 }finally{await app.close();await rm(dir,{recursive:true,force:true});}
});
test('cancellation and restart do not apply unfinished AI edits',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'cn-cancel-'));const runner:AiRunner=async(_,signal)=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted'))));let app=await createApp({dataDir:dir,aiRunner:runner});
 try{const p=(await app.inject({method:'POST',url:'/api/proposals',payload:{title:'cancel'}})).json();const s=(await app.inject({method:'POST',url:`/api/proposals/${p.id}/captures`,payload})).json();const detail=(await app.inject(`/api/proposals/${p.id}`)).json();const start=()=>app.inject({method:'POST',url:`/api/proposals/${p.id}/edits`,payload:{screenId:s.id,baseRevisionId:detail.proposal.headRevisionId,selectedIds:['heading'],prompt:'変更'}});
 let job=(await start()).json();assert.equal((await app.inject({method:'POST',url:`/api/edits/${job.id}/cancel`,payload:{}})).json().status,'cancelled');job=(await start()).json();await app.close();app=await createApp({dataDir:dir,aiRunner:runner});assert.equal((await app.inject('/api/edits/'+job.id)).json().status,'failed');assert.equal((await app.inject(`/api/proposals/${p.id}`)).json().screens[0].snapshotId,s.snapshotId);
 }finally{await app.close();await rm(dir,{recursive:true,force:true});}
});
test('editing retains saved CSS and assets and keeps generated IDs stable across subsequent edits',async()=>{
 const asset='a'.repeat(64);const source=`<html><head><style>@layer theme{p{background:url(/api/assets/${asset})}}</style></head><body><p data-cn-id="p">旧内容<img data-cn-id="image" src="/api/assets/${asset}"></p><aside data-cn-id="s1">範囲外</aside><img data-cn-id="missing" src="data:,"></body></html>`;
 const {scopes}=editContext(source,['p']);const edited=await applyEdit(source,scopes,{summary:'追加',replacements:[{targetId:'p',html:`<p data-cn-id="p">新内容<span>追加</span><img data-cn-id="image" src="/api/assets/${asset}"></p>`}]},store,id=>id===asset);
 assert.match(edited,new RegExp('/api/assets/'+asset));assert.match(edited,/@layer theme/);assert.match(edited,/data-cn-id="missing" src="data:,"/);assert.match(edited,/<aside data-cn-id="s1">範囲外/);const generated=edited.match(/<span data-cn-id="([^"]+)">追加/)![1];assert.notEqual(generated,'s1');
 const again=await applyEdit(edited,editContext(edited,['p']).scopes,{summary:'再編集',replacements:[{targetId:'p',html:`<p data-cn-id="p">新内容<span>新規</span><span data-cn-id="${generated}">追加</span><img data-cn-id="image" src="/api/assets/${asset}"></p>`}]},store,id=>id===asset);
 const newer=again.match(/<span data-cn-id="([^"]+)">新規/)![1];assert.notEqual(newer,generated);assert.notEqual(newer,'s1');assert.ok(again.includes(`<span data-cn-id="${generated}">追加`));assert.match(again,/<aside data-cn-id="s1">範囲外/);
});
test('failed AI request leaves the screen unchanged and a new request can succeed',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'cn-failure-'));let attempts=0;const runner:AiRunner=async request=>{if(attempts++===0)throw new Error('一時的なAIエラー');return {summary:'再実行成功',replacements:request.scopes.map(s=>({targetId:s.id,html:s.html.replace('ユーザー一覧','メンバー一覧')}))};};const app=await createApp({dataDir:dir,aiRunner:runner});
 try{const p=(await app.inject({method:'POST',url:'/api/proposals',payload:{title:'retry'}})).json();const s=(await app.inject({method:'POST',url:`/api/proposals/${p.id}/captures`,payload})).json();const d=(await app.inject(`/api/proposals/${p.id}`)).json();const start=()=>app.inject({method:'POST',url:`/api/proposals/${p.id}/edits`,payload:{screenId:s.id,baseRevisionId:d.proposal.headRevisionId,selectedIds:['heading'],prompt:'メンバー一覧に変更'}});
 const failed=await waitReady(app,(await start()).json().id);assert.equal(failed.status,'failed');assert.match(failed.error,/一時的/);assert.equal((await app.inject(`/api/proposals/${p.id}`)).json().screens[0].snapshotId,s.snapshotId);const retried=await waitReady(app,(await start()).json().id);assert.equal(retried.status,'ready');assert.match((await app.inject('/api/snapshots/'+retried.candidateSnapshotId)).body,/メンバー一覧/);
 }finally{await app.close();await rm(dir,{recursive:true,force:true});}
});

test('CSS child combinators and nesting survive capture and repeated AI normalization',async()=>{
 const {normalizeCapture}=await import('../server/normalize.js');
 const captured=await normalizeCapture({...payload,schemaVersion:1,stylesheets:[{url:'http://localhost/app.css',css:'@layer components{.profile > div {color:blue}.profile {& > label {display:block}}}'}]},store);
 assert.match(captured.html,/\.profile > div/);assert.match(captured.html,/& > label/);assert.doesNotMatch(captured.html,/&gt;|&amp;/);
 const {scopes}=editContext(captured.html,['heading']);
 const candidate=await applyEdit(captured.html,scopes,{summary:'見出し変更',replacements:[{targetId:'heading',html:'<h1 data-cn-id="heading">メンバー一覧</h1>'}]},store,()=>false);
 assert.match(candidate,/メンバー一覧/);assert.match(candidate,/\.profile > div/);assert.match(candidate,/& > label/);
 const again=await applyEdit(candidate,editContext(candidate,['heading']).scopes,{summary:'再編集',replacements:[{targetId:'heading',html:'<h1 data-cn-id="heading">ユーザー一覧</h1>'}]},store,()=>false);
 assert.match(again,/\.profile > div/);assert.doesNotMatch(again,/&gt;|&amp;/);
});
