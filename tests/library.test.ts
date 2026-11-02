import {test} from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {createApp} from '../server/app.js';
test('一覧集計は最新の画面数と未完了編集を返し、削除後と復元後に追従する',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'sd-library-'));const app=await createApp({dataDir:dir});
 try{const p=(await app.inject({method:'POST',url:'/api/proposals',payload:{title:'一覧'}})).json();
 let row=(await app.inject('/api/proposals')).json()[0];assert.equal(row.screenCount,0);assert.equal(row.pendingCount,0);assert.equal(row.runningCount,0);
 const screen=(await app.inject({method:'POST',url:`/api/proposals/${p.id}/captures`,payload:{schemaVersion:1,title:'画面',sourceUrl:'http://localhost/',baseUrl:'http://localhost/',viewport:{width:1280,height:900},html:'<html><body>テスト</body></html>',stylesheets:[],resourceUrls:[],resources:[],warnings:[],capturedAt:new Date().toISOString()}})).json();
 row=(await app.inject('/api/proposals')).json()[0];assert.equal(row.screenCount,1);
 await app.inject({method:'DELETE',url:`/api/proposals/${p.id}/screens/${screen.id}`});assert.equal((await app.inject('/api/proposals')).json()[0].screenCount,0);
 await app.inject({method:'POST',url:`/api/proposals/${p.id}/screens/${screen.id}/restore`});assert.equal((await app.inject('/api/proposals')).json()[0].screenCount,1);
 await app.inject({method:'DELETE',url:`/api/proposals/${p.id}`});assert.deepEqual((await app.inject('/api/proposals')).json(),[]);
 }finally{await app.close();await rm(dir,{recursive:true,force:true});}
});

test('一覧のAI集計は実行・候補生成・採用に追従する',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'sd-library-jobs-'));
 let finish:()=>void=()=>{};const gate=new Promise<void>(resolve=>{finish=resolve;});
 const app=await createApp({dataDir:dir,aiRunner:async request=>{await gate;return {summary:'見出しを変更',replacements:request.scopes.map(s=>({targetId:s.id,html:s.html.replace('元の見出し','変更後')}))};}});
 try{const p=(await app.inject({method:'POST',url:'/api/proposals',payload:{title:'編集中'}})).json();
 const screen=(await app.inject({method:'POST',url:`/api/proposals/${p.id}/captures`,payload:{schemaVersion:1,title:'画面',sourceUrl:'http://localhost/',baseUrl:'http://localhost/',viewport:{width:1280,height:900},html:'<html><body><h1 data-cn-id="heading">元の見出し</h1></body></html>',stylesheets:[],resourceUrls:[],resources:[],warnings:[],capturedAt:new Date().toISOString()}})).json();
 const detail=(await app.inject(`/api/proposals/${p.id}`)).json();const job=(await app.inject({method:'POST',url:`/api/proposals/${p.id}/edits`,payload:{screenId:screen.id,baseRevisionId:detail.proposal.headRevisionId,selectedIds:['heading'],prompt:'見出しを変更'}})).json();
 assert.equal((await app.inject('/api/proposals')).json()[0].runningCount,1);finish();
 for(let n=0;n<100;n++){if((await app.inject('/api/edits/'+job.id)).json().status==='ready')break;await new Promise(r=>setTimeout(r,10));}
 assert.equal((await app.inject('/api/proposals')).json()[0].pendingCount,1);
 await app.inject({method:'POST',url:'/api/edits/'+job.id+'/accept',payload:{}});
 const row=(await app.inject('/api/proposals')).json()[0];assert.equal(row.pendingCount,0);assert.equal(row.runningCount,0);assert.equal(row.screenCount,1);
 }finally{finish();await app.close();await rm(dir,{recursive:true,force:true});}
});
