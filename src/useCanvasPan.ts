import {useEffect,useRef} from 'react';
import {panCanvases,panTargets,type PanHandler,type PanPoint} from './canvas-pan';
export function useCanvasPan(identity:string){
 const session=useRef<{viewport:HTMLElement;point:PanPoint}|null>(null);
 const end=()=>{session.current=null;document.documentElement.classList.remove('canvas-panning');};
 const handle:PanHandler=(phase,point,viewport)=>{
  if(phase==='end'){end();return;}
  if(phase==='start'){session.current={viewport,point};document.documentElement.classList.add('canvas-panning');return;}
  const active=session.current;if(!active||active.viewport!==viewport||!viewport.isConnected)return;
  panCanvases(panTargets(viewport),point.x-active.point.x,point.y-active.point.y);active.point=point;
 };
 const latest=useRef(handle);latest.current=handle;
 useEffect(()=>{end();return end;},[identity]);
 useEffect(()=>{
  const viewport=(e:Event)=>(e.target as Element)?.closest?.<HTMLElement>('.preview-stage,.comparison-canvas');
  const point=(e:PointerEvent)=>({x:e.screenX,y:e.screenY});
  const down=(e:PointerEvent)=>{const pane=viewport(e);if(e.button!==2||!pane)return;e.preventDefault();(e.target as Element).setPointerCapture?.(e.pointerId);latest.current('start',point(e),pane);};
  const move=(e:PointerEvent)=>{const active=session.current;if(!active)return;if(!(e.buttons&2)){end();return;}e.preventDefault();latest.current('move',point(e),active.viewport);};
  const up=(e:PointerEvent)=>{if(e.button===2||!(e.buttons&2))end();};
  const menu=(e:MouseEvent)=>{if(viewport(e))e.preventDefault();};
  document.addEventListener('pointerdown',down,true);document.addEventListener('pointermove',move,true);document.addEventListener('pointerup',up,true);document.addEventListener('pointercancel',end,true);document.addEventListener('contextmenu',menu,true);window.addEventListener('blur',end);
  return()=>{end();document.removeEventListener('pointerdown',down,true);document.removeEventListener('pointermove',move,true);document.removeEventListener('pointerup',up,true);document.removeEventListener('pointercancel',end,true);document.removeEventListener('contextmenu',menu,true);window.removeEventListener('blur',end);};
 },[]);
 return handle;
}
