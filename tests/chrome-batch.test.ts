import {test} from 'node:test';import assert from 'node:assert/strict';
// @ts-ignore implemented after the failing contract test
import {createChromeBatchAdapter} from '../extension/chrome-batch.js';
const capture={schemaVersion:1,title:'画面',sourceUrl:'https://app.test/profile',baseUrl:'https://app.test/',viewport:{width:1280,height:900},html:'<html></html>',stylesheets:[],resources:[],resourceUrls:[],warnings:[],capturedAt:new Date().toISOString()};
function chromeFixture({redirect=false,loading=false,abort}:{redirect?:boolean;loading?:boolean;abort?:AbortController}={}){
 const removed:number[]=[],created:string[]=[];let scripts=0;
 const chrome={tabs:{create:async({url}:{url:string})=>{created.push(url);return {id:42};},get:async()=>({id:42,status:loading?'loading':'complete',url:redirect?'https://login.other.test/':'https://app.test/profile'}),remove:async(id:number)=>{removed.push(id);}},scripting:{executeScript:async({func}:{func:Function})=>{scripts++;if(abort){abort.abort();}return [{result:func.name==='captureDocument'?capture:{origin:'https://app.test'}}];}}};
 return {chrome,removed,created,scripts:()=>scripts};
}
test('Chrome capture collects rendered page then closes only its own temporary tab',async()=>{
 const f=chromeFixture();const adapter=createChromeBatchAdapter(f.chrome,{origin:'https://app.test',collect:async(value:any)=>value});const result=await adapter.capture('https://app.test/profile',new AbortController().signal);assert.equal(result.title,'画面');assert.deepEqual(f.removed,[42]);assert.equal(f.scripts(),2);
});
test('Chrome capture rejects cross-origin redirects before injection and removes temporary tab',async()=>{
 const f=chromeFixture({redirect:true});const adapter=createChromeBatchAdapter(f.chrome,{origin:'https://app.test'});await assert.rejects(()=>adapter.capture('https://app.test/profile',new AbortController().signal),/別のサイト/);assert.equal(f.scripts(),0);assert.deepEqual(f.removed,[42]);
});
test('Chrome capture times out loading pages and removes temporary tab',async()=>{
 const f=chromeFixture({loading:true});const adapter=createChromeBatchAdapter(f.chrome,{origin:'https://app.test',timeoutMs:5,pollMs:1});await assert.rejects(()=>adapter.capture('https://app.test/profile',new AbortController().signal),/時間/);assert.deepEqual(f.removed,[42]);
});
test('Chrome capture cancellation closes temporary tab without returning partial data',async()=>{
 const controller=new AbortController(),f=chromeFixture({abort:controller});const adapter=createChromeBatchAdapter(f.chrome,{origin:'https://app.test'});await assert.rejects(()=>adapter.capture('https://app.test/profile',controller.signal));assert.deepEqual(f.removed,[42]);
});
test('Chrome capture refuses outside origins before opening a tab',async()=>{
 const f=chromeFixture();const adapter=createChromeBatchAdapter(f.chrome,{origin:'https://app.test'});await assert.rejects(()=>adapter.capture('https://other.test/profile',new AbortController().signal),/対象/);assert.deepEqual(f.created,[]);
});
test('canvas capture activates only its temporary tab, waits for drawing and restores the previous active tab',async()=>{
 const events:string[]=[];let active=7;
 const api={tabs:{create:async()=>({id:42,windowId:3}),get:async()=>({status:'complete',url:capture.sourceUrl}),query:async()=>[{id:active}],update:async(id:number)=>{active=id;events.push('active:'+id);},remove:async()=>{events.push('remove');}},scripting:{executeScript:async({func}:{func:Function})=>{events.push(func.name);return [{result:func.name==='captureDocument'?capture:{origin:'https://app.test',hasCanvas:true}}];}}};
 await createChromeBatchAdapter(api,{origin:'https://app.test',collect:async(x:any)=>x}).capture(capture.sourceUrl,new AbortController().signal);
 assert.deepEqual(events,['waitForRendered','active:42','waitForCanvasPaint','captureDocument','active:7','remove']);
});
