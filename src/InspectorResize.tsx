import {useRef} from 'react';
export function InspectorResize({width,onChange}:{width:number;onChange:(width:number)=>void}){
 const drag=useRef<{x:number;width:number}|null>(null);
 return <div className="inspector-resize" role="separator" aria-label="指示パネルの幅" aria-orientation="vertical" aria-valuemin={280} aria-valuemax={420} aria-valuenow={width} tabIndex={0}
  onPointerDown={e=>{drag.current={x:e.clientX,width};e.currentTarget.setPointerCapture(e.pointerId);}}
  onPointerMove={e=>{if(drag.current)onChange(drag.current.width+drag.current.x-e.clientX);}}
  onPointerUp={()=>{drag.current=null;}} onLostPointerCapture={()=>{drag.current=null;}}
  onKeyDown={e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();onChange(e.key==='Home'?280:e.key==='End'?420:width+(e.key==='ArrowLeft'?16:-16));}}}/>;
}
