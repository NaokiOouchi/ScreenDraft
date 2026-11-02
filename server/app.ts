import {reviewPlan,reviewZip,reviewRequest,zipRequest} from './review-export.js';
import {encodeArchive,decodeArchive} from './draft-archive.js';
import {exportDraft,sanitizeDraft} from './draft-transfer.js';
import type {ImportEvent} from '../shared/import-sync.js';
import {checkAiReadiness} from './ai-readiness.js';
import {CapturePreviews} from './capture-previews.js';
import {editorPreview} from './preview.js';
import {EditJobs} from './jobs.js';
import {claudeRunner,type AiRunner} from './ai.js';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { resolve } from 'node:path';
import { z } from 'zod';
import { SqliteRepository } from './repository.js';
import { LocalAssetStore, hash } from './assets.js';
import { normalizeCapture, replayCsp } from './normalize.js';
import { captureSchema } from './schema.js';

export async function createApp(options: { dataDir: string; port?: number; frontend?: boolean; resourceRoot?: string; aiRunner?: AiRunner }) {
  const resource=(path:string)=>resolve(options.resourceRoot||process.cwd(),path);
  await mkdir(options.dataDir, { recursive: true, mode: 0o700 });
  const repo = new SqliteRepository(resolve(options.dataDir, 'change-note.sqlite'));
  const assetStore = new LocalAssetStore(resolve(options.dataDir, 'assets'));
  const capturePreviews=new CapturePreviews();
  const jobs = new EditJobs(repo,assetStore,options.aiRunner||claudeRunner);
  const keyFile = resolve(options.dataDir, 'connection-key');
  let key: string;
  try { key = (await readFile(keyFile,'utf8')).trim(); }
  catch { key = randomBytes(32).toString('hex'); await writeFile(keyFile,key,{ mode:0o600 }); }
  const app = Fastify({ logger: false, bodyLimit: 56 * 1024 * 1024 });
  const instanceId=randomUUID();let connectedAt:string|null=null,importSequence=0;const importEvents:ImportEvent[]=[],publishedImports=new Set<string>();
  const port = options.port ?? 4174;
  const localOrigin = (origin: string) => [`http://127.0.0.1:${port}`, `http://localhost:${port}`, 'http://127.0.0.1:4173', 'http://localhost:4173'].includes(origin);
  const authorized = (header: string | undefined) => {
    const supplied = header?.replace(/^Bearer /, '') || '';
    return supplied.length === key.length && timingSafeEqual(Buffer.from(supplied),Buffer.from(key));
  };
  await app.register(cors, { origin: (origin,cb) => cb(null, !origin || localOrigin(origin) || /^chrome-extension:\/\/[a-z]{32}$/.test(origin)), allowedHeaders: ['Content-Type','Authorization','Idempotency-Key'] });
  app.addHook('onRequest', async (req,reply) => {
    const host = req.headers.host?.split(':')[0];
    if (host && !['127.0.0.1','localhost'].includes(host)) return reply.code(403).send({error:'ローカル環境からのみ利用できます。'});
    const origin = req.headers.origin;
    const isAsset = req.url.startsWith('/api/assets/') || /^\/api\/capture-previews\/[a-f0-9-]{36}\/assets\/[a-f0-9]{64}$/.test(req.url);
    if (req.method === 'OPTIONS') return;
    if (isAsset && req.method === 'GET') return;
    if (origin && !localOrigin(origin) && !authorized(req.headers.authorization)) return reply.code(403).send({error:'接続キーを確認してください。'});
    if (req.url === '/api/session' && origin && !localOrigin(origin)) return reply.code(403).send({error:'アプリから接続キーを確認してください。'});
  });
  app.setErrorHandler((error,req,reply) => {
    if (error instanceof z.ZodError) return reply.code(400).send({error:'入力データの形式が正しくありません。',details:error.issues.slice(0,4).map(i=>i.path.join('.')+': '+i.message)});
    const failure = error as {statusCode?:number;message?:string};
    const status = failure.statusCode && failure.statusCode < 500 ? failure.statusCode : 500;
    reply.code(status).send({error:status === 413 ? '取り込みデータが大きすぎます。' : status === 500 ? '保存できませんでした。サイズとデータの確認後に再実行してください。' : failure.message || 'リクエストを確認してください。'});
  });
  app.get('/api/health', async () => ({ok:true,phase:'editing',storage:'local',aiProvider:'claude-code',features:{screenReimport:true,historyRestore:true,importSync:true}}));
  app.get('/api/ai-readiness',async(_req,reply)=>reply.header('Cache-Control','no-store').send(await checkAiReadiness()));
  app.post('/api/capture-previews',async(req,reply)=>reply.code(201).header('Cache-Control','no-store').send(await capturePreviews.create(captureSchema.parse(req.body))));
  app.get<{Params:{id:string}}>('/api/capture-previews/:id',async(req,reply)=>{const p=capturePreviews.get(req.params.id);if(!p)return reply.code(404).send('プレビューの有効期限が切れました。再作成してください。');return reply.type('text/html; charset=utf-8').header('Content-Security-Policy',replayCsp.replace("frame-ancestors 'self'","frame-ancestors 'self' chrome-extension:")).header('Cache-Control','no-store').header('X-Content-Type-Options','nosniff').send(p.html);});
  app.delete<{Params:{id:string}}>('/api/capture-previews/:id',async(req,reply)=>{capturePreviews.remove(req.params.id);return reply.code(204).send();});
  app.get<{Params:{id:string;assetId:string}}>('/api/capture-previews/:id/assets/:assetId',async(req,reply)=>{const a=capturePreviews.get(req.params.id)?.assets.get(req.params.assetId);if(!a)return reply.code(404).send('プレビュー資産が見つかりません。');return reply.type(a.mime).header('Access-Control-Allow-Origin','*').header('Cross-Origin-Resource-Policy','cross-origin').header('Content-Security-Policy',"default-src 'none'; sandbox").header('X-Content-Type-Options','nosniff').header('Cache-Control','no-store').send(a.bytes);});
  app.get('/api/extension-state',async(_req,reply)=>reply.header('Cache-Control','no-store').send({instanceId,connectedAt,sequence:importSequence,imports:importEvents}));
  app.addContentTypeParser('application/x-screendraft',{parseAs:'buffer',bodyLimit:64*1024*1024},(_req,body,done)=>done(null,body));
  const imports=new Map<string,{archive:Awaited<ReturnType<typeof sanitizeDraft>>;expires:number}>();
  app.post('/api/draft-imports/preview',async(req)=>{
    for(const [id,item] of imports)if(item.expires<Date.now())imports.delete(id);
    if(imports.size>=3)throw Object.assign(Error('読み込み確認が上限に達しました。10分後に再試行してください。'),{statusCode:429});
    if(!Buffer.isBuffer(req.body))throw Object.assign(Error('ScreenDraftファイルを選択してください。'),{statusCode:400});
    const archive=await sanitizeDraft(decodeArchive(req.body)),token=randomUUID();imports.set(token,{archive,expires:Date.now()+10*60*1000});
    return {token,title:archive.title,description:archive.description,screenCount:archive.revisions.find(r=>r.id===archive.head)?.screens.length||0,revisionCount:archive.revisions.length};
  });
  app.delete<{Params:{id:string}}>('/api/draft-imports/:id',async(req)=>{imports.delete(req.params.id);return {ok:true};});
  app.post<{Params:{id:string}}>('/api/draft-imports/:id',async(req)=>{const item=imports.get(req.params.id);if(!item||item.expires<Date.now())throw Object.assign(Error('確認の有効期限が切れました。ファイルを選び直してください。'),{statusCode:410});const {title}=z.object({title:z.string().trim().min(1).max(120)}).parse(req.body);for(const asset of item.archive.assets)await assetStore.put(asset.id,Buffer.from(asset.base64,'base64'));const detail=repo.importDraft({...item.archive,title});imports.delete(req.params.id);return detail;});
  app.post<{Params:{id:string}}>('/api/proposals/:id/archive',async(req,reply)=>{const {title}=z.object({title:z.string().trim().min(1).max(120)}).parse(req.body);return reply.type('application/x-screendraft').header('Cache-Control','no-store').send(Buffer.from(encodeArchive({...await exportDraft(repo,assetStore,req.params.id),title})));});
  app.get<{Params:{id:string}}>('/api/proposals/:id/archive',async(req,reply)=>{const bytes=encodeArchive(await exportDraft(repo,assetStore,req.params.id));return reply.type('application/x-screendraft').header('Cache-Control','no-store').send(Buffer.from(bytes));});
  app.post<{Params:{id:string}}>('/api/proposals/:id/review-plan',async(req)=>reviewPlan(repo,req.params.id,reviewRequest.parse(req.body)));
  app.post<{Params:{id:string}}>('/api/proposals/:id/review-zip',{bodyLimit:180*1024*1024},async(req,reply)=>reply.type('application/zip').header('Cache-Control','no-store').send(Buffer.from(reviewZip(repo,req.params.id,zipRequest.parse(req.body)))));
  app.get<{Params:{id:string}}>('/api/proposals/:id/export-notes',async(req)=>{if(!repo.detail(req.params.id))throw Object.assign(Error('ドラフトが見つかりません。'),{statusCode:404});return repo.exportNotes(req.params.id);});
  app.put<{Params:{id:string}}>('/api/proposals/:id/export-notes',async(req)=>repo.saveExportNotes(req.params.id,z.object({description:z.string().max(10000),screens:z.record(z.string().uuid(),z.string().max(10000))}).parse(req.body)));
  app.get('/api/session', async () => ({connectionKey:key}));
  app.get('/api/trash',async()=>repo.trash());
  app.patch<{Params:{id:string}}>('/api/proposals/:id',async req=>repo.renameProposal(req.params.id,z.object({title:z.string().trim().min(1).max(120)}).parse(req.body).title));
  app.delete<{Params:{id:string}}>('/api/proposals/:id',async req=>{repo.trashProposal(req.params.id);return{ok:true};});
  app.post<{Params:{id:string}}>('/api/proposals/:id/restore',async req=>repo.restoreProposal(req.params.id));
  app.post<{Params:{id:string;screenId:string}}>('/api/proposals/:id/screens/:screenId/capture-review',async req=>{const body=z.object({snapshotId:z.string().uuid()}).parse(req.body);return repo.acknowledgeCaptureIssues(req.params.id,req.params.screenId,body.snapshotId);});
  app.patch<{Params:{id:string;screenId:string}}>('/api/proposals/:id/screens/:screenId',async req=>repo.renameScreen(req.params.id,req.params.screenId,z.object({title:z.string().trim().min(1).max(300)}).parse(req.body).title));
  app.delete<{Params:{id:string;screenId:string}}>('/api/proposals/:id/screens/:screenId',async req=>repo.trashScreen(req.params.id,req.params.screenId));
  app.post<{Params:{id:string;screenId:string}}>('/api/proposals/:id/screens/:screenId/restore',async req=>repo.restoreScreen(req.params.id,req.params.screenId));
  app.post<{Params:{id:string;screenId:string}}>('/api/proposals/:id/screens/:screenId/history-restore',async req=>{const body=z.object({revisionId:z.string().uuid(),baseSnapshotId:z.string().uuid()}).parse(req.body);return repo.restoreHistoryScreen(req.params.id,req.params.screenId,body.revisionId,body.baseSnapshotId);});
  app.get('/api/proposals', async req => {if(authorized(req.headers.authorization))connectedAt=new Date().toISOString();return repo.list();});
  app.post('/api/proposals', async req => repo.create(z.object({title:z.string().trim().min(1).max(120)}).parse(req.body).title));
  app.get<{Params:{id:string}}>('/api/proposals/:id', async (req,reply) => {
    const detail = await repo.detail(req.params.id); return detail || reply.code(404).send({error:'ドラフトが見つかりません。'});
  });
  app.get<{Params:{id:string}}>('/api/proposals/:id/revisions',async(req,reply)=>{
    if(!await repo.detail(req.params.id))return reply.code(404).send({error:'ドラフトが見つかりません。'});
    return repo.revisions(req.params.id);
  });
  app.get<{Params:{id:string;revisionId:string}}>('/api/proposals/:id/revisions/:revisionId',async(req,reply)=>{
    return await repo.revision(req.params.id,req.params.revisionId)||reply.code(404).send({error:'このドラフトの履歴が見つかりません。'});
  });
  app.post<{Params:{id:string}}>('/api/proposals/:id/captures', async (req,reply) => {
    if (!await repo.detail(req.params.id)) return reply.code(404).send({error:'ドラフトが見つかりません。'});
    const capture = captureSchema.parse(req.body);
    const target=z.object({updateScreenId:z.string().uuid().optional(),baseSnapshotId:z.string().uuid().optional()}).refine(v=>!!v.updateScreenId===!!v.baseSnapshotId,{message:'更新対象と基準snapshotを指定してください。'}).parse(req.body);
    const importId=z.string().uuid().optional().parse(req.headers['idempotency-key']);
    const importKey=importId?{id:importId,fingerprint:hash(JSON.stringify(target.updateScreenId?{capture,target}:capture))}:undefined;
    if(importKey){const prior=repo.importedScreen(req.params.id,importKey.id);if(prior){if(prior.fingerprint!==importKey.fingerprint)return reply.code(409).send({error:'同じ取り込みIDに異なる内容が指定されました。'});return reply.code(201).send(prior.screen);}}
    const result = await normalizeCapture(capture,assetStore);
    const source = new URL(capture.sourceUrl); source.search='';source.hash='';source.username='';source.password='';
    const input={
      title:capture.title,sourceUrl:source.href,snapshotId:randomUUID(),width:capture.viewport.width,height:capture.viewport.height,
      assetCount:result.assets.length,warnings:result.warnings,
    };
    const screen=target.updateScreenId?repo.updateScreen(req.params.id,target.updateScreenId,target.baseSnapshotId!,input,result.html,result.assets,importKey):repo.addScreen(req.params.id,input,result.html,result.assets,importKey);
    if(authorized(req.headers.authorization)){connectedAt=new Date().toISOString();const identity=screen.id+':'+screen.snapshotId;if(!publishedImports.has(identity)){publishedImports.add(identity);if(publishedImports.size>1000)publishedImports.delete(publishedImports.values().next().value!);importEvents.push({sequence:++importSequence,proposalId:req.params.id,screenId:screen.id});if(importEvents.length>100)importEvents.shift();}}
    return reply.code(201).send(screen);
  });
  app.get<{Params:{id:string}}>('/api/proposals/:id/edits',async req=>repo.jobs(req.params.id));
  app.post<{Params:{id:string}}>('/api/proposals/:id/edits',async(req,reply)=>{
    const body=z.object({screenId:z.string().uuid(),baseRevisionId:z.string().uuid(),selectedIds:z.array(z.string().min(1).max(100)).min(1).max(8),prompt:z.string().trim().min(1).max(4000)}).parse(req.body);
    return reply.code(202).send(await jobs.start(req.params.id,body.screenId,body.baseRevisionId,[...new Set(body.selectedIds)],body.prompt));
  });
  app.get<{Params:{id:string}}>('/api/edits/:id',async(req,reply)=>await repo.job(req.params.id)||reply.code(404).send({error:'編集が見つかりません。'}));
  app.post<{Params:{id:string}}>('/api/edits/:id/accept',async req=>repo.acceptJob(req.params.id));
  app.post<{Params:{id:string}}>('/api/edits/:id/cancel',async req=>jobs.cancel(req.params.id));
  app.get<{Params:{id:string};Querystring:{channel?:string}}>('/api/previews/:id',async(req,reply)=>{
    const snapshot=await repo.snapshot(req.params.id);if(!snapshot)return reply.code(404).send('画面が見つかりません。');
    const channel=z.string().uuid().parse(req.query.channel);const preview=editorPreview(snapshot.html,channel);
    return reply.type('text/html; charset=utf-8').header('Content-Security-Policy',preview.csp).header('Cache-Control','no-store').header('X-Content-Type-Options','nosniff').send(preview.html);
  });
  app.get<{Params:{id:string}}>('/api/snapshots/:id', async (req,reply) => {
    const snapshot = await repo.snapshot(req.params.id);
    if (!snapshot) return reply.code(404).send('画面が見つかりません。');
    return reply.header('Content-Type','text/html; charset=utf-8').header('Content-Security-Policy',replayCsp).header('X-Content-Type-Options','nosniff').header('Cache-Control','no-store').send(snapshot.html);
  });
  app.get<{Params:{id:string}}>('/api/assets/:id', async (req,reply) => {
    const asset = await repo.asset(req.params.id);
    if (!asset) return reply.code(404).send('資産が見つかりません。');
    const bytes = await assetStore.get(req.params.id);
    return reply.header('Content-Type',asset.mime).header('Access-Control-Allow-Origin','*').header('Cross-Origin-Resource-Policy','cross-origin').header('Content-Security-Policy',"default-src 'none'; sandbox").header('X-Content-Type-Options','nosniff').header('Cache-Control','public, max-age=31536000, immutable').send(bytes);
  });
  await app.register(fastifyStatic,{root:resource('public'),prefix:'/sample-static/',decorateReply:false});
  for(const sample of ['users','profile','mypage','search']) app.get('/sample/'+sample,async(_req,reply)=>reply.type('text/html; charset=utf-8').send(await readFile(resource('fixtures/'+sample+'.html'),'utf8')));
  if (options.frontend) {
    await app.register(fastifyStatic,{root:resource('dist/client'),prefix:'/',decorateReply:false});
    app.setNotFoundHandler(async (req,reply) => {
      if (req.url.startsWith('/api/')) return reply.code(404).send({error:'見つかりません。'});
      return reply.type('text/html').send(await readFile(resource('dist/client/index.html'),'utf8'));
    });
  }
  app.addHook('onClose', async()=>{imports.clear();capturePreviews.close();jobs.close();repo.close();});
  return app;
}
