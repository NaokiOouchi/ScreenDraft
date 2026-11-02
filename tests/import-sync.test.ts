import {test} from 'node:test';import assert from 'node:assert/strict';import {importDestination} from '../shared/import-sync.js';
test('automatic import display follows the latest saved screen unless the user is editing',()=>{
 const events=[{sequence:1,proposalId:'a',screenId:'one'},{sequence:2,proposalId:'b',screenId:'two'}];
 assert.deepEqual(importDestination(events,{proposalId:'a',screenId:'old',editing:false}),{proposalId:'b',screenId:'two',navigate:true});
 assert.deepEqual(importDestination(events,{proposalId:'a',screenId:'old',editing:true}),{proposalId:'a',screenId:'old',navigate:false});assert.equal(importDestination([],{proposalId:'',screenId:'',editing:false}),null);
});
import {mkdtemp,rm,readFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createApp} from '../server/app.js';
test('authenticated extension connection and successful captures publish metadata once; app captures do not',async()=>{
 const dataDir=await mkdtemp(join(tmpdir(),'cn-import-sync-'));const app=await createApp({dataDir});
 try{
 const getState=async()=>(await app.inject('/api/extension-state')).json();assert.equal((await getState()).connectedAt,null);
 const key=await readFile(join(dataDir,'connection-key'),'utf8');const headers={origin:'chrome-extension://'+'a'.repeat(32),authorization:'Bearer '+key.trim()};
 assert.equal((await app.inject({url:'/api/proposals',headers:{...headers,authorization:'Bearer wrong'}})).statusCode,403);assert.equal((await getState()).connectedAt,null);
 await app.inject({url:'/api/proposals',headers});assert.ok((await getState()).connectedAt);
 const proposal=(await app.inject({method:'POST',url:'/api/proposals',payload:{title:'Import sync'}})).json();
 const payload={schemaVersion:1,title:'screen',sourceUrl:'https://example.com/',baseUrl:'https://example.com/',viewport:{width:1280,height:900},html:'<html><head></head><body><h1>Screen</h1></body></html>',stylesheets:[],resourceUrls:[],resources:[],warnings:[],capturedAt:new Date().toISOString()};
 await app.inject({method:'POST',url:'/api/proposals/'+proposal.id+'/captures',payload});assert.equal((await getState()).sequence,0);
 const id='00000000-0000-4000-8000-000000000001';const request={method:'POST' as const,url:'/api/proposals/'+proposal.id+'/captures',headers:{...headers,'idempotency-key':id},payload};
 const capture=await app.inject(request);assert.equal(capture.statusCode,201);await app.inject(request);
 const state=await getState();assert.equal(state.sequence,1);assert.deepEqual(state.imports,[{sequence:1,proposalId:proposal.id,screenId:capture.json().id}]);assert.ok(!JSON.stringify(state).includes(key.trim()));assert.ok(!JSON.stringify(state).includes('<h1>'));
 const failed=await app.inject({...request,headers:{...headers,'idempotency-key':'00000000-0000-4000-8000-000000000002'},payload:{}});assert.equal(failed.statusCode,400);assert.equal((await getState()).sequence,1);
 }finally{await app.close();await rm(dataDir,{recursive:true,force:true});}
});
