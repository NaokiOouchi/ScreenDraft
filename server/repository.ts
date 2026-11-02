import type {DraftArchive} from './draft-archive.js';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID, createHash } from 'node:crypto';
import {isCaptureIssue} from '../shared/capture-status.js';
import type { EditJob } from '../shared/editor-types.js';
import type { Proposal, ProposalSummary, ProposalDetail, Screen, Revision, RevisionDetail, TrashDetail } from '../shared/types.js';

import type {Repository} from './storage.js';
export type {Repository} from './storage.js';
export class SqliteRepository implements Repository {
  private db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS capture_review_acknowledgements(screenId TEXT PRIMARY KEY, warningHashes TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS draft_export_notes(proposalId TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS proposals(id TEXT PRIMARY KEY, title TEXT NOT NULL, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL, headRevisionId TEXT);
      CREATE TABLE IF NOT EXISTS snapshots(id TEXT PRIMARY KEY, html TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS screens(id TEXT PRIMARY KEY, proposalId TEXT NOT NULL REFERENCES proposals(id), title TEXT NOT NULL, sourceUrl TEXT NOT NULL, snapshotId TEXT NOT NULL REFERENCES snapshots(id), width INTEGER NOT NULL, height INTEGER NOT NULL, createdAt TEXT NOT NULL, assetCount INTEGER NOT NULL, warnings TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS revisions(id TEXT PRIMARY KEY, proposalId TEXT NOT NULL REFERENCES proposals(id), parentId TEXT, createdAt TEXT NOT NULL, reason TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS revision_screens(revisionId TEXT NOT NULL REFERENCES revisions(id), screenId TEXT NOT NULL REFERENCES screens(id), snapshotId TEXT NOT NULL REFERENCES snapshots(id), position INTEGER NOT NULL, PRIMARY KEY(revisionId,screenId));
      CREATE TABLE IF NOT EXISTS edit_jobs(id TEXT PRIMARY KEY, proposalId TEXT NOT NULL, screenId TEXT NOT NULL, baseRevisionId TEXT NOT NULL, baseSnapshotId TEXT NOT NULL, selectedIds TEXT NOT NULL, prompt TEXT NOT NULL, status TEXT NOT NULL, summary TEXT, candidateSnapshotId TEXT, error TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS capture_imports(proposalId TEXT NOT NULL REFERENCES proposals(id), importId TEXT NOT NULL, screenId TEXT NOT NULL REFERENCES screens(id), fingerprint TEXT NOT NULL, PRIMARY KEY(proposalId,importId));
      CREATE TABLE IF NOT EXISTS assets(id TEXT PRIMARY KEY, mime TEXT NOT NULL, size INTEGER NOT NULL);
    `);
    const addColumn=(table:string,name:string,type:string)=>{if(!(this.db.prepare('PRAGMA table_info('+table+')').all() as any[]).some(c=>c.name===name))this.db.exec('ALTER TABLE '+table+' ADD COLUMN '+name+' '+type);};
    this.db.exec('BEGIN IMMEDIATE');try{addColumn('proposals','deletedAt','TEXT');addColumn('screens','deletedAt','TEXT');addColumn('revision_screens','title','TEXT');addColumn('revision_screens','metadata','TEXT');addColumn('capture_imports','result','TEXT');this.db.exec('UPDATE revision_screens SET title=(SELECT title FROM screens WHERE screens.id=revision_screens.screenId) WHERE title IS NULL');for(const row of this.db.prepare('SELECT rs.rowid AS rid,s.* FROM revision_screens rs JOIN screens s ON s.id=rs.screenId WHERE rs.metadata IS NULL').all() as any[])this.db.prepare('UPDATE revision_screens SET metadata=? WHERE rowid=?').run(this.screenMetadata({...row,warnings:JSON.parse(row.warnings)}),row.rid);for(const row of this.db.prepare('SELECT i.rowid AS rid,s.* FROM capture_imports i JOIN screens s ON s.id=i.screenId WHERE i.result IS NULL').all() as any[])this.db.prepare('UPDATE capture_imports SET result=? WHERE rowid=?').run(JSON.stringify(this.readScreen(row)),row.rid);this.db.exec('COMMIT');}catch(e){this.db.exec('ROLLBACK');throw e;}
  }
  exportNotes(id:string){const row=this.db.prepare('SELECT value FROM draft_export_notes WHERE proposalId=?').get(id) as {value:string}|undefined;return row?JSON.parse(row.value):{description:'',screens:{}};}
  saveExportNotes(id:string,value:{description:string;screens:Record<string,string>}){this.requireActive(id);this.db.prepare('INSERT INTO draft_export_notes(proposalId,value) VALUES(?,?) ON CONFLICT(proposalId) DO UPDATE SET value=excluded.value').run(id,JSON.stringify(value));return value;}
  importDraft(a:DraftArchive){
    const proposalId=randomUUID(),now=new Date().toISOString(),revisionIds=new Map(a.revisions.map(r=>[r.id,randomUUID()])),screenIds=new Map<string,string>(),snapshotIds=new Map(a.snapshots.map(s=>[s.id,randomUUID()]));
    const latest=new Map<string,typeof a.revisions[number]['screens'][number]>();for(const r of a.revisions)for(const screen of r.screens){if(!screenIds.has(screen.id))screenIds.set(screen.id,randomUUID());latest.set(screen.id,screen);}
    const current=new Set(a.revisions.find(r=>r.id===a.head)?.screens.map(s=>s.id)||[]);
    this.db.exec('BEGIN IMMEDIATE');try{
      this.db.prepare('INSERT INTO proposals(id,title,createdAt,updatedAt,headRevisionId) VALUES(?,?,?,?,?)').run(proposalId,a.title,now,now,a.head?revisionIds.get(a.head)!:null);
      for(const s of a.snapshots)this.db.prepare('INSERT INTO snapshots(id,html) VALUES(?,?)').run(snapshotIds.get(s.id)!,s.html);
      for(const [id,s] of latest)this.db.prepare('INSERT INTO screens(id,proposalId,title,sourceUrl,snapshotId,width,height,createdAt,assetCount,warnings,deletedAt) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(screenIds.get(id)!,proposalId,s.title,s.sourceUrl,snapshotIds.get(s.snapshotId)!,s.width,s.height,s.createdAt,s.assetCount,JSON.stringify(s.warnings),current.has(id)?null:now);
      for(const r of a.revisions){this.db.prepare('INSERT INTO revisions(id,proposalId,parentId,createdAt,reason) VALUES(?,?,?,?,?)').run(revisionIds.get(r.id)!,proposalId,r.parentId?revisionIds.get(r.parentId)!:null,r.createdAt,'保存版');r.screens.forEach((s,i)=>this.db.prepare('INSERT INTO revision_screens(revisionId,screenId,snapshotId,position,title,metadata) VALUES(?,?,?,?,?,?)').run(revisionIds.get(r.id)!,screenIds.get(s.id)!,snapshotIds.get(s.snapshotId)!,i,s.title,this.screenMetadata(s as Screen)));}
      for(const asset of a.assets)this.db.prepare('INSERT OR IGNORE INTO assets(id,mime,size) VALUES(?,?,?)').run(asset.id,asset.mime,Buffer.from(asset.base64,'base64').length);
      this.saveExportNotes(proposalId,{description:a.description,screens:Object.fromEntries(Object.entries(a.screenNotes).filter(([id])=>screenIds.has(id)).map(([id,note])=>[screenIds.get(id)!,note]))});this.db.exec('COMMIT');return this.detail(proposalId)!;
    }catch(e){this.db.exec('ROLLBACK');throw e;}
  }
  list() { return this.db.prepare(`SELECT p.*, (SELECT COUNT(*) FROM revision_screens rs WHERE rs.revisionId=p.headRevisionId) AS screenCount, (SELECT COUNT(*) FROM edit_jobs j WHERE j.proposalId=p.id AND j.status='ready') AS pendingCount, (SELECT COUNT(*) FROM edit_jobs j WHERE j.proposalId=p.id AND j.status IN ('queued','running')) AS runningCount FROM proposals p WHERE p.deletedAt IS NULL ORDER BY p.updatedAt DESC`).all() as unknown as ProposalSummary[]; }
  create(title: string) {
    const now = new Date().toISOString(), id = randomUUID();
    this.db.prepare('INSERT INTO proposals(id,title,createdAt,updatedAt,headRevisionId) VALUES(?,?,?,?,NULL)').run(id,title,now,now);
    return this.detail(id)!.proposal;
  }
  detail(id: string) {
    const proposal = this.db.prepare('SELECT * FROM proposals WHERE id=? AND deletedAt IS NULL').get(id) as unknown as Proposal | undefined;
    if (!proposal) return;
    const rows = this.db.prepare('SELECT s.*,r.snapshotId,COALESCE(r.title,s.title) AS title,r.metadata FROM screens s JOIN revision_screens r ON r.screenId=s.id WHERE r.revisionId=? ORDER BY r.position').all(proposal.headRevisionId || '') as any[];
    return { proposal, screens: rows.map(row=>this.withCaptureReview(this.readScreen(row))) } as ProposalDetail;
  }
  private warningHashes(screen:Screen){return screen.warnings.filter(isCaptureIssue).map(w=>createHash('sha256').update(w).digest('hex'));}
  private withCaptureReview(screen:Screen):Screen{const row=this.db.prepare('SELECT warningHashes FROM capture_review_acknowledgements WHERE screenId=?').get(screen.id) as {warningHashes:string}|undefined;let acknowledged:string[]=[];try{acknowledged=row?JSON.parse(row.warningHashes):[];}catch{}const hashes=this.warningHashes(screen);return hashes.length>0&&hashes.every(h=>acknowledged.includes(h))?{...screen,captureIssuesReviewed:true}:screen;}
  acknowledgeCaptureIssues(proposalId:string,screenId:string,snapshotId:string):ProposalDetail{const detail=this.requireActive(proposalId),screen=detail.screens.find(s=>s.id===screenId);if(!screen)throw this.missing();if(screen.snapshotId!==snapshotId)throw this.conflict('画面が更新されています。内容を確認し直してください。');const hashes=this.warningHashes(screen);this.db.prepare('INSERT INTO capture_review_acknowledgements(screenId,warningHashes) VALUES(?,?) ON CONFLICT(screenId) DO UPDATE SET warningHashes=excluded.warningHashes').run(screenId,JSON.stringify(hashes));return this.detail(proposalId)!;}
  revisions(proposalId:string):Revision[]{
    return this.db.prepare(`SELECT r.*,ROW_NUMBER() OVER (ORDER BY r.rowid) AS version,
      (SELECT COUNT(*) FROM revision_screens rs WHERE rs.revisionId=r.id) AS screenCount
      FROM revisions r WHERE r.proposalId=? ORDER BY r.rowid DESC`).all(proposalId) as unknown as Revision[];
  }
  revision(proposalId:string,revisionId:string):RevisionDetail|undefined{
    if(!this.detail(proposalId))return;const revision=this.revisions(proposalId).find(r=>r.id===revisionId);if(!revision)return;
    const rows=this.db.prepare('SELECT s.*,r.snapshotId,COALESCE(r.title,s.title) AS title,r.metadata FROM revision_screens r JOIN screens s ON s.id=r.screenId WHERE r.revisionId=? AND s.proposalId=? ORDER BY r.position').all(revisionId,proposalId) as any[];
    return {revision,screens:rows.map(row=>this.readScreen(row))};
  }
  addScreen(proposalId: string, input: Omit<Screen,'id'|'proposalId'|'createdAt'>, html: string, assets: {id: string; mime: string; size: number}[], importKey?:{id:string;fingerprint:string}) {
    if(importKey){const prior=this.importedScreen(proposalId,importKey.id);if(prior){if(prior.fingerprint!==importKey.fingerprint)throw Object.assign(new Error('同じ取り込みIDに異なる内容が指定されました。'),{statusCode:409});return prior.screen;}}
    const detail = this.detail(proposalId); if (!detail) throw new Error('ドラフトが見つかりません。');
    const screen: Screen = { ...input, id: randomUUID(), proposalId, createdAt: new Date().toISOString() };
    const revisionId = randomUUID();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('INSERT INTO snapshots VALUES(?,?)').run(screen.snapshotId,html);
      this.db.prepare('INSERT INTO screens(id,proposalId,title,sourceUrl,snapshotId,width,height,createdAt,assetCount,warnings) VALUES(?,?,?,?,?,?,?,?,?,?)').run(screen.id,proposalId,screen.title,screen.sourceUrl,screen.snapshotId,screen.width,screen.height,screen.createdAt,screen.assetCount,JSON.stringify(screen.warnings));
      this.db.prepare('INSERT INTO revisions VALUES(?,?,?,?,?)').run(revisionId,proposalId,detail.proposal.headRevisionId,screen.createdAt,'画面を追加');
      const add = this.db.prepare('INSERT INTO revision_screens(revisionId,screenId,snapshotId,position,title,metadata) VALUES(?,?,?,?,?,?)');
      detail.screens.forEach((s,i) => add.run(revisionId,s.id,s.snapshotId,i,s.title,this.screenMetadata(s)));
      add.run(revisionId,screen.id,screen.snapshotId,detail.screens.length,screen.title,this.screenMetadata(screen));
      for (const a of assets) this.db.prepare('INSERT OR IGNORE INTO assets VALUES(?,?,?)').run(a.id,a.mime,a.size);
      this.db.prepare('UPDATE proposals SET headRevisionId=?,updatedAt=? WHERE id=?').run(revisionId,screen.createdAt,proposalId);
      if(importKey)this.db.prepare('INSERT INTO capture_imports(proposalId,importId,screenId,fingerprint,result) VALUES(?,?,?,?,?)').run(proposalId,importKey.id,screen.id,importKey.fingerprint,JSON.stringify(screen));
      this.db.exec('COMMIT'); return screen;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  importedScreen(proposalId:string,importId:string){
    const row=this.db.prepare('SELECT s.*,i.fingerprint,i.result FROM capture_imports i JOIN screens s ON s.id=i.screenId WHERE i.proposalId=? AND i.importId=?').get(proposalId,importId) as any;
    if(!row)return;const {fingerprint,result,...screen}=row;return {screen:result?JSON.parse(result):this.readScreen(screen),fingerprint:fingerprint as string};
  }
  createJob(job:EditJob){this.db.prepare('INSERT INTO edit_jobs VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(job.id,job.proposalId,job.screenId,job.baseRevisionId,job.baseSnapshotId,JSON.stringify(job.selectedIds),job.prompt,job.status,job.summary,job.candidateSnapshotId,job.error,job.createdAt,job.updatedAt);return job;}
  job(id:string){const row=this.db.prepare('SELECT * FROM edit_jobs WHERE id=?').get(id) as any;return row?{...row,selectedIds:JSON.parse(row.selectedIds)} as EditJob:undefined;}
  jobs(proposalId:string){return (this.db.prepare("SELECT id FROM edit_jobs WHERE proposalId=? AND (status IN ('queued','running','ready') OR id IN (SELECT id FROM edit_jobs WHERE proposalId=? AND status NOT IN ('queued','running','ready') ORDER BY createdAt DESC,rowid DESC LIMIT 30)) ORDER BY createdAt DESC,rowid DESC").all(proposalId,proposalId) as {id:string}[]).map(r=>this.job(r.id)!);}
  updateJob(id:string,patch:Partial<Pick<EditJob,'status'|'summary'|'candidateSnapshotId'|'error'>>){const job=this.job(id);if(!job)throw new Error('編集が見つかりません。');const next={...job,...patch,updatedAt:new Date().toISOString()};this.db.prepare('UPDATE edit_jobs SET status=?,summary=?,candidateSnapshotId=?,error=?,updatedAt=? WHERE id=?').run(next.status,next.summary,next.candidateSnapshotId,next.error,next.updatedAt,id);return next;}
  storeSnapshot(html:string){const id=randomUUID();this.db.prepare('INSERT INTO snapshots VALUES(?,?)').run(id,html);return id;}
  interruptJobs(){this.db.prepare("UPDATE edit_jobs SET status='failed',error='サーバーが再起動しました。もう一度実行してください。',updatedAt=? WHERE status IN ('queued','running')").run(new Date().toISOString());}
  acceptJob(id:string){
    const job=this.job(id);if(!job||job.status!=='ready'||!job.candidateSnapshotId)throw Object.assign(new Error('採用できる編集候補がありません。'),{statusCode:409});
    const detail=this.detail(job.proposalId);if(!detail||detail.screens.find(s=>s.id===job.screenId)?.snapshotId!==job.baseSnapshotId)throw Object.assign(new Error('対象画面が更新または削除されています。候補を破棄し、最新の画面で再実行してください。'),{statusCode:409});
    const revisionId=randomUUID(),now=new Date().toISOString();this.db.exec('BEGIN IMMEDIATE');
    try{this.db.prepare('INSERT INTO revisions VALUES(?,?,?,?,?)').run(revisionId,job.proposalId,detail.proposal.headRevisionId,now,job.summary||job.prompt);const add=this.db.prepare('INSERT INTO revision_screens(revisionId,screenId,snapshotId,position,title,metadata) VALUES(?,?,?,?,?,?)');detail.screens.forEach((s,i)=>add.run(revisionId,s.id,s.id===job.screenId?job.candidateSnapshotId:s.snapshotId,i,s.title,this.screenMetadata(s)));this.db.prepare('UPDATE proposals SET headRevisionId=?,updatedAt=? WHERE id=?').run(revisionId,now,job.proposalId);this.updateJob(id,{status:'accepted'});this.db.exec('COMMIT');return this.detail(job.proposalId)!;}catch(error){this.db.exec('ROLLBACK');throw error;}
  }
  private screenMetadata(s:Screen){return JSON.stringify({sourceUrl:s.sourceUrl,width:s.width,height:s.height,assetCount:s.assetCount,warnings:s.warnings});}
  private readScreen(row:any):Screen{const {deletedAt,metadata,rid,...s}=row;return {...s,warnings:JSON.parse(s.warnings),...(metadata?JSON.parse(metadata):{})};}
  private requireScreenIdle(proposalId:string,screenId:string){if(this.db.prepare("SELECT id FROM edit_jobs WHERE proposalId=? AND screenId=? AND status IN ('queued','running','ready') LIMIT 1").get(proposalId,screenId))throw this.conflict('対象画面のAI編集を中止するか、確認待ち候補を採用・破棄してから操作してください。');}
  private targetScreen(proposalId:string,screenId:string,baseSnapshotId:string){const detail=this.requireActive(proposalId);const screen=detail.screens.find(s=>s.id===screenId);if(!screen)throw this.missing();this.requireScreenIdle(proposalId,screenId);if(screen.snapshotId!==baseSnapshotId)throw this.conflict('対象画面が更新されています。一覧を読み込み直し、更新先と内容を確認してください。');return {detail,screen};}
  restoreHistoryScreen(proposalId:string,screenId:string,revisionId:string,baseSnapshotId:string){
    const {detail,screen}=this.targetScreen(proposalId,screenId,baseSnapshotId);const history=this.revision(proposalId,revisionId),past=history?.screens.find(s=>s.id===screenId);if(!past)throw this.missing();
    if(screen.snapshotId===past.snapshotId&&screen.title===past.title&&this.screenMetadata(screen)===this.screenMetadata(past))return detail;
    this.db.exec('BEGIN IMMEDIATE');try{this.db.prepare('UPDATE screens SET title=?,sourceUrl=?,snapshotId=?,width=?,height=?,assetCount=?,warnings=? WHERE id=?').run(past.title,past.sourceUrl,past.snapshotId,past.width,past.height,past.assetCount,JSON.stringify(past.warnings),screenId);this.writeRevision(detail,detail.screens.map(s=>s.id===screenId?past:s),'履歴v'+history!.revision.version+'から画面を復元：'+past.title);this.db.exec('COMMIT');return this.detail(proposalId)!;}catch(e){this.db.exec('ROLLBACK');throw e;}
  }
  updateScreen(proposalId:string,screenId:string,baseSnapshotId:string,input:Omit<Screen,'id'|'proposalId'|'createdAt'>,html:string,assets:{id:string;mime:string;size:number}[],importKey?:{id:string;fingerprint:string}){
    if(importKey){const prior=this.importedScreen(proposalId,importKey.id);if(prior){if(prior.fingerprint!==importKey.fingerprint)throw this.conflict('同じ取り込みIDに異なる内容が指定されました。');return prior.screen;}}
    const {detail,screen}=this.targetScreen(proposalId,screenId,baseSnapshotId),next={...screen,...input};
    this.db.exec('BEGIN IMMEDIATE');try{this.db.prepare('INSERT INTO snapshots VALUES(?,?)').run(next.snapshotId,html);for(const a of assets)this.db.prepare('INSERT OR IGNORE INTO assets VALUES(?,?,?)').run(a.id,a.mime,a.size);this.db.prepare('UPDATE screens SET title=?,sourceUrl=?,snapshotId=?,width=?,height=?,assetCount=?,warnings=? WHERE id=?').run(next.title,next.sourceUrl,next.snapshotId,next.width,next.height,next.assetCount,JSON.stringify(next.warnings),screenId);this.writeRevision(detail,detail.screens.map(s=>s.id===screenId?next:s),'画面を再取り込み：'+next.title);if(importKey)this.db.prepare('INSERT INTO capture_imports(proposalId,importId,screenId,fingerprint,result) VALUES(?,?,?,?,?)').run(proposalId,importKey.id,screenId,importKey.fingerprint,JSON.stringify(next));this.db.exec('COMMIT');return next;}catch(e){this.db.exec('ROLLBACK');throw e;}
  }
  private missing(){return Object.assign(new Error('対象が見つかりません。'),{statusCode:404});}
  private conflict(message:string){return Object.assign(new Error(message),{statusCode:409});}
  private requireActive(id:string){const d=this.detail(id);if(!d)throw this.missing();return d;}
  private requireIdle(id:string){if(this.db.prepare("SELECT id FROM edit_jobs WHERE proposalId=? AND status IN ('queued','running','ready') LIMIT 1").get(id))throw this.conflict('実行中の編集を中止するか、確認待ちの候補を採用・破棄してから操作してください。');}
  private writeRevision(detail:ProposalDetail,screens:Screen[],reason:string){
    const id=randomUUID(),now=new Date().toISOString();this.db.prepare('INSERT INTO revisions VALUES(?,?,?,?,?)').run(id,detail.proposal.id,detail.proposal.headRevisionId,now,reason);
    const add=this.db.prepare('INSERT INTO revision_screens(revisionId,screenId,snapshotId,position,title,metadata) VALUES(?,?,?,?,?,?)');screens.forEach((s,i)=>add.run(id,s.id,s.snapshotId,i,s.title,this.screenMetadata(s)));this.db.prepare('UPDATE proposals SET headRevisionId=?,updatedAt=? WHERE id=?').run(id,now,detail.proposal.id);
  }
  renameProposal(id:string,title:string){this.requireActive(id);this.db.prepare('UPDATE proposals SET title=?,updatedAt=? WHERE id=?').run(title,new Date().toISOString(),id);return this.detail(id)!.proposal;}
  trashProposal(id:string){this.requireActive(id);this.requireIdle(id);const now=new Date().toISOString();this.db.prepare('UPDATE proposals SET deletedAt=?,updatedAt=? WHERE id=?').run(now,now,id);}
  restoreProposal(id:string){const p=this.db.prepare('SELECT id,deletedAt FROM proposals WHERE id=?').get(id) as any;if(!p)throw this.missing();if(!p.deletedAt)throw this.conflict('このドラフトはゴミ箱にありません。');this.db.prepare('UPDATE proposals SET deletedAt=NULL,updatedAt=? WHERE id=?').run(new Date().toISOString(),id);return this.detail(id)!.proposal;}
  private changeScreen(proposalId:string,screenId:string,action:'rename'|'trash'|'restore',title?:string){
    const d=this.requireActive(proposalId);this.requireIdle(proposalId);const row=this.db.prepare('SELECT * FROM screens WHERE id=? AND proposalId=?').get(screenId,proposalId) as any;if(!row)throw this.missing();
    const active=d.screens.find(s=>s.id===screenId);
    if(action==='restore'){if(!row.deletedAt)throw this.conflict('この画面はゴミ箱にありません。');}
    else if(!active||row.deletedAt)throw this.missing();
    if(action==='rename'&&active!.title===title)return d;
    let screens=d.screens;
    this.db.exec('BEGIN IMMEDIATE');try{
      if(action==='rename'){this.db.prepare('UPDATE screens SET title=? WHERE id=?').run(title!,screenId);screens=screens.map(s=>s.id===screenId?{...s,title:title!}:s);}
      if(action==='trash'){this.db.prepare('UPDATE screens SET deletedAt=? WHERE id=?').run(new Date().toISOString(),screenId);screens=screens.filter(s=>s.id!==screenId);}
      if(action==='restore'){const latest=this.db.prepare('SELECT rs.snapshotId,rs.title,rs.metadata FROM revision_screens rs JOIN revisions r ON r.id=rs.revisionId WHERE rs.screenId=? AND r.proposalId=? ORDER BY r.rowid DESC LIMIT 1').get(screenId,proposalId) as any;if(!latest)throw this.missing();this.db.prepare('UPDATE screens SET deletedAt=NULL WHERE id=?').run(screenId);screens=[...screens,this.readScreen({...row,...latest,title:latest.title||row.title})];}
      this.writeRevision(d,screens,action==='rename'?'画面名を変更：'+title:action==='trash'?'画面をゴミ箱へ：'+row.title:'画面を復元：'+row.title);this.db.exec('COMMIT');return this.detail(proposalId)!;
    }catch(e){this.db.exec('ROLLBACK');throw e;}
  }
  renameScreen(proposalId:string,screenId:string,title:string){return this.changeScreen(proposalId,screenId,'rename',title);}
  trashScreen(proposalId:string,screenId:string){return this.changeScreen(proposalId,screenId,'trash');}
  restoreScreen(proposalId:string,screenId:string){return this.changeScreen(proposalId,screenId,'restore');}
  trash():TrashDetail{return{proposals:this.db.prepare('SELECT * FROM proposals WHERE deletedAt IS NOT NULL ORDER BY deletedAt DESC').all() as any,screens:(this.db.prepare('SELECT s.*,p.title AS proposalTitle FROM screens s JOIN proposals p ON p.id=s.proposalId WHERE s.deletedAt IS NOT NULL AND p.deletedAt IS NULL ORDER BY s.deletedAt DESC').all() as any[]).map(s=>({...s,warnings:JSON.parse(s.warnings)}))};}
  snapshot(id: string) { return this.db.prepare('SELECT html FROM snapshots WHERE id=?').get(id) as {html:string} | undefined; }
  asset(id: string) { return this.db.prepare('SELECT mime FROM assets WHERE id=?').get(id) as {mime:string} | undefined; }
  close() { this.db.close(); }
}
