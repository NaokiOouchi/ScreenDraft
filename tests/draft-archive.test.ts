import {test} from 'node:test';import assert from 'node:assert/strict';
import {encodeArchive,decodeArchive} from '../server/draft-archive';
const data={format:'ScreenDraft',version:1,title:'共有用ドラフト',description:'目的',head:'r1',revisions:[{id:'r1',parentId:null,createdAt:'2026-10-28T00:00:00.000Z',screens:[{id:'s1',title:'一覧',sourceUrl:'https://example.com/',snapshotId:'h1',width:1280,height:900,createdAt:'2026-10-28T00:00:00.000Z',warnings:[],assetCount:0}]}],snapshots:[{id:'h1',html:'<!doctype html><html><head></head><body><main>一覧</main></body></html>'}],assets:[]};
test('ScreenDraft形式を検証して往復する',()=>{const restored=decodeArchive(encodeArchive(data as any));assert.equal(restored.title,data.title);assert.equal(restored.snapshots[0].html,data.snapshots[0].html);});
test('未対応版、参照切れ、過剰データを拒否する',()=>{assert.throws(()=>encodeArchive({...data,version:9} as any));assert.throws(()=>encodeArchive({...data,head:'missing'} as any));assert.throws(()=>decodeArchive(new Uint8Array([0,1,2])));});

test('パス侵入、重複しない余分なファイル、内容の改変を拒否する',async()=>{const {zipSync,unzipSync,strToU8}=await import('fflate');const files=unzipSync(encodeArchive(data as any));assert.throws(()=>decodeArchive(zipSync({...files,'../escape':strToU8('x')})));assert.throws(()=>decodeArchive(zipSync({...files,['assets/'+ 'a'.repeat(64)]:strToU8('x')})));const path=Object.keys(files).find(p=>p.startsWith('snapshots/'))!;assert.throws(()=>decodeArchive(zipSync({...files,[path]:strToU8('<h1>改変</h1>')})));});

test('読み込み上限を超える履歴は書き出し時点で拒否する',()=>{const html='x'.repeat(8*1024*1024),snapshots=Array.from({length:17},(_,i)=>({id:i===0?'h1':'extra'+i,html}));assert.throws(()=>encodeArchive({...data,snapshots} as any));});
