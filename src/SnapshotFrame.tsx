import type {PanHandler} from './canvas-pan';
import type {ZoomWheelHandler} from './canvas-zoom';
import {useEffect,useMemo,useRef,useState} from 'react';
import {comparisonRegion,type FrameRegion} from './comparison-region';
import type {PickedNode} from '../shared/editor-types';
export interface ScrollPosition {x:number;y:number;targetId:string|null;sequence:number}
interface Props {
 onZoomWheel?:ZoomWheelHandler;onPan?:PanHandler;
 snapshotId:string;screenId:string;width:number;height:number;scale:number;title:string;
 regionRequest?:{ids:string[];token:string};onRegion?:(region:FrameRegion|null)=>void;offset?:{x:number;y:number};
 selectedIds?:string[];picking?:boolean;command?:{type:string;data?:unknown;seq:number}|null;
 onSelection?:(nodes:PickedNode[])=>void;onSelectionError?:(message:string)=>void;onLoad?:()=>void;
 reportScroll?:number;onScroll?:(position:Omit<ScrollPosition,'sequence'>)=>void;scrollTo?:ScrollPosition|null;
}
export function SnapshotFrame(props:Props){
 const frame=useRef<HTMLIFrameElement>(null),latest=useRef(props);latest.current=props;
 const [attempt,setAttempt]=useState(0),[documentHtml,setDocumentHtml]=useState(''),[loadError,setLoadError]=useState('');
 const measured=useRef('');
 const channel=useMemo(()=>crypto.randomUUID(),[props.snapshotId,props.screenId,attempt]);
 const post=(type:string,data?:unknown)=>frame.current?.contentWindow?.postMessage({channel,type,data},'*');
 useEffect(()=>{let live=true;const controller=new AbortController();setDocumentHtml('');setLoadError('');
  void fetch('/api/previews/'+props.snapshotId+'?channel='+channel,{signal:controller.signal}).then(async response=>{
   if(!response.ok)throw new Error('保存されたプレビューを読み込めませんでした。');
   const policy=response.headers.get('Content-Security-Policy');if(!policy)throw new Error('プレビューの実行ポリシーを取得できませんでした。');
   const safePolicy=policy.replace(/; frame-ancestors [^;]+/,'').replace(/; sandbox[^;]*/,'').replaceAll('&','&amp;').replaceAll('"','&quot;');
   const html=await response.text();if(live)setDocumentHtml(html.replace(/<head([^>]*)>/i,match=>match+'<meta http-equiv="Content-Security-Policy" content="'+safePolicy+'">'));
  }).catch(error=>{if(live){setLoadError(error.message);latest.current.onLoad?.();}});return()=>{live=false;controller.abort();};
 },[channel]);
 useEffect(()=>{const listener=(event:MessageEvent)=>{
  if(event.source!==frame.current?.contentWindow||event.data?.channel!==channel)return;
  const p=latest.current;
  if(event.data.type==='region'&&p.regionRequest&&event.data.data?.token===p.regionRequest.token){measured.current=p.regionRequest.token;p.onRegion?.(comparisonRegion(event.data.data.rect,p.width,p.height));}
  if(event.data.type==='zoomWheel'&&Number.isFinite(event.data.data?.deltaY)&&[0,1,2].includes(event.data.data?.deltaMode)){const data=event.data.data,el=frame.current,viewport=el?.closest<HTMLElement>('.preview-stage,.comparison-canvas');if(el&&viewport&&Number.isFinite(data.clientX)&&Number.isFinite(data.clientY)){const rect=el.getBoundingClientRect();p.onZoomWheel?.(data.deltaY,data.deltaMode,{x:rect.left+data.clientX*p.scale,y:rect.top+data.clientY*p.scale},viewport);}}
  if(event.data.type==='pan'){const data=event.data.data,viewport=frame.current?.closest<HTMLElement>('.preview-stage,.comparison-canvas');if(viewport&&['start','move','end'].includes(data?.phase)&&Number.isFinite(data.x)&&Number.isFinite(data.y))p.onPan?.(data.phase,{x:data.x,y:data.y},viewport);}
  if(event.data.type==='ready'){if(p.regionRequest)post('measureRegion',p.regionRequest);post('mode',!!p.picking);if(p.picking&&p.selectedIds?.length)post('restoreSelection',p.selectedIds);if(p.scrollTo)post('scrollTo',p.scrollTo);p.onLoad?.();}
  if(event.data.type==='selection'&&p.picking&&Array.isArray(event.data.data)){p.onSelection?.(event.data.data.filter((n:PickedNode)=>typeof n?.id==='string'&&typeof n?.tag==='string'&&typeof n?.text==='string'&&Array.isArray(n?.ancestors)).slice(0,8));}
  if(event.data.type==='selectionError'&&p.picking&&typeof event.data.data==='string')p.onSelectionError?.(event.data.data);
  const data=event.data.data;
  if(event.data.type==='scroll'&&Number.isFinite(data?.x)&&Number.isFinite(data?.y)&&(data.targetId===null||typeof data.targetId==='string'))p.onScroll?.(data);
 };window.addEventListener('message',listener);return()=>window.removeEventListener('message',listener);},[channel]);
 useEffect(()=>{post('mode',!!props.picking);if(props.picking&&latest.current.selectedIds?.length)post('restoreSelection',latest.current.selectedIds);},[props.picking,channel]);
 useEffect(()=>{if(props.command&&props.picking)post(props.command.type,props.command.data);},[props.command]);
 useEffect(()=>{if(!props.regionRequest)return;post('measureRegion',props.regionRequest);const timer=setTimeout(()=>{if(measured.current!==props.regionRequest?.token)latest.current.onRegion?.(null);},5000);return()=>clearTimeout(timer);},[props.regionRequest?.token,channel]);
 useEffect(()=>{if(props.reportScroll)post('reportScroll');},[props.reportScroll,channel]);
 useEffect(()=>{if(props.scrollTo)post('scrollTo',props.scrollTo);},[props.scrollTo,channel]);
 return <>{documentHtml&&<iframe ref={frame} key={channel} className="snapshot-frame" title={props.title} srcDoc={documentHtml} sandbox="allow-scripts" onLoad={()=>post('mode',!!latest.current.picking)} style={{width:props.width,height:props.height,transform:`scale(${props.scale})`,left:-(props.offset?.x||0)*props.scale,top:-(props.offset?.y||0)*props.scale}}/>}{loadError&&<div className="preview-failure" role="alert"><p>{loadError}</p><button className="button secondary" onClick={()=>setAttempt(a=>a+1)}>再読み込み</button></div>}</>;
}
