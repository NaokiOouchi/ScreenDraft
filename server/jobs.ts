import {randomUUID} from 'node:crypto';
import type {Repository} from './storage.js';
import type {AssetStore} from './assets.js';
import type {AiRunner} from './ai.js';
import {editContext,applyEdit} from './editing.js';
export class EditJobs {
 private controllers=new Map<string,AbortController>();private closed=false;
 constructor(private repo:Repository,private store:AssetStore,private runner:AiRunner){repo.interruptJobs();}
 start(proposalId:string,screenId:string,baseRevisionId:string,selectedIds:string[],prompt:string){
  if(this.closed)throw new Error('終了中です。');
  if(this.controllers.size>=2)throw Object.assign(new Error('実行中の編集が完了するまでお待ちください。'),{statusCode:429});
  const detail=this.repo.detail(proposalId),screen=detail?.screens.find(s=>s.id===screenId);
  if(!screen)throw Object.assign(new Error('画面が見つかりません。'),{statusCode:404});
  if(detail!.proposal.headRevisionId!==baseRevisionId)throw Object.assign(new Error('ドラフトが更新されています。画面を再読み込みしてください。'),{statusCode:409});
  if(this.repo.jobs(proposalId).some(j=>j.screenId===screenId&&['queued','running','ready'].includes(j.status)))throw Object.assign(new Error('この画面には確認待ち、または実行中の編集があります。'),{statusCode:409});
  const html=this.repo.snapshot(screen.snapshotId)!.html,context=editContext(html,selectedIds),now=new Date().toISOString();
  const job=this.repo.createJob({id:randomUUID(),proposalId,screenId,baseRevisionId,baseSnapshotId:screen.snapshotId,selectedIds,prompt,status:'queued',summary:null,candidateSnapshotId:null,error:null,createdAt:now,updatedAt:now});
  const controller=new AbortController();this.controllers.set(job.id,controller);
  void this.run(job.id,html,context,controller);return job;
 }
 private async run(id:string,html:string,context:ReturnType<typeof editContext>,controller:AbortController){
  try{this.repo.updateJob(id,{status:'running'});const result=await this.runner({...context,prompt:this.repo.job(id)!.prompt},controller.signal);if(controller.signal.aborted||this.closed)return;
   const candidate=await applyEdit(html,context.scopes,result,this.store,id=>!!this.repo.asset(id));if(controller.signal.aborted||this.closed)return;
   const candidateSnapshotId=this.repo.storeSnapshot(candidate);this.repo.updateJob(id,{status:'ready',summary:result.summary,candidateSnapshotId});
  }catch(e){if(!this.closed&&!controller.signal.aborted)this.repo.updateJob(id,{status:'failed',error:(e as Error).message.slice(0,1000)});}finally{this.controllers.delete(id);}
 }
 cancel(id:string){const job=this.repo.job(id);if(!job||!['queued','running','ready'].includes(job.status))throw Object.assign(new Error('この編集は終了しています。'),{statusCode:409});this.controllers.get(id)?.abort();return this.repo.updateJob(id,{status:job.status==='ready'?'discarded':'cancelled'});}
 close(){this.closed=true;for(const controller of this.controllers.values())controller.abort();}
}
