import {parse,serialize} from 'parse5';
import type {SqliteRepository} from './repository.js';
import type {AssetStore} from './assets.js';
import {normalizeCapture} from './normalize.js';
import type {DraftArchive} from './draft-archive.js';
export async function exportDraft(repo:SqliteRepository,store:AssetStore,id:string):Promise<DraftArchive>{
 const detail=repo.detail(id);if(!detail)throw Object.assign(Error('ドラフトが見つかりません。'),{statusCode:404});
 if(repo.jobs(id).some(j=>['queued','running','ready'].includes(j.status)))throw Object.assign(Error('実行中の編集を中止するか、編集候補を保存・破棄してから書き出してください。'),{statusCode:409});
 const revisions=repo.revisions(id).reverse().map(r=>{const d=repo.revision(id,r.id)!;return {id:r.id,parentId:r.parentId,createdAt:r.createdAt,screens:d.screens.map(({proposalId,...s})=>({...s,warnings:s.warnings.map(w=>w.length>2000||/^資産が不足しています: null(?:application|font|image)\//i.test(w)?'取り込み時の長いリソース警告を省略しました。':w)}))};});
 const snapshotIds=[...new Set(revisions.flatMap(r=>r.screens.map(s=>s.snapshotId)))],snapshots=snapshotIds.map(id=>({id,html:repo.snapshot(id)!.html}));
 const assets:DraftArchive['assets']=[],seen=new Set<string>();
 const visit=async(text:string)=>{for(const match of text.matchAll(/\/api\/assets\/([a-f0-9]{64})/g)){const id=match[1];if(seen.has(id))continue;seen.add(id);const a=repo.asset(id);if(!a)throw Error('表示に必要なリソースが見つかりません。');const bytes=await store.get(id);assets.push({id,mime:a.mime,base64:bytes.toString('base64')});if(a.mime==='text/css')await visit(bytes.toString('utf8'));}};
 for(const s of snapshots)await visit(s.html);
 if(repo.detail(id)?.proposal.headRevisionId!==detail.proposal.headRevisionId)throw Object.assign(Error('保存内容が更新されました。もう一度書き出してください。'),{statusCode:409});
 return {format:'ScreenDraft',version:1,title:detail.proposal.title,description:repo.exportNotes(id).description,screenNotes:repo.exportNotes(id).screens,head:detail.proposal.headRevisionId,revisions,snapshots,assets};
}
export async function sanitizeDraft(a:DraftArchive):Promise<DraftArchive>{
 const files=new Map<string,Buffer>(),store={put:async(id:string,bytes:Buffer)=>{files.set(id,bytes);},get:async(id:string)=>files.get(id)!};
 const base='https://screendraft.invalid/',resources=a.assets.map(asset=>({url:base+'api/assets/'+asset.id,mime:asset.mime,base64:asset.base64}));
 const capture={schemaVersion:1 as const,title:a.title,sourceUrl:base,baseUrl:base,viewport:{width:1280,height:900},html:'<!doctype html><html><head></head><body></body></html>',stylesheets:[],resourceUrls:[],resources,warnings:[],capturedAt:new Date().toISOString()};
 const normalized=await normalizeCapture(capture,store,undefined,{maxResourceBytes:128*1024*1024});
 if(normalized.assets.length!==a.assets.length)throw Object.assign(Error('対応していないリソースが含まれています。'),{statusCode:400});
 const resourceMap=new Map(a.assets.map(asset=>[asset.id,normalized.resourceMap[base+'api/assets/'+asset.id]]));
 const rewrite=(text:string)=>text.replace(/\/api\/assets\/([a-f0-9]{64})/g,(_,id)=>resourceMap.has(id)?'/api/assets/'+resourceMap.get(id):'data:,');
 const snapshots=[];for(const original of a.snapshots){const doc=parse(rewrite(original.html));const styles:string[]=[];const walk=(node:any)=>{if(node.tagName==='style')styles.push((node.childNodes||[]).map((n:any)=>n.value||'').join(''));for(const child of node.childNodes||[])walk(child);};walk(doc);
 const result=await normalizeCapture({...capture,resources:[],html:serialize(doc),stylesheets:styles.map(css=>({url:base,css}))},store,id=>files.has(id));snapshots.push({id:original.id,html:result.html});}
 const assets=normalized.assets.map(asset=>({id:asset.id,mime:asset.mime,base64:files.get(asset.id)!.toString('base64')}));
 return {...a,snapshots,assets};
}
