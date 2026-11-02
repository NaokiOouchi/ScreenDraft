import {test} from 'node:test';
import assert from 'node:assert/strict';
// @ts-ignore JavaScript module is implemented after the red test.
import {collectLinkCandidates,BatchImport} from '../shared/batch-import.js';
const capture={title:'画面',warnings:[],resources:[]};
test('candidates include current page, deduplicate anchors and exclude external, action and secret URLs',()=>{
 const result=collectLinkCandidates({sourceUrl:'https://app.test/users',title:'一覧',links:[
  {href:'/profile',text:'設定'},{href:'/profile#name',text:'重複'},{href:'#details',text:'ページ内'},
  {href:'https://other.test/users',text:'外部'},{href:'/logout',text:'ログアウト'},{href:'/api/delete?id=1',text:'削除'},
  {href:'/users?access_token=secret',text:'機密'},{href:'javascript:alert(1)',text:'bad'},{href:'/search?status=active',text:'有効ユーザー'},
 ]});
 assert.deepEqual(result.candidates.map((x:any)=>x.url),['https://app.test/users','https://app.test/profile','https://app.test/search?status=active']);assert.equal(result.origin,'https://app.test');
});
test('candidate list is capped at 50 and hidden traversal is not performed',()=>{
 const r=collectLinkCandidates({sourceUrl:'http://localhost:9000/',title:'ホーム',links:Array.from({length:70},(_,i)=>({href:'/page/'+i,text:'画面'+i}))});assert.equal(r.candidates.length,50);assert.equal(r.truncated,true);
});
test('queue keeps successes, retries failed captures only, and never resaves saved entries',async()=>{
 const calls:string[]=[];let fail=true,saveFailure=true;
 const queue=new BatchImport([{id:'a',url:'https://app.test/a',title:'A'},{id:'b',url:'https://app.test/b',title:'B'}],{
  capture:async(url:string)=>{calls.push(url);if(url.endsWith('/b')&&fail)throw new Error('取得失敗');return {...capture,title:url};},
  save:async(item:any)=>{if(item.id==='b'&&saveFailure)throw new Error('応答なし');return {id:item.id};},
 });
 await queue.acquire(['a','b']);assert.deepEqual(queue.items.map((x:any)=>x.status),['ready','failed']);
 fail=false;await queue.acquire(['a','b']);assert.equal(calls.length,3);assert.ok(queue.items.every((x:any)=>x.status==='ready'));
 await queue.saveReady();assert.deepEqual(queue.items.map((x:any)=>x.status),['saved','save-failed']);const importId=queue.items[1].importId;
 saveFailure=false;await queue.saveReady();assert.deepEqual(queue.items.map((x:any)=>x.status),['saved','saved']);assert.equal(queue.items[1].importId,importId);
});
test('cancel interrupts active acquisition, retains completed work, and leaves remaining entries pending',async()=>{
 const queue=new BatchImport([{id:'a',url:'https://app.test/a',title:'A'},{id:'b',url:'https://app.test/b',title:'B'},{id:'c',url:'https://app.test/c',title:'C'}],{
  capture:async(url:string,signal:AbortSignal)=>{if(url.endsWith('/b')){queue.cancel();signal.throwIfAborted();}return capture;},save:async()=>({id:'saved'}),
 });await queue.acquire(['a','b','c']);assert.deepEqual(queue.items.map((x:any)=>x.status),['ready','pending','pending']);
});
test('queue rejects over ten items and unknown IDs before acquiring',async()=>{
 const queue=new BatchImport(Array.from({length:11},(_,i)=>({id:String(i),url:'https://app.test/'+i,title:String(i)})),{capture:async()=>capture,save:async()=>({})});
 await assert.rejects(()=>queue.acquire(queue.items.map((x:any)=>x.id)),/10/);await assert.rejects(()=>queue.acquire(['missing']),/対象/);
});
test('cancellation during saving finishes the current save and preserves unsaved results',async()=>{
 const queue=new BatchImport([{id:'a',url:'https://app.test/a',title:'A'},{id:'b',url:'https://app.test/b',title:'B'}],{capture:async()=>capture,save:async(item:any)=>{queue.cancel();return {id:item.id};}});
 await queue.acquire(['a','b']);await queue.saveReady();assert.deepEqual(queue.items.map((item:any)=>item.status),['saved','ready']);assert.ok(queue.items[1].capture);
});
test('same host on a different port, downloads, credentials and encoded action paths are excluded',()=>{
 const result=collectLinkCandidates({sourceUrl:'http://localhost:9000/',title:'home',links:[{href:'http://localhost:9001/users',text:'別port'},{href:'http://user:pass@localhost:9000/users',text:'資格情報'},{href:'/reports.csv',text:'download',download:true},{href:'/%6Cogout',text:'操作'},{href:'/settings?action=delete',text:'設定'},{href:'/profile',text:'プロフィール'}]});assert.deepEqual(result.candidates.map((x:any)=>x.url),['http://localhost:9000/','http://localhost:9000/profile']);
});
test('batch preserves descriptive candidate names when every page has the same document title',async()=>{
 const queue=new BatchImport([{id:'a',url:'https://app.test/customers',title:'顧客管理'}],{capture:async()=>({...capture,title:'デモサイト'}),save:async()=>({})});await queue.acquire(['a']);assert.equal(queue.items[0].title,'顧客管理');
});
test('batch replaces URL placeholders with captured headings while keeping explicit candidate labels',async()=>{
 const candidates=collectLinkCandidates({sourceUrl:'https://app.test/',title:'ホーム',links:[{href:'/settings',text:''},{href:'/users',text:'ユーザー管理'}]}).candidates;
 const queue=new BatchImport(candidates,{capture:async()=>({...capture,title:'設定の見出し'}),save:async()=>({})});await queue.acquire(candidates.map((x:any)=>x.id));
 assert.equal(queue.items.find((x:any)=>x.url.endsWith('/settings')).title,'設定の見出し');assert.equal(queue.items.find((x:any)=>x.url.endsWith('/users')).title,'ユーザー管理');
});
