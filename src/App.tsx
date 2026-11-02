import {DraftImport} from './DraftImport';
import {DraftExport} from './DraftExport';
import {useCanvasPan} from './useCanvasPan';
import {wheelZoom,anchorZoom,type ZoomWheelHandler} from './canvas-zoom';
import {flushSync} from 'react-dom';
import {ZoomControls} from './ZoomControls';
import {isCaptureIssue} from './capture-status';
import {Library} from './Library';
import {Settings,type SettingsTopic} from './Settings';
import {LatestRequest,readRoute,routeUrl,readWorkspace,saveWorkspace,type Route} from './navigation';
import './desktop';
import {useExtensionSync} from './useExtensionSync';
import {importDestination} from '../shared/import-sync';
import {InspectorResize} from './InspectorResize';
import {clampInspectorWidth} from './workspace-layout';
import {captureSavePayload} from '../shared/import-target.js';
import {ManageItem,Trash,type ManagedItem} from './Management';
import {AiReadinessCard,useAiReadiness} from './AiReadiness';
import {CaptureReviewPreview} from './CaptureReviewPreview';
import {GuidedTour} from './GuidedTour';
import {shouldAutoStartTour} from '../shared/tour.js';
import {GettingStarted,type GuideTopic,type GuideAction} from './GettingStarted';
import {Comparison} from './Comparison';
import {PendingEdits} from './PendingEdits';
import {AiPanel,SelectableFrame,useEditor} from './Editor';
import { useEffect, useRef, useState } from 'react';
import { FileText, Plus, CaretRight, Monitor, Minus, ArrowSquareOut, CheckCircle, WarningCircle, X, UploadSimple, PuzzlePiece, Copy, Check, Image, FolderOpen, ArrowRight, Info, HardDrives, Question, DotsThree, Trash as TrashIcon, GearSix, CaretDoubleLeft, CaretDoubleRight, CursorClick, ArrowLeft } from '@phosphor-icons/react';
import { captureDocument, collectResources } from '../shared/capture.js';
import type { Capture, Proposal, ProposalSummary, ProposalDetail, Screen, TrashDetail } from '../shared/types';

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch('/api'+url,{...options,headers:{'Content-Type':'application/json',...options?.headers}});
  const value = await response.json(); if (!response.ok) throw new Error(value.error || '通信できませんでした。'); return value;
}
const date = (value:string) => new Intl.DateTimeFormat('ja-JP',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value));

