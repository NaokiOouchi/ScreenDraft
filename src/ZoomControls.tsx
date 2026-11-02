import {useState} from 'react';
import {Minus,Plus} from '@phosphor-icons/react';
import {clampZoom,resetZoomPosition} from './canvas-zoom';
export function ZoomControls({scale,onChange,onFit}:{scale:number;onChange:(scale:number)=>void;onFit:()=>void}){
 const [open,setOpen]=useState(false),[value,setValue]=useState('');
 const close=()=>setOpen(false);
 const change=(next:number)=>{resetZoomPosition();onChange(next);};
 return <div className="canvas-zoom" role="group" aria-label="キャンバスのズーム" onKeyDown={e=>{if(e.key==='Escape')close();}}>
  <button aria-label="縮小" onClick={()=>change(clampZoom(scale-.1))}><Minus size={16}/></button>
  <button className="zoom-value" aria-label="ズーム倍率" aria-expanded={open} onClick={()=>{setValue(String(Math.round(scale*100)));setOpen(!open);}}>{Math.round(scale*100)}%</button>
  <button aria-label="拡大" onClick={()=>change(clampZoom(scale+.1))}><Plus size={16}/></button>
  {open&&<><button className="zoom-dismiss" aria-label="倍率メニューを閉じる" onClick={close}/><div className="zoom-menu"><form onSubmit={e=>{e.preventDefault();const n=Number(value);if(Number.isFinite(n)&&n>=10&&n<=150){change(n/100);close();}}}><label htmlFor="canvas-zoom-input">倍率</label><div><input id="canvas-zoom-input" autoFocus type="number" min="10" max="150" value={value} onChange={e=>setValue(e.target.value)}/><span>%</span><button type="submit">適用</button></div></form><button onClick={()=>{change(1);close();}}>100%</button><button onClick={()=>{resetZoomPosition();onFit();close();}}>全体表示</button></div></>}
 </div>;
}
