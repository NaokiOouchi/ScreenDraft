import {test} from 'node:test';import assert from 'node:assert/strict';import{mkdtemp,rm,readdir}from'node:fs/promises';import{tmpdir}from'node:os';import{join}from'node:path';import{createApp}from'../server/app.js';
// @ts-ignore
import{checkAiReadiness}from'../server/ai-readiness.js';
test('readiness exposes only status and version; unsupported status is unknown rather than logged out',async()=>{
 const check=(result:any)=>checkAiReadiness(async(args:string[])=>args[0]==='--version'?{status:'ok',stdout:'2.1.303 (Claude Code)'}:result);
 const ready=await check({status:'ok',stdout:JSON.stringify({loggedIn:true,email:'PRIVATE',token:'SECRET'})});assert.equal(ready.status,'ready');assert.equal(ready.version,'2.1.303');assert.doesNotMatch(JSON.stringify(ready),/PRIVATE|SECRET/);
 assert.equal((await check({status:'error',stdout:'{"loggedIn":false}'})).status,'needs-login');assert.equal((await check({status:'error',stdout:'unknown command'})).status,'unknown');
 assert.equal((await checkAiReadiness(async()=>({status:'not-found',stdout:''}))).status,'not-installed');assert.equal((await check({status:'timeout',stdout:''})).status,'unknown');
});
test('preview sanitizes with saved renderer without persisting assets, screens or revisions',async()=>{
 const dataDir=await mkdtemp(join(tmpdir(),'cn-preview-'));const app=await createApp({dataDir});try{
 const proposal=(await app.inject({method:'POST',url:'/api/proposals',payload:{title:'未保存確認'}})).json();
 const payload={schemaVersion:1,title:'確認用',sourceUrl:'https://test.example/',baseUrl:'https://test.example/',viewport:{width:1280,height:900},html:'<html><body><script>alert(1)</script><img src="/logo.svg"><button onclick="evil()">保存</button></body></html>',stylesheets:[],resourceUrls:[],resources:[{url:'https://test.example/logo.svg',mime:'image/svg+xml',base64:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString('base64')}],warnings:[],capturedAt:new Date().toISOString()};
 const response=await app.inject({method:'POST',url:'/api/capture-previews',payload});assert.equal(response.statusCode,201);const preview=response.json();
 const html=await app.inject(preview.url);assert.equal(html.statusCode,200);assert.match(html.headers['content-security-policy'] as string,/script-src 'none'/);assert.match(html.headers['content-security-policy'] as string,/frame-ancestors 'self' chrome-extension:/);assert.doesNotMatch(html.body,/<script|onclick/);const assetUrl=html.body.match(/src="([^"]+)"/)![1];assert.match(assetUrl,/capture-previews/);assert.equal((await app.inject({url:assetUrl,headers:{origin:'null'}})).statusCode,200);
 const detail=(await app.inject('/api/proposals/'+proposal.id)).json();assert.equal(detail.screens.length,0);assert.equal(detail.proposal.headRevisionId,null);assert.ok(!(await readdir(dataDir)).includes('assets'));
 await app.inject({method:'DELETE',url:preview.url});assert.equal((await app.inject(preview.url)).statusCode,404);
 }finally{await app.close();await rm(dataDir,{recursive:true,force:true});}
});
