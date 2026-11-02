import {test} from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';import {runInNewContext} from 'node:vm';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createApp} from '../server/app.js';
class Element{value='';textContent='';hidden=false;disabled=false;children:any[]=[];style={};onclick?:()=>Promise<void>;onchange?:()=>Promise<void>;append(...items:any[]){this.children.push(...items);}replaceChildren(...items:any[]){this.children=items;this.value=items[0]?.value||'';}setAttribute(){}addEventListener(){} }
test('extension popup explicitly updates an existing screen and refreshes its base snapshot for the next capture',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'cn-popup-update-'));const app=await createApp({dataDir:dir});
 try{const capture={schemaVersion:1,title:'取り込み',sourceUrl:'http://localhost/test',baseUrl:'http://localhost/',viewport:{width:1280,height:900},html:'<html><body><h1>テスト</h1></body></html>',stylesheets:[],resourceUrls:[],resources:[],warnings:[],capturedAt:new Date().toISOString()};const p=(await app.inject({method:'POST',url:'/api/proposals',payload:{title:'拡張更新'}})).json();const screen=(await app.inject({method:'POST',url:`/api/proposals/${p.id}/captures`,payload:capture})).json();
 const controls=new Map<string,Element>();const get=(id:string)=>{if(!controls.has(id))controls.set(id,new Element());return controls.get(id)!;};get('endpoint').value='http://127.0.0.1:4173';
 const bundles=await build({entryPoints:['extension/popup.js'],bundle:true,write:false,format:'esm',platform:'browser',plugins:[{name:'extension-shared-files',setup(b){b.onResolve({filter:/^\.\/(capture|batch-import)\.js$/},args=>({path:join(process.cwd(),'shared',args.path.slice(2))}));}}]});
 const writes:any[]=[];let oldBackend=false;
 await runInNewContext('(async()=>{'+bundles.outputFiles[0].text+'})()',{
  document:{getElementById:get,createElement:()=>new Element(),querySelectorAll:()=>[]},
  Option:class{constructor(public text:string,public value:string){}},URL,AbortSignal,crypto:globalThis.crypto,setTimeout,
  chrome:{storage:{local:{get:async()=>({}),set:async()=>{}}},tabs:{query:async()=>[{id:1,url:'http://localhost/test'}]},scripting:{executeScript:async()=>[{result:structuredClone(capture)}]}},
  fetch:async(url:string,options:any={})=>{const path=new URL(url).pathname;if(oldBackend&&path==='/api/health')return{ok:true,json:async()=>({ok:true})};if(options.method==='POST'&&path.endsWith('/captures'))writes.push(JSON.parse(options.body));const response=await app.inject({method:options.method||'GET',url:path,headers:options.headers,payload:options.body});return{ok:response.statusCode<400,json:async()=>response.json()};}
 });
 await get('connect').onclick!();
 for(let i=0;i<2;i++){await get('capture').onclick!();get('save-target').value=screen.id;await get('save-target').onchange!();await get('save').onclick!();assert.match(get('status').textContent,/保存しました/);}
 assert.equal(writes.length,2);assert.equal(writes[0].updateScreenId,screen.id);assert.equal(writes[0].baseSnapshotId,screen.snapshotId);assert.notEqual(writes[1].baseSnapshotId,screen.snapshotId);const current=(await app.inject(`/api/proposals/${p.id}`)).json();assert.equal(current.screens.length,1);assert.equal(current.screens[0].id,screen.id);assert.equal((await app.inject(`/api/proposals/${p.id}/revisions`)).json().length,3);oldBackend=true;await get('connect').onclick!();assert.equal(get('save-target').children.length,1);assert.match(get('target-note').textContent,/最新版/);
 }finally{await app.close();await rm(dir,{recursive:true,force:true});}
});
