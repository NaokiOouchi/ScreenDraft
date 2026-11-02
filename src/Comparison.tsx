import type {PanHandler} from './canvas-pan';
import type {ZoomWheelHandler} from './canvas-zoom';
import {clampZoom} from './canvas-zoom';
import {ZoomControls} from './ZoomControls';
import {useEffect,useMemo,useRef,useState} from 'react';
import {ArrowsLeftRight,ClockCounterClockwise,Minus,Plus,CursorClick,Info,ArrowLeft} from '@phosphor-icons/react';
import type {ProposalDetail,Revision,RevisionDetail,Screen} from '../shared/types';
import {SelectableFrame,type EditorState} from './Editor';
import {regionScale,type FrameRegion} from './comparison-region';
import {SnapshotFrame,type ScrollPosition} from './SnapshotFrame';
const timestamp=(date:string)=>new Intl.DateTimeFormat('ja-JP',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Tokyo'}).format(new Date(date));
async function get<T>(path:string,signal:AbortSignal):Promise<T>{const response=await fetch('/api/'+path,{signal});const data=await response.json();if(!response.ok)throw new Error(data.error||'履歴を取得できませんでした。');return data;}
export function Comparison({detail,screen,editor,onExit,onOpenAi,onSaved,chosenRevision,onRevisionChange,scale,onScaleChange,onZoomWheel,onPan}:{detail:ProposalDetail;screen:Screen;editor:EditorState;onExit:()=>void;onOpenAi:()=>void;onSaved:(saved:ProposalDetail)=>void;scale:number;onScaleChange:(scale:number)=>void;onZoomWheel:ZoomWheelHandler;onPan:PanHandler;chosenRevision?:string;onRevisionChange?:(id:string)=>void}){
 const [revisions,setRevisions]=useState<Revision[]>([]),[localChosen,setLocalChosen]=useState(chosenRevision||''),[history,setHistory]=useState<RevisionDetail|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 const chosen=chosenRevision??localChosen;
 const chosenRef=useRef(chosen);chosenRef.current=chosen;
 const setChosen=(value:string|((previous:string)=>string))=>{const next=typeof value==='function'?value(chosenRef.current):value;setLocalChosen(next);onRevisionChange?.(next);};
 const [paneWidth,setPaneWidth]=useState(400),[sync,setSync]=useState(true),[scroll,setScroll]=useState<(ScrollPosition&{source:'current'|'history'})|null>(null);
 const [leftReady,setLeftReady]=useState(false),[rightReady,setRightReady]=useState(false),[reportScroll,setReportScroll]=useState(0);
 const left=useRef<HTMLDivElement>(null),right=useRef<HTMLDivElement>(null),sequence=useRef(0);
 const proposalId=detail.proposal.id;
 const [restoreConfirm,setRestoreConfirm]=useState(false),[restoring,setRestoring]=useState(false),[restored,setRestored]=useState('');
 const restoreButton=useRef<HTMLButtonElement>(null),cancelRestore=useRef<HTMLButtonElement>(null),wasConfirming=useRef(false);
 useEffect(()=>{if(restoreConfirm)cancelRestore.current?.focus();else if(wasConfirming.current)restoreButton.current?.focus();wasConfirming.current=restoreConfirm;},[restoreConfirm]);
 const active=useRef('');active.current=proposalId+':'+screen.id+':'+chosen;
 useEffect(()=>{setRestoreConfirm(false);setRestored('');},[proposalId,screen.id,chosen]);
 useEffect(()=>{const controller=new AbortController();setError('');void get<Revision[]>('proposals/'+proposalId+'/revisions',controller.signal).then(items=>{setRevisions(items);setChosen(previous=>items.some(r=>r.id===previous)?previous:(items.find(r=>r.id!==detail.proposal.headRevisionId)?.id||items[0]?.id||''));}).catch(e=>{if(!controller.signal.aborted)setError(e.message);});return()=>controller.abort();},[proposalId,detail.proposal.headRevisionId,retry]);
 useEffect(()=>{if(!chosen)return;const controller=new AbortController();setError('');setHistory(null);setRightReady(false);void get<RevisionDetail>('proposals/'+proposalId+'/revisions/'+chosen,controller.signal).then(setHistory).catch(e=>{if(!controller.signal.aborted)setError(e.message);});return()=>controller.abort();},[proposalId,chosen,retry]);
 useEffect(()=>{if(!left.current)return;const observer=new ResizeObserver(entries=>setPaneWidth(entries[0].contentRect.width));observer.observe(left.current);return()=>observer.disconnect();},[]);
 useEffect(()=>{setScroll(null);setLeftReady(false);setRightReady(false);left.current?.scrollTo(0,0);right.current?.scrollTo(0,0);},[screen.id]);
 const currentId=editor.candidate?editor.job!.candidateSnapshotId!:screen.snapshotId;
 useEffect(()=>{setLeftReady(false);},[currentId]);
 const selectedHistory=history?.revision.id===chosen&&history.revision.proposalId===proposalId?history:null;
 const historical=selectedHistory?.screens.find(s=>s.id===screen.id);
 const revision=revisions.find(r=>r.id===chosen),same=historical?.snapshotId===currentId;
 const unchanged=historical&&['snapshotId','title','sourceUrl','width','height','assetCount'].every(k=>historical[k as keyof Screen]===screen[k as keyof Screen])&&JSON.stringify(historical.warnings)===JSON.stringify(screen.warnings);
 const blocked=editor.pending||editor.jobs.some(j=>j.screenId===screen.id&&['queued','running','ready'].includes(j.status));
 const restore=async()=>{if(!historical||!revision||restoring)return;const identity=active.current;setRestoring(true);setError('');try{const response=await fetch('/api/proposals/'+proposalId+'/screens/'+screen.id+'/history-restore',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({revisionId:chosen,baseSnapshotId:screen.snapshotId})});const saved=await response.json();if(!response.ok)throw Error(saved.error||'復元できませんでした。');onSaved(saved);if(active.current===identity){setRestoreConfirm(false);setRestored('v'+revision.version+'の画面を新しい履歴として保存しました。');}}catch(e){if(active.current===identity)setError((e as Error).message);}finally{setRestoring(false);}};
 const [focusMode,setFocusMode]=useState<'selection'|'page'>('page');
 const ids=editor.nodes.length?editor.nodes.map(n=>n.id):(editor.candidate||editor.working?editor.job?.selectedIds:[])||[];
 const idsKey=ids.join('|');
 const requestKey=[screen.id,currentId,historical?.snapshotId||'',chosen,idsKey].join(':');
 const regionRequest=useMemo(()=>focusMode==='selection'&&idsKey&&historical?{ids:idsKey.split('|'),token:requestKey}:undefined,[focusMode,requestKey]);
 const [regions,setRegions]=useState<{key:string;left?:FrameRegion|null;right?:FrameRegion|null}>({key:''});
 const currentRegions=regions.key===requestKey?regions:null;
 const receiveRegion=(side:'left'|'right',region:FrameRegion|null)=>setRegions(previous=>({...previous.key===requestKey?previous:{key:requestKey},[side]:region}));
 const focused=!!regionRequest&&!!currentRegions?.left&&!!currentRegions?.right;
 const missing=!!regionRequest&&(currentRegions?.left===null||currentRegions?.right===null);
 const leftRegion=focused?currentRegions!.left!:null,rightRegion=focused?currentRegions!.right!:null;
 const fitScale=(leftRegion&&rightRegion?regionScale(paneWidth,leftRegion,rightRegion):Math.min(1,Math.max(.1,paneWidth/Math.max(screen.width,historical?.width||screen.width))));
 const regionLabel=focused?'選択範囲を表示 · 横スクロールで範囲全体を確認できます':regionRequest&&!missing?'選択範囲を確認中…':missing?'対応する選択範囲がないため全体表示':'画面全体を表示';
 useEffect(()=>{setScroll(null);left.current?.scrollTo(0,0);right.current?.scrollTo(0,0);},[requestKey,focusMode]);
 useEffect(()=>{if(focused){for(const pane of [left.current,right.current])if(pane)pane.scrollTo({left:Math.max(0,(Math.max(leftRegion!.width,rightRegion!.width)*scale-pane.clientWidth+24)/2),top:0});}},[focused,requestKey,paneWidth]);
 const onScroll=(source:'current'|'history',position:Omit<ScrollPosition,'sequence'>)=>{if(sync&&!focused)setScroll({...position,source,sequence:++sequence.current});};
 const outerScroll=(source:'current'|'history')=>{if(!sync||document.documentElement.classList.contains('canvas-panning'))return;const a=source==='current'?left.current:right.current,b=source==='current'?right.current:left.current;if(a&&b&&(Math.abs(a.scrollLeft-b.scrollLeft)>1||Math.abs(a.scrollTop-b.scrollTop)>1))b.scrollTo(a.scrollLeft,a.scrollTop);};
 const currentScroll=sync&&!focused&&scroll?.source==='history'?scroll:null,historyScroll=sync&&!focused?scroll:null;
 return <main className="comparison-workspace">
  <div className="comparison-options"><div className="view-switch"><button onClick={onExit}>編集</button><button className="active" aria-current="page">比較</button></div><label className="sync-option"><input type="checkbox" checked={sync} onChange={e=>{setSync(e.target.checked);setScroll(null);if(e.target.checked){setReportScroll(n=>n+1);if(left.current&&right.current){const a=left.current.querySelector<HTMLElement>('.canvas-wrap'),b=right.current.querySelector<HTMLElement>('.canvas-wrap');if(a&&b){b.style.left=a.style.left;b.style.top=a.style.top;}right.current.scrollTo(left.current.scrollLeft,left.current.scrollTop);}}}}/>スクロールを同期</label><select aria-label="比較の表示範囲" value={ids.length?focusMode:'page'} onChange={e=>{setFocusMode(e.target.value as 'selection'|'page');}}><option value="selection" disabled={!ids.length}>選択範囲を表示</option><option value="page">画面全体を表示</option></select></div>
  <p className="comparison-region-status" role="status">{!ids.length&&focusMode==='selection'?'左の画面で範囲を選ぶと、その範囲を拡大できます。':regionLabel}</p>
  {error&&<div className="alert error" role="alert">{error}<button className="text-button" onClick={()=>setRetry(n=>n+1)}>再読み込み</button></div>}
  {restored&&<p className="alert info" role="status">{restored}</p>}
  {restoreConfirm&&historical&&<section className="history-restore-confirm" aria-label="履歴からの復元を確認"><p>「{screen.title}」をv{revision?.version}の内容・画面名に戻します。新しい版として保存します。ほかの画面と過去の履歴は保持します。</p><div><button ref={cancelRestore} className="button secondary" disabled={restoring} onClick={()=>setRestoreConfirm(false)}>キャンセル</button><button className="button primary" disabled={restoring||blocked} onClick={()=>void restore()}>{restoring?'復元しています':'この内容で復元する'}</button></div></section>}
  <div className="comparison-panes" data-pan-sync={sync}>
   <section className="comparison-pane current-pane" aria-label="左：現在の編集結果"><div className="comparison-pane-header"><div><span className="current-label">{screen.title}</span><span className="pane-state">{editor.candidate?'編集候補・未保存':editor.working?'AI編集中':'現在'}</span></div><button className={'icon-button pick-compare '+(editor.picking?'active':'')} aria-label="現在の画面のDOM選択" aria-pressed={editor.picking} disabled={editor.working||editor.candidate} onClick={()=>editor.setPicking(!editor.picking)}><CursorClick size={19}/></button></div>
    <div ref={left} className="comparison-canvas" onScroll={()=>outerScroll('current')}><div className="canvas-wrap" style={{width:(leftRegion?.width||screen.width)*scale,height:(leftRegion?.height||screen.height)*scale,minHeight:(leftRegion?.height||screen.height)*scale}}><SelectableFrame onPan={onPan} key={currentId+focusMode+(missing?'fallback':'')} regionRequest={missing?undefined:regionRequest} onRegion={region=>receiveRegion('left',region)} offset={leftRegion||undefined} editor={editor} screen={screen} forceCurrent scale={scale} onZoomWheel={onZoomWheel} onLoad={()=>setLeftReady(true)} onScroll={position=>onScroll('current',position)} scrollTo={currentScroll} reportScroll={reportScroll}/></div>{!leftReady&&<div className="comparison-loading" role="status">現在の画面を読み込んでいます</div>}</div>
    <div className="comparison-pane-footer"><span>{screen.width} × {screen.height}</span></div>
   </section>
   <section className="comparison-pane history-pane" aria-label="右：選択した履歴"><div className="comparison-pane-header"><div className="history-heading"><span><ClockCounterClockwise size={15}/>比較する履歴</span><select aria-label="比較する履歴" value={chosen} title={revision?.reason} onChange={e=>setChosen(e.target.value)} disabled={!revisions.length}>{!revisions.length&&<option value="">履歴を読み込んでいます</option>}{revisions.map(r=><option key={r.id} value={r.id}>v{r.version} · {timestamp(r.createdAt)} · {r.reason.length>64?r.reason.slice(0,64)+'…':r.reason}{r.id===detail.proposal.headRevisionId?'（最新保存版）':''}</option>)}</select></div><button ref={restoreButton} className="button secondary history-restore-button" disabled={!historical||!!unchanged||blocked||restoring} title={blocked?'対象画面のAI候補を採用・破棄するか、編集中の処理を中止してください。':'この画面を選択した履歴の内容で復元します。新しい版として保存します。'} onClick={()=>setRestoreConfirm(true)}>この版に戻す</button></div>
    <div ref={right} className="comparison-canvas" onScroll={()=>outerScroll('history')}>{selectedHistory?(historical?<><div className="canvas-wrap" style={{width:(rightRegion?.width||historical.width)*scale,height:(rightRegion?.height||historical.height)*scale,minHeight:(rightRegion?.height||historical.height)*scale}}><SnapshotFrame onPan={onPan} key={historical.snapshotId+focusMode+(missing?'fallback':'')} regionRequest={missing?undefined:regionRequest} onRegion={region=>receiveRegion('right',region)} offset={rightRegion||undefined} snapshotId={historical.snapshotId} screenId={historical.id} width={historical.width} height={historical.height} scale={scale} title={historical.title+'の選択した履歴'} picking={false} onZoomWheel={onZoomWheel} onLoad={()=>setRightReady(true)} onScroll={position=>onScroll('history',position)} scrollTo={historyScroll}/></div>{!rightReady&&<div className="comparison-loading" role="status">履歴の画面を読み込んでいます</div>}</>:<div className="history-absent"><ClockCounterClockwise size={32} weight="light"/><h2>この履歴には画面がありません</h2><p>「{screen.title}」は、この版の対象画面に含まれていません。</p><p>右上で別の履歴を選ぶと、その時点の画面を確認できます。</p></div>):!error&&<div className="history-absent" role="status"><span className="spinner"/><p>履歴を読み込んでいます</p></div>}</div>
    <div className="comparison-pane-footer"><span>{revision?'v'+revision.version:'履歴'}</span><span>{historical?(same?'現在と同じ内容':''):(selectedHistory?'この版に画面なし':error?'取得できませんでした':'履歴を読み込み中')}</span></div>
   </section>
  </div>
  <ZoomControls scale={scale} onChange={onScaleChange} onFit={()=>{setFocusMode('page');onScaleChange(Math.min(1,Math.max(.1,paneWidth/Math.max(screen.width,historical?.width||screen.width))));}}/>
 </main>;
}
