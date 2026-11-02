import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readRoute,routeUrl,readWorkspace,saveWorkspace} from '../src/navigation.js';
test('起動時は一覧、拡張の既存リンクは編集画面を開く',()=>{
 assert.deepEqual(readRoute('http://localhost/'),{page:'library'});
 assert.deepEqual(readRoute('http://localhost/?proposal=abc&screen=def'),{page:'workspace',proposalId:'abc',screenId:'def'});
 assert.equal(routeUrl({page:'trash'}),'/?view=trash');
 assert.deepEqual(readRoute('http://localhost'+routeUrl({page:'workspace',proposalId:'abc',screenId:'def'})),{page:'workspace',proposalId:'abc',screenId:'def'});
});
test('変更案ごとに比較履歴とパネル状態を保持し、破損データでは初期値を使用する',()=>{
 const map=new Map<string,string>(); const storage={getItem:(k:string)=>map.get(k)||null,setItem:(k:string,v:string)=>{map.set(k,v);}};
 saveWorkspace(storage,'a',{screenId:'screen',comparing:true,revisionId:'v1',rail:false,inspectorOpen:false,inspectorWidth:300});
 assert.equal(readWorkspace(storage,'a').revisionId,'v1');
 assert.equal(readWorkspace(storage,'a').inspectorOpen,false);
 assert.equal(readWorkspace(storage,'b').comparing,false);
 map.set('screendraft:workspace:v1:a','invalid');assert.equal(readWorkspace(storage,'a').comparing,false);
});

import {LatestRequest} from '../src/navigation.js';
test('移動前の通信失敗は新しい画面の成功後に反映しない',async()=>{
 const gate=new LatestRequest();let reject:(error:Error)=>void=()=>{};
 const older=gate.run(async()=>{await new Promise<void>((_,fail)=>{reject=fail;});});
 let latest='';await gate.run(async current=>{if(current())latest='B';});reject(new Error('Aの通信失敗'));await older;assert.equal(latest,'B');
 await assert.rejects(()=>gate.run(async()=>{throw new Error('現在の通信失敗');}),/現在の通信失敗/);
});
test('明示的な画面移動は進行中の同期を無効にする',async()=>{
 const gate=new LatestRequest();let finish:()=>void=()=>{};let navigated=false;
 const pending=gate.run(async current=>{await new Promise<void>(r=>{finish=r;});if(current())navigated=true;});gate.invalidate();finish();await pending;assert.equal(navigated,false);
});
