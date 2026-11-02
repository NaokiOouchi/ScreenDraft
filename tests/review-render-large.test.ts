import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';

const require=createRequire(import.meta.url);
test('大きな画面と比較画像を長いdata URLを使わずに描画する',async()=>{
 const Module=require('node:module'),originalLoad=Module._load,originalFetch=globalThis.fetch,urls:string[]=[],files:string[]=[];
 class Window {
  webContents={setWindowOpenHandler(){},session:{setPermissionRequestHandler(){}},executeJavaScript:async (code:string)=>code.includes('scrollWidth')?{width:800,height:600}:true,capturePage:async()=>({resize(){return this;},toPNG(){return Buffer.alloc(100,1);}})};
  async loadURL(url:string){urls.push(url);if(url.startsWith('data:')&&url.length>1000)throw Error('ERR_INVALID_URL');}
  async loadFile(path:string){files.push(path);assert.match(await readFile(path,'utf8'),/<(?:html|!doctype)/i);}
  setContentSize(){} destroy(){}
 }
 Module._load=function(id:string,...rest:any[]){if(id==='electron')return {BrowserWindow:Window};return originalLoad.call(this,id,...rest);};
 globalThis.fetch=async()=>new Response('<!doctype html><html><head></head><body>'+('x'.repeat(2_000_000))+'</body></html>');
 try{const renderer=require('../desktop/review-render.cjs');const screen={snapshotId:'00000000-0000-0000-0000-000000000001',title:'テスト',width:800,height:600};const result=await renderer.renderReview('http://127.0.0.1:4173',{current:screen,past:screen,version:1});assert.ok(result.after&&result.before&&result.comparison);assert.ok(urls.every(u=>!u.startsWith('data:')));assert.equal(files.length,3);for(const file of files)await assert.rejects(readFile(file));}
 finally{Module._load=originalLoad;globalThis.fetch=originalFetch;}
});

test('描画結果の取得が一時的に失敗したとき再試行する',async()=>{
 const Module=require('node:module'),originalLoad=Module._load,originalFetch=globalThis.fetch;let attempts=0;
 class Window {
  webContents={setWindowOpenHandler(){},session:{setPermissionRequestHandler(){}},executeJavaScript:async (code:string)=>code.includes('scrollWidth')?{width:800,height:600}:true,capturePage:async()=>{attempts++;if(attempts===1)throw Error('UnknownVizError');return {isEmpty:()=>false,resize(){return this;},toPNG(){return Buffer.from('png');}};}};
  async loadFile(){} setContentSize(){} destroy(){}
 }
 Module._load=function(id:string,...rest:any[]){if(id==='electron')return {BrowserWindow:Window};return originalLoad.call(this,id,...rest);};
 globalThis.fetch=async()=>new Response('<html><head></head><body>テスト</body></html>');
 try{delete require.cache[require.resolve('../desktop/review-render.cjs')];const renderer=require('../desktop/review-render.cjs');const current={snapshotId:'00000000-0000-0000-0000-000000000001',title:'テスト',width:800,height:600};const result=await renderer.renderReview('http://127.0.0.1:4173',{current});assert.ok(result.after&&result.comparison);assert.equal(attempts,3);}
 finally{Module._load=originalLoad;globalThis.fetch=originalFetch;}
});

test('描画の失敗が続く場合は画面の内容を含めずに知らせる',async()=>{
 const Module=require('node:module'),originalLoad=Module._load,originalFetch=globalThis.fetch;let attempts=0;
 class Window {
  webContents={setWindowOpenHandler(){},session:{setPermissionRequestHandler(){}},executeJavaScript:async (code:string)=>code.includes('scrollWidth')?{width:800,height:600}:true,capturePage:async()=>{attempts++;throw Error('UnknownVizError');}};
  async loadFile(){} setContentSize(){} destroy(){}
 }
 Module._load=function(id:string,...rest:any[]){if(id==='electron')return {BrowserWindow:Window};return originalLoad.call(this,id,...rest);};
 globalThis.fetch=async()=>new Response('<html><head></head><body>内容</body></html>');
 try{delete require.cache[require.resolve('../desktop/review-render.cjs')];const renderer=require('../desktop/review-render.cjs');const current={snapshotId:'00000000-0000-0000-0000-000000000001',title:'テスト',width:800,height:600};await assert.rejects(renderer.renderReview('http://127.0.0.1:4173',{current}),/画面の画像を取得できませんでした/);assert.equal(attempts,3);}
 finally{Module._load=originalLoad;globalThis.fetch=originalFetch;}
});

test('縦長の画面は全体を収めて画像と比較を作成する',async()=>{
 const Module=require('node:module'),originalLoad=Module._load,originalFetch=globalThis.fetch;const sizes:Array<[number,number]>=[],zooms:number[]=[];
 class Window {
  webContents={setWindowOpenHandler(){},session:{setPermissionRequestHandler(){}},setZoomFactor(value:number){zooms.push(value);},executeJavaScript:async(code:string)=>code.includes('scrollWidth')?{width:1431,height:14374}:true,capturePage:async()=>({isEmpty:()=>false,resize(){return this;},toPNG(){return Buffer.from('png');}})};
  async loadFile(){} setContentSize(w:number,h:number){sizes.push([w,h]);} destroy(){}
 }
 Module._load=function(id:string,...rest:any[]){if(id==='electron')return {BrowserWindow:Window};return originalLoad.call(this,id,...rest);};
 globalThis.fetch=async()=>new Response('<html><head></head><body>テスト</body></html>');
 try{delete require.cache[require.resolve('../desktop/review-render.cjs')];const renderer=require('../desktop/review-render.cjs');const current={snapshotId:'00000000-0000-0000-0000-000000000001',title:'テスト',width:1422,height:970};const result=await renderer.renderReview('http://127.0.0.1:4173',{current,past:current,version:1});assert.ok(result.after&&result.before&&result.comparison);assert.equal(sizes.length,2);assert.ok(sizes[0][0]*sizes[0][1]<=12*1024*1024);assert.ok(zooms[0]<1);assert.ok(Math.abs(sizes[0][0]/sizes[0][1]-1431/14374)<0.001);}
 finally{Module._load=originalLoad;globalThis.fetch=originalFetch;}
});
