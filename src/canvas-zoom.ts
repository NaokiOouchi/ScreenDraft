export function clampZoom(value:number){return Math.round(Math.max(.1,Math.min(1.5,value))*1000)/1000;}
export function wheelZoom(scale:number,event:{deltaY:number;deltaMode?:number;metaKey?:boolean;ctrlKey?:boolean}){
 if(!(event.metaKey||event.ctrlKey)||!Number.isFinite(event.deltaY))return null;
 const unit=event.deltaMode===1?16:event.deltaMode===2?800:1;
 return clampZoom(scale*Math.exp(-Math.max(-300,Math.min(300,event.deltaY*unit))*.002));
}

export interface ZoomPoint {x:number;y:number}
export type ZoomWheelHandler=(deltaY:number,deltaMode?:number,point?:ZoomPoint,viewport?:HTMLElement)=>void;
export function zoomScrollDelta(cursor:number,before:number,after:number,oldScale:number,newScale:number){
 return after+(cursor-before)*newScale/oldScale-cursor;
}

export function anchorZoom(viewport:HTMLElement,point:ZoomPoint,oldScale:number,newScale:number,commit:()=>void){
 const panes=viewport.classList.contains('comparison-canvas')?Array.from(viewport.closest('.comparison-panes')!.querySelectorAll<HTMLElement>('.comparison-canvas')):[viewport];
 const origin=viewport.getBoundingClientRect();
 const anchors=panes.map(pane=>{const wrap=pane.querySelector<HTMLElement>('.canvas-wrap'),rect=pane.getBoundingClientRect();return wrap?{pane,wrap,before:wrap.getBoundingClientRect(),x:rect.left+point.x-origin.left,y:rect.top+point.y-origin.top}:null;}).filter(a=>a!==null);
 commit();
 for(const a of anchors){const after=a.wrap.getBoundingClientRect(),x=zoomScrollDelta(a.x,a.before.left,after.left,oldScale,newScale),y=zoomScrollDelta(a.y,a.before.top,after.top,oldScale,newScale),left=a.pane.scrollLeft,top=a.pane.scrollTop;a.pane.scrollLeft+=x;a.pane.scrollTop+=y;
  // スクロール端でもカーソル位置を維持する。
  a.wrap.style.left=((parseFloat(a.wrap.style.left)||0)-(x-(a.pane.scrollLeft-left)))+'px';a.wrap.style.top=((parseFloat(a.wrap.style.top)||0)-(y-(a.pane.scrollTop-top)))+'px';
 }
}

export function resetZoomPosition(){for(const wrap of document.querySelectorAll<HTMLElement>('.preview-stage .canvas-wrap,.comparison-canvas .canvas-wrap')){wrap.style.left='';wrap.style.top='';}}
