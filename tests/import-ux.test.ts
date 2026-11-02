import {test} from 'node:test';import assert from 'node:assert/strict';
// @ts-ignore
import {collectLinkCandidates} from '../shared/batch-import.js';
// @ts-ignore
import {captureDocument} from '../shared/capture.js';
// @ts-ignore
import {batchSaveState} from '../shared/import-ux.js';
// @ts-ignore
import {nodeLabel,scopeChoices} from '../shared/selection-ux.js';
test('current page uses its navigation label instead of the shared site title',()=>{const r=collectLinkCandidates({sourceUrl:'https://demo.test/',title:'デモサイト',links:[{href:'/',text:''},{href:'/',text:'ダッシュボード'},{href:'/customers',text:'顧客管理'}]});assert.equal(r.candidates[0].title,'ダッシュボード');});
test('capture prefers a page heading and keeps the document title as metadata',()=>{const doc:any={URL:'https://demo.test/customers',baseURI:'https://demo.test/',title:'デモサイト',defaultView:{innerWidth:1280,innerHeight:900},body:{innerText:''},styleSheets:[],querySelector:()=>({textContent:'顧客管理'}),documentElement:{nodeType:1,localName:'html',attributes:[],childNodes:[]}};const r=captureDocument(doc);assert.equal(r.title,'顧客管理');assert.equal(r.documentTitle,'デモサイト');});
test('save state distinguishes completion from unchecked review and partial failure',()=>{
 assert.equal(batchSaveState([{id:'a',status:'saved'}],[],false).complete,true);
 assert.equal(batchSaveState([{id:'a',status:'ready'}],['a'],false).hint,'内容の確認後に確認チェックを入れてください。');
 assert.equal(batchSaveState([{id:'a',status:'saved'},{id:'b',status:'save-failed'}],['b'],true).complete,false);
 assert.equal(batchSaveState([{id:'a',status:'ready'}],[],false).hint,'保存する取得済み画面を選択してください。');
});
test('semantic scope shortcuts find main beyond five wrappers without duplicate current scope',()=>{
 const n={id:'cell',tag:'td',text:'山田',ancestors:[{id:'table',tag:'table',text:''},...Array.from({length:6},(_,i)=>({id:'d'+i,tag:'div',text:''})),{id:'main',tag:'main',text:''}]};
 assert.deepEqual(scopeChoices(n).map((x:any)=>x.id),['table','main']);assert.equal(nodeLabel({tag:'h2',text:'顧客一覧'}),'見出し');assert.equal(scopeChoices({...n,id:'main',tag:'main',ancestors:[]}).length,0);
});

test('screen names ignore slash-only links and use same-URL navigation before headings',()=>{
 const links=[{href:'https://demo.test/',textContent:' / ',getAttribute:()=>null},{href:'https://demo.test/',textContent:'ダッシュボード',getAttribute:()=>null}];
 const doc:any={URL:'https://demo.test/',baseURI:'https://demo.test/',title:'デモサイト',defaultView:{innerWidth:1280,innerHeight:900},body:{innerText:''},styleSheets:[],querySelectorAll:()=>links,querySelector:()=>({textContent:'売上'}),documentElement:{nodeType:1,localName:'html',attributes:[],childNodes:[]}};
 assert.equal(captureDocument(doc).title,'ダッシュボード');
 const result=collectLinkCandidates({sourceUrl:'https://demo.test/customers',title:'顧客管理',links:[{href:'/',text:'/'},{href:'/',text:'ダッシュボード'}]});
 assert.equal(result.candidates.find((x:any)=>x.url==='https://demo.test/')?.title,'ダッシュボード');
});
test('blank headings fall through to document title and unnamed root becomes top page',()=>{
 const doc:any={URL:'https://demo.test/',baseURI:'https://demo.test/',title:'デモサイト',defaultView:{innerWidth:1280,innerHeight:900},body:{innerText:''},styleSheets:[],querySelectorAll:()=>[],querySelector:()=>({textContent:'  '}),documentElement:{nodeType:1,localName:'html',attributes:[],childNodes:[]}};
 assert.equal(captureDocument(doc).title,'デモサイト');doc.title='';assert.equal(captureDocument(doc).title,'トップページ');
 assert.equal(collectLinkCandidates({sourceUrl:doc.URL,title:'',links:[]}).candidates[0].title,'トップページ');
 doc.URL='https://demo.test/settings';assert.equal(captureDocument(doc).title,'/settings');
});
