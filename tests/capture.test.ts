import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server/app.js';
import {collectResources,cssResourceUrls} from '../shared/capture.js';
import type {Capture} from '../shared/types.js';
const image=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="blue"/></svg>');
const capture:Capture={schemaVersion:1,title:'ユーザー一覧',sourceUrl:'http://localhost:9999/users?token=secret#page',baseUrl:'http://localhost:9999/users',viewport:{width:1280,height:900},html:'<html><body><script>throw 1</script><form action="http://evil.test"><input type="password" value="SECRET"><button onclick="alert(1)">送信</button></form><img src="/logo.svg"><div data-cn-id="same">A</div><div data-cn-id="same" style="background:url(/logo.svg)">B</div><a href="http://evil.test">Link</a></body></html>',stylesheets:[{url:'http://localhost:9999/main.css',css:'@layer base { @media(min-width:600px){body{color:blue;background:url(/logo.svg)}} } @import "./extra.css"; @font-face{font-family:test;src:url(/font.woff2)}'}],resourceUrls:[],resources:[{url:'http://localhost:9999/logo.svg',mime:'image/svg+xml',base64:image.toString('base64')},{url:'http://localhost:9999/extra.css',mime:'text/css',base64:Buffer.from('p{background:url(/logo.svg)}').toString('base64')},{url:'http://localhost:9999/font.woff2',mime:'font/woff2',base64:Buffer.from('test-font').toString('base64')}],warnings:[],capturedAt:new Date().toISOString()};
test('capture API: layered CSS, assets, sanitization, multiple screens and restart persistence',async()=>{
 const dataDir=await mkdtemp(join(tmpdir(),'change-note-'));let app=await createApp({dataDir});
 try{
  const proposal=(await app.inject({method:'POST',url:'/api/proposals',payload:{title:'性別項目を追加'}})).json();
  const saved=await app.inject({method:'POST',url:`/api/proposals/${proposal.id}/captures`,payload:capture});assert.equal(saved.statusCode,201,saved.body);const screen=saved.json();assert.equal(screen.sourceUrl,'http://localhost:9999/users');assert.equal(screen.assetCount,3);
  const replay=await app.inject(`/api/snapshots/${screen.snapshotId}`);assert.equal(replay.statusCode,200);assert.match(replay.headers['content-security-policy'] as string,/script-src 'none'/);assert.match(replay.body,/@layer base/);assert.match(replay.body,/@media/);assert.match(replay.body,/@import "\/api\/assets\//);assert.doesNotMatch(replay.body,/<script|onclick|SECRET|action=|http:\/\/evil/);assert.match(replay.body,/type="button"/);assert.equal((replay.body.match(/data-cn-id="same"/g)||[]).length,1);
  const assetId=replay.body.match(/\/api\/assets\/([a-f0-9]{64})/)![1];const asset=await app.inject(`/api/assets/${assetId}`);assert.equal(asset.statusCode,200);
  const cssId=replay.body.match(/@import "\/api\/assets\/([a-f0-9]{64})/)![1];
  const originalCss=(await app.inject(`/api/assets/${cssId}`)).body;
  const changed=await app.inject({method:'POST',url:`/api/proposals/${proposal.id}/captures`,payload:{...capture,title:'画像を変更した版',resources:capture.resources.map(r=>r.mime==='image/svg+xml'?{...r,base64:Buffer.from(image.toString().replace('blue','red')).toString('base64')}:r)}});assert.equal(changed.statusCode,201);
  assert.equal((await app.inject(`/api/assets/${cssId}`)).body,originalCss,'prior CSS asset stays immutable when a dependency changes');
  const second=await app.inject({method:'POST',url:`/api/proposals/${proposal.id}/captures`,payload:{...capture,title:'設定',resources:[]}});assert.equal(second.statusCode,201);assert.ok(second.json().warnings.some((s:string)=>s.includes('不足')));
  const before=(await app.inject(`/api/proposals/${proposal.id}`)).json();assert.equal(before.screens.length,3);
  await app.close();app=await createApp({dataDir});const after=(await app.inject(`/api/proposals/${proposal.id}`)).json();assert.deepEqual(after,before);assert.equal((await app.inject(`/api/snapshots/${screen.snapshotId}`)).body,replay.body);
 }finally{await app.close();await rm(dataDir,{recursive:true,force:true});}
});
test('origin, connection key, host and payload validation',async()=>{
 const dataDir=await mkdtemp(join(tmpdir(),'change-note-'));const app=await createApp({dataDir});
 try{
  assert.equal((await app.inject({url:'/api/proposals',headers:{origin:'https://evil.test'}})).statusCode,403);
  assert.equal((await app.inject({url:'/api/session',headers:{host:'evil.test'}})).statusCode,403);
  const {connectionKey}= (await app.inject('/api/session')).json();const headers={origin:'chrome-extension://'+'a'.repeat(32),authorization:'Bearer '+connectionKey};
  assert.equal((await app.inject({url:'/api/proposals',headers})).statusCode,200);assert.equal((await app.inject({url:'/api/session',headers})).statusCode,403);
  const proposal=(await app.inject({method:'POST',url:'/api/proposals',payload:{title:'test'}})).json();assert.equal((await app.inject({method:'POST',url:`/api/proposals/${proposal.id}/captures`,payload:{...capture,viewport:{width:-1,height:900}}})).statusCode,400);assert.equal((await app.inject(`/api/proposals/${proposal.id}`)).json().screens.length,0);
 }finally{await app.close();await rm(dataDir,{recursive:true,force:true});}
});
test('resource collector follows CSS imports, deduplicates URLs and reports missing files',async()=>{
 assert.deepEqual(cssResourceUrls('@layer test{a{background:url("./a.svg#x")}} @import "more.css";','https://example.test/main.css'),['https://example.test/a.svg','https://example.test/more.css']);
 const result=await collectResources({...capture,resources:[],resourceUrls:['https://example.test/missing.png'],stylesheets:[{url:'https://example.test/main.css',css:null}]},async input=>{const url=String(input);if(url.endsWith('main.css'))return new Response('@import "more.css";a{background:url(a.svg)}',{headers:{'content-type':'text/css'}});if(url.endsWith('more.css'))return new Response('b{background:url(a.svg)}',{headers:{'content-type':'text/css'}});if(url.endsWith('a.svg'))return new Response(image,{headers:{'content-type':'image/svg+xml'}});return new Response('',{status:404});});assert.equal(result.resources.length,3);assert.equal(result.warnings.length,1);
});
test('TTF fonts served as application/octet-stream remain available to replay CSS',async()=>{
 const dataDir=await mkdtemp(join(tmpdir(),'cn-ttf-'));const app=await createApp({dataDir});try{
 const p=(await app.inject({method:'POST',url:'/api/proposals',payload:{title:'TTF'}})).json();
 const input={...capture,stylesheets:[{url:'https://cdn.test/style.css',css:'@font-face{font-family:icons;src:url(./icons.ttf)}'}],resources:[{url:'https://cdn.test/icons.ttf',mime:'application/octet-stream',base64:Buffer.from('font-data').toString('base64')}]};
 const s=(await app.inject({method:'POST',url:`/api/proposals/${p.id}/captures`,payload:input})).json();assert.equal(s.assetCount,1);assert.ok(!s.warnings.some((w:string)=>w.includes('icons.ttf')));
 }finally{await app.close();await rm(dataDir,{recursive:true,force:true});}
});

test('プレビューと保存で埋め込みWOFFを保持し、未対応のデータURLを警告に表示しない',async()=>{
 const dataDir=await mkdtemp(join(tmpdir(),'sd-inline-font-'));const app=await createApp({dataDir});try{
  const font='data:application/font-woff;charset=utf-8;base64,d09GRg==';
  const secret='data:application/unknown;base64,U0VDUkVU';
  const input={...capture,html:'<html><body><div style="background:url('+secret+')">内容</div></body></html>',stylesheets:[{url:'https://example.test/main.css',css:'@font-face{font-family:icon;src:url("'+font+'")}' }],resources:[],warnings:[]};
  const preview=await app.inject({method:'POST',url:'/api/capture-previews',payload:input});assert.equal(preview.statusCode,201,preview.body);const p=preview.json();assert.ok(!JSON.stringify(p.warnings).includes('U0VDUkVU'));assert.ok(!JSON.stringify(p.warnings).includes('d09GRg'));const previewHtml=await app.inject(p.url);assert.ok(previewHtml.body.includes(font));
  const proposal=(await app.inject({method:'POST',url:'/api/proposals',payload:{title:'フォント'}})).json();const saved=await app.inject({method:'POST',url:`/api/proposals/${proposal.id}/captures`,payload:input});assert.equal(saved.statusCode,201,saved.body);assert.ok(!JSON.stringify(saved.json().warnings).includes('U0VDUkVU'));const replay=await app.inject('/api/snapshots/'+saved.json().snapshotId);assert.ok(replay.body.includes(font));
 }finally{await app.close();await rm(dataDir,{recursive:true,force:true});}
});
