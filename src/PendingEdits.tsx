import {useState} from 'react';
import type {EditJob} from '../shared/editor-types';
import type {Screen} from '../shared/types';
export function PendingEdits({jobs,screens,selectedId,onSelect,onCancel}:{jobs:EditJob[];screens:Screen[];selectedId?:string;onSelect:(id:string)=>void;onCancel:(job:EditJob)=>Promise<void>}){
 const [busy,setBusy]=useState<string[]>([]);
 const pending=jobs.filter(j=>['queued','running','ready'].includes(j.status));
 if(!pending.length)return null;
 return <section className="pending-edits" aria-label="実行中・確認待ちの編集"><h3>実行中・確認待ち <span>{pending.length}件</span></h3><div className="pending-edit-list">{pending.map(job=>{const screen=screens.find(s=>s.id===job.screenId);return <div className="pending-edit" key={job.id}><button className="pending-edit-open" disabled={!screen} aria-current={selectedId===job.screenId?'true':undefined} onClick={()=>onSelect(job.screenId)}><strong>{screen?.title||'対象画面なし'}</strong><span>{job.status==='ready'?'候補を確認':'AI編集中'}</span><small>{job.prompt}</small></button><button className="text-button" disabled={busy.includes(job.id)} aria-label={(screen?.title||'対象画面なし')+(job.status==='ready'?'の候補を破棄':'の編集を中止')} onClick={async()=>{setBusy(ids=>[...ids,job.id]);try{await onCancel(job);}finally{setBusy(ids=>ids.filter(id=>id!==job.id));}}}>{job.status==='ready'?'破棄':'中止'}</button></div>;})}</div></section>;
}
