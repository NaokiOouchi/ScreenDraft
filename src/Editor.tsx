import type {PanHandler} from './canvas-pan';
import type {ZoomWheelHandler} from './canvas-zoom';
import type {FrameRegion} from './comparison-region';
import {drafts,type Draft} from './drafts';
import {nodeLabel,scopeChoices} from '../shared/selection-ux.js';
import {SnapshotFrame,type ScrollPosition} from './SnapshotFrame';
import {useEffect,useRef,useState} from 'react';
import {CursorClick,PaperPlaneTilt,X,ArrowBendUpLeft,CheckCircle,WarningCircle,Stop,ArrowClockwise,Info} from '@phosphor-icons/react';
import type {Screen,ProposalDetail} from '../shared/types';
import type {EditJob,PickedNode} from '../shared/editor-types';
async function call<T>(path:string,body?:unknown):Promise<T>{const response=await fetch('/api/'+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});const data=await response.json();if(!response.ok)throw new Error(data.error||'通信できませんでした。');return data;}
export function useEditor(screen:Screen|undefined,detail:ProposalDetail|null,onSaved:(saved:ProposalDetail)=>void){
 const screenId=screen?.id||'',proposalId=detail?.proposal.id||'',snapshotId=screen?.snapshotId||'';
 const key=proposalId+':'+screenId;
 const [draftState,setDraftState]=useState<{key:string;value:Draft}|null>(null);
 const draft=draftState?.key===key&&draftState.value.snapshotId===snapshotId?draftState.value:drafts.read(proposalId,screenId,snapshotId);
 const context=useRef({key,proposalId,screenId,snapshotId,draft});context.current={key,proposalId,screenId,snapshotId,draft};
 const draftWarning=drafts.isVolatile(proposalId,screenId)?'下書きをディスクに保存できません。この起動中は保持しますが、アプリを閉じる前に指示をコピーしてください。':'';
 const updateDraft=(patch:Partial<Draft>)=>{const c=context.current;if(!c.screenId)return;const value={...c.draft,...patch};c.draft=value;setDraftState({key:c.key,value});drafts.write(c.proposalId,c.screenId,value);};
 const setNodes=(nodes:PickedNode[])=>updateDraft({nodes});const setPrompt=(prompt:string)=>updateDraft({prompt});
 const [jobState,setJobState]=useState<{proposalId:string;items:EditJob[]}>({proposalId:'',items:[]});
 const jobs=jobState.proposalId===proposalId?jobState.items:[];
 const current=jobs.find(j=>j.screenId===screenId&&['queued','running','ready'].includes(j.status))||jobs.find(j=>j.screenId===screenId)||null;
 const [jobsError,setJobsError]=useState('');
 const [error,setError]=useState(''),[pendingKey,setPendingKey]=useState(''),[original,setOriginal]=useState(false),[picking,setPicking]=useState(true);
 const mutation=useRef(0),sequence=useRef(0),[command,setCommand]=useState<{type:string;data?:unknown;seq:number}|null>(null);
 const send=(type:string,data?:unknown)=>setCommand({type,data,seq:++sequence.current});
 useEffect(()=>{setError('');setOriginal(false);setPicking(true);setCommand(null);},[key]);
 useEffect(()=>{if(!proposalId)return;let live=true;let timer:ReturnType<typeof setTimeout>;const controller=new AbortController();
  const tick=async()=>{const version=mutation.current;try{const response=await fetch('/api/proposals/'+proposalId+'/edits',{signal:controller.signal});const items=await response.json();if(!response.ok)throw Error(items.error||'編集状態を取得できませんでした。');if(live&&version===mutation.current){setJobState({proposalId,items});setJobsError('');}}catch(e){if(live)setJobsError('編集状態を取得できません。接続の回復後に再確認します。');}finally{if(live)timer=setTimeout(tick,1500);}};
  void tick();return()=>{live=false;controller.abort();clearTimeout(timer);};
 },[proposalId]);
 const working=!!current&&['queued','running'].includes(current.status),candidate=current?.status==='ready',pending=pendingKey===key;
 const remember=(job:EditJob)=>{mutation.current++;setJobState(state=>state.proposalId===job.proposalId?{...state,items:[job,...state.items.filter(j=>j.id!==job.id)]}:state);};
 const request=async(retry=false)=>{if(!screen||!detail)return;const c=context.current;setPendingKey(c.key);setError('');mutation.current++;try{
  const next=await call<EditJob>('proposals/'+proposalId+'/edits',{screenId:screen.id,baseRevisionId:detail.proposal.headRevisionId,selectedIds:retry?current?.selectedIds:c.draft.nodes.map(n=>n.id),prompt:c.draft.prompt.trim()||current?.prompt});remember(next);if(context.current.key===c.key)setOriginal(false);
 }catch(e){if(context.current.key===c.key)setError((e as Error).message);}finally{setPendingKey(previous=>previous===c.key?'':previous);}};
 const accept=async()=>{if(!current)return;const c=context.current;setPendingKey(c.key);setError('');mutation.current++;try{const saved=await call<ProposalDetail>('edits/'+current.id+'/accept',{});onSaved(saved);remember({...current,status:'accepted'});drafts.clear(c.proposalId,c.screenId);if(context.current.key===c.key){setDraftState(null);setOriginal(false);}}catch(e){if(context.current.key===c.key)setError((e as Error).message);}finally{setPendingKey(previous=>previous===c.key?'':previous);}};
 const cancel=async()=>{if(!current)return;const c=context.current;setPendingKey(c.key);setError('');mutation.current++;try{remember(await call<EditJob>('edits/'+current.id+'/cancel',{}));if(context.current.key===c.key){if(!context.current.draft.prompt)setPrompt(current.prompt);setOriginal(false);}}catch(e){if(context.current.key===c.key)setError((e as Error).message);}finally{setPendingKey(previous=>previous===c.key?'':previous);}};
 const cancelJob=async(job:EditJob)=>{setError('');try{remember(await call<EditJob>('edits/'+job.id+'/cancel',{}));}catch(e){if(context.current.proposalId===job.proposalId)setError((e as Error).message);}};
 return {nodes:draft.nodes,setNodes,setError,prompt:draft.prompt,setPrompt,job:current,jobs,cancelJob,error:error||jobsError,draftWarning,pending,working,candidate,original,setOriginal,picking,setPicking,command,send,request,accept,cancel,
  previewId:candidate&&!original?current!.candidateSnapshotId:screen?.snapshotId,
  clear:()=>{setNodes([]);send('clear');},pick:(id:string)=>{setPicking(true);send('pick',id);}};
}
export type EditorState=ReturnType<typeof useEditor>;
export function SelectableFrame({editor,screen,scale,onLoad,forceCurrent=false,onScroll,scrollTo,reportScroll,regionRequest,onRegion,offset,onZoomWheel,onPan}:{editor:EditorState;screen:Screen;scale:number;onLoad?:()=>void;forceCurrent?:boolean;onZoomWheel?:ZoomWheelHandler;onPan?:PanHandler;onScroll?:(position:Omit<ScrollPosition,'sequence'>)=>void;scrollTo?:ScrollPosition|null;reportScroll?:number;regionRequest?:{ids:string[];token:string};onRegion?:(region:FrameRegion|null)=>void;offset?:{x:number;y:number}}){
 const id=forceCurrent?(editor.candidate?editor.job!.candidateSnapshotId!:screen.snapshotId):editor.previewId!;
 return <SnapshotFrame onPan={onPan} onZoomWheel={onZoomWheel} snapshotId={id} screenId={screen.id} width={screen.width} height={screen.height} scale={scale} title={screen.title+(editor.candidate&&(forceCurrent||!editor.original)?'のAI編集候補':'の編集画面')} picking={editor.picking&&!editor.candidate&&!editor.working} onSelection={nodes=>{editor.setNodes(nodes);editor.setError('');}} onSelectionError={editor.setError} command={editor.command} selectedIds={editor.nodes.map(n=>n.id)} onLoad={onLoad} onScroll={onScroll} scrollTo={scrollTo} reportScroll={reportScroll} regionRequest={regionRequest} onRegion={onRegion} offset={offset}/>;
}
export function AiPanel({editor,screen,comparing=false}:{editor:EditorState;screen?:Screen;comparing?:boolean}){
 const e=editor,job=e.job,first=e.nodes[0],locked=e.working||e.candidate||e.pending;
 const table=first&&['th','td','tr','tbody','thead','col','colgroup','tfoot'].includes(first.tag);
 return <div className="ai-panel">
  <div className="ai-panel-scroll">
  {!screen?<div className="ai-empty"><CursorClick size={26}/><p>画面を取り込むと、編集したい部分を選べます。</p></div>:<>
   <section className="selection-summary" tabIndex={-1} aria-label="編集範囲を選択"><div className="selection-heading"><h2>選択範囲</h2>{!!e.nodes.length&&!locked&&<button className="text-button" onClick={e.clear}>解除</button>}</div>
   {e.nodes.length?<><div className="selected-nodes">{e.nodes.map(n=><span className="node-chip" key={n.id} title={n.text}>{nodeLabel(n)}<small>{e.nodes.length===1?'1件':''}</small></span>)}</div>{!locked&&first&&<div className="parent-picker"><div className="scope-shortcuts">{scopeChoices(first).map((a:PickedNode['ancestors'][number]&{label:string})=><button key={a.id} onClick={()=>e.pick(a.id)} title={a.text}><ArrowBendUpLeft size={12}/>{a.label}を選ぶ</button>)}</div>{first.ancestors.length>0&&<details><summary>上位の範囲から選ぶ</summary><div>{first.ancestors.map((a,index)=><button key={a.id} onClick={()=>e.pick(a.id)} title={a.text}>{index+1}. {nodeLabel(a)}<small>{a.tag}</small></button>)}</div></details>}{table&&<p className="scope-help">列・行の整合性を保つため、テーブル全体を編集します。</p>}</div>}</>:locked?<span className="node-chip">選択範囲 · {job?.selectedIds.length||0}件</span>:<div className="selection-hint"><p>画面をクリックして選択します。キーボードでは画面にフォーカス後、↑↓で移動してEnterで選択できます。Shiftで複数選択します。</p><button className="text-button scope-start" onClick={()=>{e.setPicking(true);e.send('pickMain');}}>本文全体を選ぶ</button></div>}
   </section>
   <div className="ai-conversation" aria-live="polite">
    {job&&job.status!=='accepted'&&<>
     <section className="user-instruction"><h3>今回の指示</h3><p>{job.prompt}</p></section>
     {e.working&&<div className="ai-status"><span className="spinner"/><div><strong>AIが編集しています</strong><p>画面を切り替えても処理は続きます。</p></div></div>}
     {e.candidate&&<section className="candidate-card"><h3>実行結果</h3><div className="candidate-result"><CheckCircle size={20} weight="fill"/><p>{job.summary}</p></div>{!comparing&&<p className="static-note">まだ保存済み画面には反映されていません。</p>}{!comparing&&<div className="candidate-switch"><button className={!e.original?'active':''} onClick={()=>e.setOriginal(false)}>編集候補</button><button className={e.original?'active':''} onClick={()=>e.setOriginal(true)}>変更前</button></div>}</section>}
     {job.status==='failed'&&<div className="alert error"><WarningCircle size={18}/><div><strong>編集できませんでした</strong><p>{job.error}</p></div></div>}
     {['cancelled','discarded'].includes(job.status)&&<p className="static-note">{job.status==='cancelled'?'編集を中止しました。':'候補を破棄しました。'}保存済み画面は変更していません。</p>}
    </>}
   </div>
  </>}
  </div>
  {screen&&<div className="prompt-composer">
   {!e.working&&!e.candidate&&<><label htmlFor="ai-prompt">AIへの指示</label><textarea id="ai-prompt" value={e.prompt} onChange={event=>e.setPrompt(event.target.value)} placeholder="例：性別列を追加して、全員を未回答にして" maxLength={4000} disabled={locked} onKeyDown={event=>{if((event.metaKey||event.ctrlKey)&&event.key==='Enter'&&!locked&&e.nodes.length&&e.prompt.trim()){event.preventDefault();void e.request();}}}/><div className="composer-meta"><span>{e.draftWarning?'下書きを保存できませんでした':''}</span><span>⌘ / Ctrl + Enter</span></div></>}
   {(e.error||e.draftWarning)&&<div className="composer-errors" role="alert">{e.error||e.draftWarning}</div>}
   {e.candidate?<div className="candidate-actions"><button className="button secondary" disabled={e.pending} onClick={()=>void e.cancel()}>破棄</button><button className="button primary" disabled={e.pending} onClick={()=>void e.accept()}><CheckCircle size={16}/>この変更を保存</button></div>:e.working?<button className="button secondary wide" disabled={e.pending} onClick={()=>void e.cancel()}><Stop size={16}/>編集を中止</button>:<><button className="button primary wide" disabled={e.pending||(!e.prompt.trim()&&e.nodes.length>0)} onClick={()=>{if(!e.nodes.length){e.setPicking(true);document.querySelector<HTMLElement>('.selection-summary')?.focus();return;}void e.request();}}><PaperPlaneTilt size={17}/>{e.pending?'送信しています':!e.nodes.length?'編集する範囲を選択':'変更を試す'}</button>{job&&['failed','cancelled'].includes(job.status)&&<div className="retry-controls">{!e.prompt&&<button className="text-button" onClick={()=>e.setPrompt(job.prompt)}>前の指示を戻す</button>}<button className="text-button" disabled={e.pending} onClick={()=>void e.request(true)}><ArrowClockwise size={14}/>前の範囲で再実行</button></div>}</>}
  </div>}
 </div>;
}