const desktopApp=navigator.userAgent.includes('Electron/');
const workspaceStorage=(()=>{try{return localStorage;}catch{return undefined;}})();
export function App() {
  const aiReadiness=useAiReadiness();
  const [route,setRoute]=useState<Route>(()=>readRoute(location.href));
  const routeRef=useRef(route);routeRef.current=route;
  const [settingsTopic,setSettingsTopic]=useState<SettingsTopic>('extension');
  const [routeError,setRouteError]=useState('');
  const requestSequence=useRef(new LatestRequest());
  const navigate=(next:Route,replace=false)=>{requestSequence.current.invalidate();history[replace?'replaceState':'pushState'](null,'',routeUrl(next));setRoute(next);setRouteError('');};
  const openSettings=(topic:SettingsTopic='extension')=>{setSettingsTopic(topic);setError('');setModal('settings');};
  useEffect(()=>{const pop=()=>{requestSequence.current.invalidate();setRoute(readRoute(location.href));setRouteError('');};window.addEventListener('popstate',pop);return()=>window.removeEventListener('popstate',pop);},[]);
  const [proposals,setProposals]=useState<ProposalSummary[]>([]),[detail,setDetail]=useState<ProposalDetail|null>(null),[selectedId,setSelectedId]=useState('');
  const [modal,setModal]=useState<'import'|'new'|'guide'|'manage'|'settings'|'info'|'export'|'draftImport'|null>(null),[tab,setTab]=useState<'sample'|'browser'|'file'>('browser');
  const [busy,setBusy]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[zoom,setZoom]=useState<number|null>(null);
  const [proposalTitle,setProposalTitle]=useState(''),[ready,setReady]=useState(false);
  const [pending,setPending]=useState<Capture|null>(null),[previewReady,setPreviewReady]=useState(false);
  const [importTarget,setImportTarget]=useState('');

  const [managed,setManaged]=useState<ManagedItem|null>(null),[trash,setTrash]=useState<TrashDetail|null>(null);
  const [guideTopic,setGuideTopic]=useState<GuideTopic>('setup'),[guideStep,setGuideStep]=useState(0);
  const [tourOpen,setTourOpen]=useState(false),[tourStep,setTourStep]=useState(0);
  const tourAutoStarted=useRef(false),tourAwaitingSample=useRef(false);
  const [needsFirstTour]=useState(()=>{try{return shouldAutoStartTour(localStorage.getItem('change-note:tour:v1'));}catch{return false;}});
  const [rail,setRail]=useState(()=>{try{return localStorage.getItem('change-note:rail-v2')==='collapsed';}catch{return false;}});
  const [viewport,setViewport]=useState(window.innerWidth),[inspector,setInspector]=useState(320);
    useEffect(()=>{const resize=()=>setViewport(window.innerWidth);window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize);},[]);
  const toggleRail=()=>setRail(previous=>{try{localStorage.setItem('change-note:rail-v2',previous?'expanded':'collapsed');}catch{}return !previous;});

  useEffect(()=>{const dismiss=(e:KeyboardEvent)=>{if(e.key==='Escape')document.querySelectorAll<HTMLDetailsElement>('.screen-menu[open],.app-menu[open]').forEach(el=>{el.open=false;el.querySelector('summary')?.focus();});};document.addEventListener('keydown',dismiss);return()=>document.removeEventListener('keydown',dismiss);},[]);
  const [stageWidth,setStageWidth]=useState(900),[showDetails,setShowDetails]=useState(true);
  const stage=useRef<HTMLDivElement>(null),file=useRef<HTMLInputElement>(null);
  const selected=detail?.screens.find(s=>s.id===selectedId) || detail?.screens[0];
  const refresh=async(id?:string,screenId?:string)=>{
    return requestSequence.current.run(async current=>{
    const items=await api<ProposalSummary[]>('/proposals');if(!current())return;setProposals(items);
    const target=id||(routeRef.current.page==='workspace'?routeRef.current.proposalId:undefined);
    if(target){
      if(!items.some(p=>p.id===target)){const trash=await api<TrashDetail>('/trash');if(!current())return;setDetail(null);setRouteError(trash.proposals.some(p=>p.id===target)?'このドラフトはゴミ箱にあります。':'このドラフトは見つかりません。');setReady(true);return;}
      const next=await api<ProposalDetail>('/proposals/'+target);if(!current())return;
      setDetail(next);if(screenId&&!next.screens.some(s=>s.id===screenId))setNotice('指定された画面は削除されたか、見つかりません。画面一覧から選択してください。');setSelectedId(screenId||readWorkspace(workspaceStorage,target).screenId||next.screens[0]?.id||'');
    }
    setReady(true);
    });
  };
  const applySaved=(saved:ProposalDetail)=>{setDetail(current=>current?.proposal.id===saved.proposal.id?saved:current);setProposals(items=>items.map(p=>p.id===saved.proposal.id?{...p,...saved.proposal,screenCount:saved.screens.length}:p));};
  const editor=useEditor(selected,detail,applySaved);

  const [comparing,setComparing]=useState(false);
  const [revisionId,setRevisionId]=useState('');
  const restoredWorkspace=useRef('');
  useEffect(()=>{if(!detail)return;const state=readWorkspace(workspaceStorage,detail.proposal.id);restoredWorkspace.current=detail.proposal.id;setComparing(state.comparing);setRevisionId(state.revisionId);setRail(state.rail);setShowDetails(state.inspectorOpen);setInspector(state.inspectorWidth);},[detail?.proposal.id]);
  useEffect(()=>{if(!detail||restoredWorkspace.current!==detail.proposal.id)return;saveWorkspace(workspaceStorage,detail.proposal.id,{screenId:selected?.id||'',comparing,revisionId,rail,inspectorOpen:showDetails,inspectorWidth:inspector});},[selected?.id,comparing,revisionId,rail,showDetails,inspector]);
  const view=useRef({detail,selected,modal,busy,pending,tourOpen,editor});view.current={detail,selected,modal,busy,pending,tourOpen,editor};
  const [importedLink,setImportedLink]=useState<{proposalId:string;screenId:string;kind?:'restore'}|null>(null);
  const extensionConnected=useExtensionSync(async events=>{
    const current=view.current;if(routeRef.current.page!=='workspace'){if(events.length){const latest=events.at(-1)!;setImportedLink({proposalId:latest.proposalId,screenId:latest.screenId});void api<ProposalSummary[]>('/proposals').then(setProposals);}return true;}if(!ready||current.busy||current.pending||current.tourOpen||(current.modal&&!(current.modal==='settings'&&settingsTopic==='extension')))return false;
    const target=importDestination(events,{proposalId:current.detail?.proposal.id||'',screenId:current.selected?.id||'',editing:!!current.editor.prompt.trim()||current.editor.nodes.length>0||current.editor.working||current.editor.candidate});if(!target)return true;
    const syncCurrent=requestSequence.current.checkpoint(),syncRoute=routeRef.current;
    const items=await api<ProposalSummary[]>('/proposals');
    if(!syncCurrent()||routeRef.current!==syncRoute)return false;
    if(view.current.detail?.proposal.id!==current.detail?.proposal.id||view.current.selected?.id!==current.selected?.id||view.current.modal!==current.modal)return false;
    const id=target.proposalId||events.at(-1)!.proposalId;
    if(!items.some(item=>item.id===id)){setProposals(items);setNotice('取り込み先のドラフトが一覧にありません。ゴミ箱を確認してください。');return true;}
    const saved=await api<ProposalDetail>('/proposals/'+id);
    if(!syncCurrent()||routeRef.current!==syncRoute)return false;
    if(view.current.detail?.proposal.id!==current.detail?.proposal.id||view.current.selected?.id!==current.selected?.id||view.current.modal!==current.modal||view.current.busy||view.current.pending)return false;
    if(view.current.detail?.proposal.headRevisionId!==current.detail?.proposal.headRevisionId)return false;
    if(target.navigate&&(view.current.editor.prompt.trim()||view.current.editor.nodes.length||view.current.editor.working||view.current.editor.candidate))return false;
    setProposals(items);setDetail(saved);setSelectedId(target.screenId||saved.screens[0]?.id||'');
    if(target.navigate)navigate({page:'workspace',proposalId:id,screenId:target.screenId},true);
    if(current.modal==='settings'&&settingsTopic==='extension')setModal(null);
    if(target.navigate){setImportedLink(null);setNotice('取り込んだ画面を表示しました。');}else{const latest=events.at(-1)!;setImportedLink({proposalId:latest.proposalId,screenId:latest.screenId});setNotice('画面を取り込みました。編集中の画面は維持しています。');}
    return true;
  });


  useEffect(()=>{const r=route;void refresh(r.page==='workspace'?r.proposalId:undefined,r.page==='workspace'?r.screenId:undefined).catch(e=>{if(routeRef.current!==r)return;setRouteError(e.message);setReady(true);});if(r.page==='trash')void loadTrash().catch(e=>setError(e.message));},[route]);
  useEffect(()=>{if(route.page!=='library')return;const timer=setInterval(()=>void api<ProposalSummary[]>('/proposals').then(setProposals).catch(()=>{}),4000);return()=>clearInterval(timer);},[route.page]);
  useEffect(()=>{if(!stage.current)return;const observer=new ResizeObserver(entries=>setStageWidth(entries[0].contentRect.width));observer.observe(stage.current);return()=>observer.disconnect();},[ready,comparing,!!selected,route.page]);
  useEffect(()=>{setZoom(null);},[selected?.id]);
  useEffect(()=>{setPreviewReady(false);},[editor.previewId]);
  useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(''),6000);return()=>clearTimeout(timer);},[notice]);
  useEffect(()=>{
    if(!modal)return;
    const previous=document.activeElement as HTMLElement|null;
    const dialog=document.querySelector<HTMLElement>('[role=dialog]');
    const focusable=()=>Array.from(dialog?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not([type=hidden]),select,textarea,a[href],summary,[tabindex="0"]')||[]).filter(el=>el.offsetParent!==null);
    focusable()[0]?.focus();
    const handler=(e:KeyboardEvent)=>{
      if(e.key==='Escape'&&!busy){e.preventDefault();closeModal();}
      if(e.key==='Tab'){const items=focusable(),first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
    };
    document.addEventListener('keydown',handler);return()=>{document.removeEventListener('keydown',handler);previous?.focus();};
  },[modal,busy,pending]);
  const closeModal=()=>{if(busy)return;if((pending||document.querySelector('[data-unsaved="true"]'))&&!window.confirm('保存していない内容を破棄しますか？'))return;setModal(null);setPending(null);setError('');tourAwaitingSample.current=false;};
  useEffect(()=>{const notify=()=>void window.changeNoteDesktop?.setWorkState?.({working:editor.jobs.some(j=>['queued','running'].includes(j.status))||proposals.some(p=>p.runningCount>0),pending:!!pending,unsaved:!!document.querySelector('[data-unsaved="true"]')}).catch(()=>{});notify();const observer=new MutationObserver(notify);observer.observe(document.body,{subtree:true,attributes:true,attributeFilter:['data-unsaved'],childList:true});return()=>observer.disconnect();},[pending,editor.jobs,proposals,modal]);
  useEffect(()=>{const warn=(event:BeforeUnloadEvent)=>{if(document.querySelector('[data-unsaved="true"]')||pending||editor.jobs.some(j=>['queued','running'].includes(j.status))||proposals.some(p=>p.runningCount>0)){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[pending,editor.jobs,proposals]);
  const save=async(capture:Capture)=>{
    setBusy('画面とリソースを保存しています');setError('');
    try{
      const proposal=(routeRef.current.page==='workspace'?detail?.proposal:undefined)||await api<Proposal>('/proposals',{method:'POST',body:JSON.stringify({title:'はじめてのドラフト'})});
      const screen=await api<Screen>('/proposals/'+proposal.id+'/captures',{method:'POST',body:JSON.stringify(captureSavePayload(capture,detail?.screens.find(s=>s.id===importTarget)))});
      await refresh(proposal.id,screen.id);navigate({page:'workspace',proposalId:proposal.id,screenId:screen.id});setPending(null);setModal(null);setNotice('「'+screen.title+'」を保存しました。');if(tourAwaitingSample.current){tourAwaitingSample.current=false;setTourStep(1);setTourOpen(true);}
    }catch(e){setError((e as Error).message);}finally{setBusy('');}
  };
  const sample=async(kind:'users'|'profile'|'mypage'|'search')=>{
    setBusy('サンプル画面を取り込んでいます');setError('');
    const iframe=document.createElement('iframe');iframe.style.cssText='position:fixed;left:-10000px;width:1280px;height:900px;border:0';iframe.setAttribute('sandbox','allow-same-origin');
    try{
      await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('サンプルを開けませんでした。')),15000);iframe.onload=()=>{clearTimeout(timer);resolve();};iframe.onerror=()=>{clearTimeout(timer);reject(new Error('サンプルを開けませんでした。'));};iframe.src='/sample/'+kind;document.body.append(iframe);});
      const capture=captureDocument(iframe.contentDocument!) as Capture;
      const prepared=await collectResources(capture,(url)=>fetch(url,{signal:AbortSignal.timeout(10000)})) as Capture;setPending({...prepared,title:detail?.screens.find(s=>s.id===importTarget)?.title||prepared.title});
    }catch(e){setError((e as Error).message);}finally{iframe.remove();setBusy('');}
  };
  const loadFile=async(input:File)=>{
    setError('');if(input.size>48*1024*1024){setError('48MB以下のファイルを選んでください。');return;}
    try{const capture=JSON.parse(await input.text()) as Capture;if(capture.schemaVersion!==1||!capture.html||!capture.viewport||!Array.isArray(capture.resources))throw new Error('format');setPending({...capture,title:detail?.screens.find(s=>s.id===importTarget)?.title||capture.title});}
    catch{setError('ScreenDraftから書き出した取り込みファイル（JSON）を選んでください。');}
  };
  const connection=async()=>{openSettings('extension');};
  const create=async()=>{if(busy||!proposalTitle.trim())return;setBusy('ドラフトを作成しています');try{const p=await api<Proposal>('/proposals',{method:'POST',body:JSON.stringify({title:proposalTitle})});await refresh(p.id);navigate({page:'workspace',proposalId:p.id});setModal(null);setProposalTitle('');}catch(e){setError((e as Error).message);}finally{setBusy('');}};
  const openImport=()=>{setImportTarget('');setPending(null);setError('');setModal('import');};
  const manage=(item:ManagedItem)=>{document.querySelectorAll<HTMLDetailsElement>('.screen-menu[open],.app-menu[open]').forEach(el=>el.open=false);setManaged(item);setError('');setModal('manage');};
  const loadTrash=async()=>{setTrash(await api<TrashDetail>('/trash'));};
  const openTrash=()=>{setError('');setTrash(null);navigate({page:'trash'});};
  const openGuide=()=>{setError('');setModal('guide');};
  const guideAction=(action:GuideAction)=>{
    setError('');
    if(action==='sample'){setTab('sample');openImport();return;}
    if(action==='new'){setProposalTitle('はじめてのドラフト');setModal('new');return;}
    if(action==='connect'){void connection();return;}
    setModal(null);
    if(action==='compare'&&selected){editor.setOriginal(false);setShowDetails(true);setZoom(zoomRef.current);setComparing(true);return;}
    if(action==='select'){setComparing(false);editor.setPicking(true);}
    setShowDetails(true);
  };
  const startTour=()=>{setModal(null);setComparing(false);setShowDetails(true);setTourStep(0);setTourOpen(true);};
  const finishTour=(reason:'completed'|'skipped')=>{setTourOpen(false);setShowDetails(true);try{localStorage.setItem('change-note:tour:v1',reason);}catch{/* Replay stays available even without browser storage. */}};
  useEffect(()=>{if(ready&&needsFirstTour&&!tourAutoStarted.current){tourAutoStarted.current=true;startTour();}},[ready,needsFirstTour]);
  useEffect(()=>{if(tourOpen)setShowDetails(true);},[tourOpen,tourStep]);
  const selectScreen=(id:string)=>{setSelectedId(id);if(detail)navigate({page:'workspace',proposalId:detail.proposal.id,screenId:id},true);};
  const dockWidth=clampInspectorWidth(inspector,viewport,rail?52:200);
  const fit=selected?Math.min(1,Math.max(.15,(stageWidth-64)/selected.width)):1,scale=zoom??fit;
  const onPan=useCanvasPan((selected?.id||'')+':'+editor.previewId+':'+comparing);
  const zoomRef=useRef(scale);zoomRef.current=scale;
  const onZoomWheel:ZoomWheelHandler=(deltaY,deltaMode=0,point,viewport)=>{const old=zoomRef.current,next=wheelZoom(old,{deltaY,deltaMode,metaKey:true});if(next===null||next===old)return;const commit=()=>flushSync(()=>{zoomRef.current=next;setZoom(next);});if(point&&viewport)anchorZoom(viewport,point,old,next,commit);else commit();};
  const wheelHandler=useRef(onZoomWheel);wheelHandler.current=onZoomWheel;
  useEffect(()=>{const wheel=(e:WheelEvent)=>{if(!(e.metaKey||e.ctrlKey))return;e.preventDefault();const viewport=(e.target as Element)?.closest?.<HTMLElement>('.preview-stage,.comparison-canvas');if(viewport)wheelHandler.current(e.deltaY,e.deltaMode,{x:e.clientX,y:e.clientY},viewport);};document.addEventListener('wheel',wheel,{capture:true,passive:false});return()=>document.removeEventListener('wheel',wheel,true);},[]);
  return <div className="app-shell workspace-v2">
    {route.page==='library'?<Library onImport={()=>setModal('draftImport')} items={proposals} loading={!ready} error={routeError} onOpen={id=>navigate({page:'workspace',proposalId:id})} onNew={()=>setModal('new')} onManage={manage} onTrash={openTrash} onSettings={()=>openSettings()} onHelp={openGuide} onRetry={()=>void refresh().catch(e=>setRouteError(e.message))} onSample={()=>{setTab('sample');openImport();}}/>:route.page==='trash'?<div className="trash-page"><header className="library-header"><button className="text-button" onClick={()=>navigate({page:'library'})}><ArrowLeft size={18}/>ドラフト一覧</button><strong>ゴミ箱</strong></header><div className="library-body"><aside className="library-nav"><button onClick={()=>navigate({page:'library'})}><FileText size={19}/>ドラフト</button><button className="active"><TrashIcon size={19}/>ゴミ箱</button><div className="nav-bottom"><button onClick={openGuide}><Question size={19}/>使い方</button><button onClick={()=>openSettings()}><GearSix size={19}/>設定</button></div></aside><main><h1>ゴミ箱</h1><Trash value={trash} reload={loadTrash} onBusy={setBusy} onRestored={async(proposalId,screenId)=>{await api<ProposalSummary[]>('/proposals').then(setProposals);setImportedLink({proposalId,screenId:screenId||'',kind:'restore'});setNotice('復元しました。');}}/>{error&&<p role="alert">{error}</p>}</main></div></div>:<>
    <header className="app-header"><details className="app-menu"><summary aria-label="アプリメニュー"><FileText size={24}/><span className="sr-only">ScreenDraft</span></summary><div><button onClick={()=>navigate({page:'library'})}>ドラフト一覧</button><button onClick={openTrash}>ゴミ箱</button><button onClick={()=>openSettings()}>設定</button><button onClick={openGuide}>使い方</button></div></details><button className="text-button back-library" onClick={()=>navigate({page:'library'})}><ArrowLeft size={17}/>ドラフト一覧</button>
      <button className="proposal-name" data-tour="proposal" disabled={!detail} onClick={()=>detail&&manage({kind:'proposal',id:detail.proposal.id,proposalId:detail.proposal.id,title:detail.proposal.title})}>{detail?.proposal.title||'ドラフトを読み込んでいます'}<CaretRight size={15}/></button>

      <div className="header-actions"><button className="button secondary" disabled={!detail} onClick={()=>setModal('export')}>書き出す</button></div>
    </header>
    {!routeError&&detail?.proposal.id!==route.proposalId?<main className="route-error" role="status">ドラフトを読み込んでいます</main>:routeError?<main className="route-error"><h1>ドラフトを開けませんでした</h1><p>{routeError}</p><button className="button primary" onClick={()=>navigate({page:'library'})}>ドラフト一覧へ</button><button className="button secondary" onClick={openTrash}>ゴミ箱を確認</button></main>:<>

    <div className={"workspace "+(comparing?"compare-mode ":"")+(rail?"rail-collapsed ":"")+(showDetails?"inspector-open":"inspector-closed")} style={{'--nav-width':(rail?52:200)+'px','--inspector-width':(showDetails?dockWidth:48)+'px'} as React.CSSProperties}>
      <aside className="screen-sidebar" data-tour="screens"><div className="sidebar-heading"><h2>画面</h2><button className="icon-button rail-toggle" aria-label={rail?'画面一覧を展開':'画面一覧を折り畳む'} aria-expanded={!rail} onClick={toggleRail}>{rail?<CaretDoubleRight size={18}/>:<CaretDoubleLeft size={18}/>}</button></div>
        <div className="screen-list">{detail?.screens.map(s=><div key={s.id} className="screen-row"><button className={'screen-item '+(selected?.id===s.id?'active':'')} title={s.title} onClick={()=>selectScreen(s.id)}><FileText size={19}/><span className="screen-item-copy"><strong>{s.title}</strong>{editor.jobs.some(j=>j.screenId===s.id&&['queued','running','ready'].includes(j.status))?<span className="screen-status">{editor.jobs.some(j=>j.screenId===s.id&&j.status==='ready')?'候補・確認待ち':'AI編集中'}</span>:s.warnings.some(isCaptureIssue)&&!s.captureIssuesReviewed?<span className="screen-status">要確認</span>:null}</span></button><details className="screen-menu"><summary aria-label={s.title+'の操作'}><DotsThree size={18}/></summary><div><button onClick={()=>{document.querySelectorAll<HTMLDetailsElement>('.screen-menu[open]').forEach(el=>el.open=false);selectScreen(s.id);setModal('info');}}>画面情報</button><button onClick={()=>manage({kind:'screen',id:s.id,proposalId:s.proposalId,title:s.title})}>名前変更・削除</button><button onClick={()=>{document.querySelectorAll<HTMLDetailsElement>('.screen-menu[open]').forEach(el=>el.open=false);openImport();setImportTarget(s.id);}}>再取り込み</button></div></details></div>)}</div>
        {!detail?.screens.length&&<div className="sidebar-empty"><FolderOpen size={30} weight="light"/><p>取り込んだ画面をここに表示します。</p></div>}
        <div className="sidebar-utilities"><button aria-label="画面を取り込む" title="画面を取り込む" data-tour="import" onClick={openImport}><Plus size={19}/><span>画面を取り込む</span></button><button aria-label="使い方" title="使い方" onClick={openGuide}><Question size={19}/><span>使い方</span></button><button aria-label="設定" title="設定" onClick={()=>openSettings()}><GearSix size={19}/><span>設定</span></button></div>
      </aside>
      {comparing&&detail&&selected?<Comparison onPan={onPan} scale={scale} onScaleChange={setZoom} onZoomWheel={onZoomWheel} chosenRevision={revisionId} onRevisionChange={setRevisionId} onSaved={applySaved} detail={detail} screen={selected} editor={editor} onExit={()=>{setZoom(zoomRef.current);setComparing(false);}} onOpenAi={()=>{setShowDetails(true);}}/>:<main className="main-workspace">
        <div className="preview-toolbar"><div className="view-switch"><button className="active">編集</button><button data-tour="compare" disabled={!selected} onClick={()=>{editor.setOriginal(false);setZoom(zoomRef.current);setComparing(true);}}>比較</button></div><span className="preview-title">{selected?.title}{editor.candidate&&<span className="preview-state">{editor.original?'変更前':'編集候補'}</span>}</span>{selected&&<button className={'pick-mode '+(editor.picking?'active':'')} disabled={editor.working||editor.candidate} aria-pressed={editor.picking} onClick={()=>editor.setPicking(!editor.picking)}><CursorClick size={17}/>選択</button>}</div>
        {error&&!modal&&<div className="alert error" role="alert"><WarningCircle size={20}/>{error}<button className="text-button" onClick={()=>void refresh().catch(e=>setError(e.message))}>再読み込み</button></div>}
        <div ref={stage} data-tour="canvas" className={'preview-stage '+(!selected?'empty-stage':'')}>
          {!ready?<div className="empty-view"><span className="spinner"/><p>ワークスペースを開いています</p></div>:selected?<>
            <div className="canvas-wrap" style={{width:selected.width*scale,minHeight:selected.height*scale}}><SelectableFrame onPan={onPan} key={editor.previewId} onZoomWheel={onZoomWheel} editor={editor} screen={selected} scale={scale} onLoad={()=>setPreviewReady(true)}/></div>
            {!previewReady&&<div className="preview-loading" role="status"><span className="spinner"/>保存した画面を読み込んでいます</div>}
          </>:<div className="empty-view"><span className="empty-icon"><FileText size={32} weight="light"/></span><h2>変更したい画面を<br/>取り込んでください</h2><p>Chromeで表示中の画面を取り込めます。<br/>取り込み後は変更したい部分を選択して編集できます。</p><button className="button primary" onClick={()=>void connection()}><PuzzlePiece size={18}/>{extensionConnected?'Chromeから取り込む':'Chrome拡張を接続する'}</button><button className="text-button sample-link" onClick={()=>{setTab('sample');openImport();}}>サンプルで試す<ArrowRight size={16}/></button></div>}
        </div>
        {selected&&<ZoomControls scale={scale} onChange={setZoom} onFit={()=>setZoom(null)}/>}
      </main>}
      <aside data-tour="ai" id="instruction-panel" className={"detail-sidebar "+(showDetails?"details-open":"")} >{showDetails&&<InspectorResize width={dockWidth} onChange={value=>setInspector(clampInspectorWidth(value,viewport,rail?52:200))}/>}<button className="icon-button details-close" aria-label={showDetails?'編集パネルを閉じる':'編集パネルを開く'} onClick={()=>setShowDetails(!showDetails)}>{showDetails?<CaretDoubleRight size={18}/>:<CaretDoubleLeft size={18}/>}</button><div className="side-tabs"><strong>AIへの指示</strong></div><><AiReadinessCard state={aiReadiness} issuesOnly/><button className="text-button readiness-settings" onClick={()=>openSettings('ai')}>AI連携の設定</button><AiPanel editor={editor} screen={selected} comparing={comparing}/><PendingEdits jobs={editor.jobs.filter(j=>j.screenId!==selected?.id)} screens={detail?.screens||[]} selectedId={selected?.id} onSelect={selectScreen} onCancel={editor.cancelJob}/></>
      </aside>
    </div>
    </>}</>}
    {importedLink&&<div className="import-arrival" role="status"><span>{importedLink.kind==='restore'?'復元しました':'取り込んだ画面があります'}</span><button className="text-button" onClick={()=>{void refresh(importedLink.proposalId,importedLink.screenId).then(()=>{navigate({page:'workspace',proposalId:importedLink.proposalId,screenId:importedLink.screenId});setImportedLink(null);}).catch(e=>setError(e.message));}}>{importedLink.kind==='restore'?'復元したドラフトを開く':'画面を表示'}</button><button className="icon-button" aria-label="取り込み通知を閉じる" onClick={()=>setImportedLink(null)}><X size={16}/></button></div>}
    {tourOpen&&<GuidedTour step={tourStep} setStep={setTourStep} onFinish={finishTour} onStartSample={()=>{setTourOpen(false);tourAwaitingSample.current=true;setTab('sample');openImport();}}/>}
    {notice&&<div className="toast" role="status"><CheckCircle size={19} weight="fill"/>{notice}</div>}
    {modal&&<div className="modal-backdrop" onClick={e=>{if(e.target===e.currentTarget)closeModal();}}><section className={'modal '+(modal==='settings'?'settings-modal':modal==='guide'?'guide-modal':modal==='import'?'import-modal':modal==='export'?'export-modal':'')} role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-header"><div><span className="eyebrow">ScreenDraft</span><h2 id="modal-title">{modal==='info'?'画面情報':modal==='export'?'ドラフトを書き出す':modal==='draftImport'?'ドラフトを読み込む':modal==='settings'?'設定':modal==='new'?'新しいドラフト':modal==='guide'?'ScreenDraftの使い方':modal==='manage'?(managed?.kind==='proposal'?'ドラフトを管理':'画面を管理'):'画面を追加'}</h2></div><button className="icon-button" disabled={!!busy} aria-label="閉じる" onClick={closeModal}><X size={21}/></button></div>
      {modal==='export'&&detail&&<DraftExport onBusy={setBusy} detail={detail} chosenRevision={revisionId} pending={editor.jobs.filter(j=>['queued','running','ready'].includes(j.status)).map(j=>j.screenId)}/>}
      {modal==='draftImport'&&<DraftImport onBusy={setBusy} onImported={async value=>{await refresh(value.proposal.id);navigate({page:'workspace',proposalId:value.proposal.id});setModal(null);setNotice('ドラフトを読み込みました。');}}/>}
      {modal==='export'||modal==='draftImport'?null:modal==='info'?<>{selected?<><dl className="capture-details"><dt>画面名</dt><dd>{selected.title}</dd><dt>取得元</dt><dd className="source-url">{selected.sourceUrl}</dd><dt>画面サイズ</dt><dd>{selected.width} × {selected.height} px</dd><dt>保存したリソース</dt><dd>{selected.assetCount} 件<span className="muted">画像・フォントなど</span></dd></dl>
      {selected.warnings.some(isCaptureIssue)?<div className="warnings"><h3><WarningCircle size={18}/>{selected.captureIssuesReviewed?'確認済みの項目':'確認が必要な項目'} <span>{selected.warnings.filter(isCaptureIssue).length}</span></h3><p>一部の見た目を再現できていない可能性があります。</p><ul>{selected.warnings.filter(isCaptureIssue).map((w,i)=><li key={i}>{w}</li>)}</ul>{!selected.captureIssuesReviewed&&<button className="button secondary" disabled={!!busy} onClick={()=>{void (async()=>{setBusy('確認状態を保存しています');setError('');try{const updated=await api<ProposalDetail>('/proposals/'+selected.proposalId+'/screens/'+selected.id+'/capture-review',{method:'POST',body:JSON.stringify({snapshotId:selected.snapshotId})});applySaved(updated);setNotice('確認済みにしました。');}catch(e){setError((e as Error).message);}finally{setBusy('');}})();}}>確認済みにする</button>}</div>:<div className="replay-note"><CheckCircle size={18}/><p>取得時にリソースの不足は検出されませんでした。</p></div>}
      {selected.warnings.some(w=>!isCaptureIssue(w))&&<details className="capture-notes"><summary>取り込み時の記録</summary><ul>{selected.warnings.filter(w=>!isCaptureIssue(w)).map((w,i)=><li key={i}>{w}</li>)}</ul></details>}<button className="button secondary wide" onClick={()=>window.open('/api/snapshots/'+selected.snapshotId,'_blank','noopener,noreferrer')}><ArrowSquareOut size={17}/>元のサイズで開く</button><p className="static-note">動きのある操作は再現されません。表示中の状態を保存しています。</p></>:<><p className="intro-copy">表示中の画面を<br/>ドラフトとして保存できます。</p><ol className="instructions"><li><span>1</span><div><strong>画面を開く</strong><p>localhostやログイン済みの画面も取り込めます。</p></div></li><li><span>2</span><div><strong>拡張機能で取得</strong><p>必要なタブやモーダルを開いた状態で実行します。</p></div></li><li><span>3</span><div><strong>内容を確認して保存</strong><p>表示データが含まれます。保存前に内容を確認します。</p></div></li></ol><div className="privacy-note"><HardDrives size={20}/><p>この段階ではデータはこのPCだけに保存されます。</p></div><button className="button secondary wide" onClick={()=>void connection()}><PuzzlePiece size={17}/>拡張機能の接続方法</button></>}</>:modal==='settings'?<><Settings topic={settingsTopic} setTopic={setSettingsTopic} ai={aiReadiness} onHelp={()=>{setGuideTopic('import');setModal('guide');}}/><footer className="settings-footer"><button className="button primary" onClick={closeModal}>閉じる</button></footer></>:modal==='manage'&&managed?<ManageItem key={managed.kind+managed.id} item={managed} onBusy={setBusy} onDone={async deleted=>{await refresh(route.page==='workspace'&&detail?.proposal.id===managed.proposalId?detail.proposal.id:undefined,deleted?undefined:selected?.id);if(deleted&&managed.kind==='proposal'&&route.page==='workspace')navigate({page:'library'});setModal(null);setNotice(deleted?'ゴミ箱へ移動しました。ゴミ箱から復元できます。':'名前を保存しました。');}}/>:modal==='guide'?<GettingStarted topic={guideTopic} setTopic={setGuideTopic} step={guideStep} setStep={setGuideStep} hasScreen={route.page==='workspace'&&!!selected} onAction={guideAction} aiReadiness={aiReadiness} onReplay={startTour}/>:modal==='new'?<><label className="field-label">ドラフトの名前<input autoFocus data-unsaved={!!proposalTitle.trim()} value={proposalTitle} onChange={e=>setProposalTitle(e.target.value)} placeholder="例：ユーザーに性別項目を追加" maxLength={120} onKeyDown={e=>{if(e.key==='Enter')void create();}}/></label><p className="field-hint">関連する画面をひとつのドラフトにまとめます。</p><button className="button primary wide" disabled={!proposalTitle.trim()||!!busy} onClick={()=>void create()}>ドラフトを作成</button></>:<>
        {!pending?<><div className="import-tabs" role="tablist" aria-label="取り込み方法">{(['sample','browser','file'] as const).map(t=><button key={t} role="tab" aria-selected={tab===t} className={tab===t?'active':''} onClick={()=>{setTab(t);setError('');}}>{t==='sample'?'サンプルで試す':t==='browser'?'ブラウザから取得':'ファイルを読み込む'}</button>)}</div>
        {tab==='sample'?<><p className="dialog-copy">サンプル画面で取得・保存・再表示を試せます。表示例のデータだけを使用します。</p><div className="sample-options"><button disabled={!!busy} onClick={()=>void sample('users')}><Monitor size={25}/><div><strong>ユーザー一覧</strong><p>テーブル・検索欄・ステータス</p></div><ArrowRight size={19}/></button><button disabled={!!busy} onClick={()=>void sample('profile')}><FileText size={25}/><div><strong>プロフィール設定</strong><p>入力値・選択状態のあるフォーム</p></div><ArrowRight size={19}/></button><button disabled={!!busy} onClick={()=>void sample('mypage')}><FileText size={25}/><div><strong>マイページ</strong><p>登録した情報を確認する表示画面</p></div><ArrowRight size={19}/></button><button disabled={!!busy} onClick={()=>void sample('search')}><Monitor size={25}/><div><strong>ユーザー検索</strong><p>条件を指定する検索フォーム</p></div><ArrowRight size={19}/></button></div></>:tab==='browser'?<div className="browser-instructions"><PuzzlePiece size={36} weight="light"/><h3>Chrome拡張から画面を取り込む</h3><p>ログイン済み・localhostの画面も<br/>ブラウザに表示されている状態で取り込めます。</p><button className="button primary" onClick={()=>void connection()}>拡張機能を接続する<ArrowRight size={17}/></button></div>:<div className="file-drop"><UploadSimple size={36} weight="light"/><h3>取り込みファイルを読み込む</h3><p>ScreenDraft拡張から書き出したJSONを選択してください。</p><button className="button secondary" onClick={()=>file.current?.click()}>ファイルを選ぶ</button><input ref={file} type="file" accept=".json,application/json" hidden onChange={e=>{const f=e.target.files?.[0];if(f)void loadFile(f);e.target.value='';}}/></div>}</>:<div className="import-review"><span className="review-icon"><CheckCircle size={28}/></span><h3>この画面を保存しますか？</h3><label className="field-label">保存方法<select value={importTarget} disabled={!!busy} onChange={e=>{setImportTarget(e.target.value);const screen=detail?.screens.find(s=>s.id===e.target.value);if(screen)setPending({...pending,title:screen.title});}}><option value="">別の画面として追加</option>{detail?.screens.map(s=><option key={s.id} value={s.id}>既存画面を更新：{s.title}</option>)}</select></label>{importTarget&&<p className="alert info">選択した画面を更新します。更新前の内容は履歴に残ります。</p>}<label className="field-label">画面名<input value={pending.title} maxLength={300} onChange={e=>setPending({...pending,title:e.target.value})}/></label><div className="review-meta"><span><Monitor size={16}/>{pending.viewport.width} × {pending.viewport.height}</span><span><Image size={16}/>{pending.resources.length}件のリソース</span></div><p className="source-url">{pending.sourceUrl}</p><CaptureReviewPreview capture={pending}/><div className="alert info"><Info size={19}/><p>画面に表示されている名前・メールアドレス・入力値なども保存されます。取り込む内容を確認してください。</p></div>{pending.warnings.length>0&&<p className="warning-text">取得時の確認事項が{pending.warnings.length}件あります。保存後に詳細を表示します。</p>}<div className="review-actions"><button disabled={!!busy} className="button secondary" onClick={()=>setPending(null)}>選び直す</button><button className="button primary" disabled={!pending.title.trim()||!!busy} onClick={()=>void save(pending)}><HardDrives size={17}/>{importTarget?'選択した画面を更新':'この画面を保存'}</button></div></div>}
      </>}
      {busy&&<div className="busy-line" role="status"><span className="spinner"/>{busy}</div>}{error&&<div className="alert error" role="alert"><WarningCircle size={20}/>{error}</div>}
    </section></div>}
  </div>;
}
