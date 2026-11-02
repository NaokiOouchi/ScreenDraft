export type PanPhase='start'|'move'|'end';
export interface PanPoint {x:number;y:number}
export type PanHandler=(phase:PanPhase,point:PanPoint,viewport:HTMLElement)=>void;

export function panCanvases(panes:HTMLElement[],dx:number,dy:number){
 if(!Number.isFinite(dx)||!Number.isFinite(dy))return;
 for(const pane of panes){const wrap=pane.querySelector<HTMLElement>('.canvas-wrap');if(!wrap)continue;
  const x=pane.scrollLeft,y=pane.scrollTop;pane.scrollLeft-=dx;pane.scrollTop-=dy;
  wrap.style.left=((parseFloat(wrap.style.left)||0)+dx+pane.scrollLeft-x)+'px';
  wrap.style.top=((parseFloat(wrap.style.top)||0)+dy+pane.scrollTop-y)+'px';
 }
}
export function panTargets(viewport:HTMLElement){
 const group=viewport.closest<HTMLElement>('.comparison-panes');
 return group?.dataset.panSync==='true'?Array.from(group.querySelectorAll<HTMLElement>('.comparison-canvas')):[viewport];
}
