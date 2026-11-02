import {createHash} from 'node:crypto';
import {replayCsp} from './normalize.js';
// This is the only script permitted in an editor iframe. Imported scripts never run.
function bridge(channel:string) {
 const send=(type:string,data:unknown)=>parent.postMessage({channel,type,data},'*');
 const host=document.createElement('div');host.setAttribute('data-cn-editor','');host.style.cssText='all:initial;position:fixed;inset:0;pointer-events:none;z-index:2147483647';document.documentElement.append(host);
 const shadow=host.attachShadow({mode:'closed'});let selected:string[]=[],enabled=false,hover:Element|null=null;
 const lookup=(id:string)=>document.querySelector('[data-cn-id="'+CSS.escape(id)+'"]');
 const describe=(el:Element)=>({id:el.getAttribute('data-cn-id')!,tag:el.tagName.toLowerCase(),text:(el.getAttribute('aria-label')||(el as HTMLInputElement).labels?.[0]?.textContent||el.getAttribute('placeholder')||el.textContent||'').trim().replace(/\s+/g,' ').slice(0,100)});
 const emitSelection=()=>send('selection',selected.map(id=>{const el=lookup(id);if(!el)return null;const ancestors=[];let p=el.parentElement;while(p){if(p.hasAttribute('data-cn-id')&&!['HTML','BODY'].includes(p.tagName))ancestors.push(describe(p));p=p.parentElement;}return {...describe(el),ancestors};}).filter(Boolean));
 function draw(){shadow.replaceChildren();for(const [id,active] of [...selected.map(id=>[id,true] as const),...(hover?[[hover.getAttribute('data-cn-id')!,false] as const]:[])]){const el=lookup(id);if(!el)continue;const r=el.getBoundingClientRect();if(!r.width||!r.height)continue;const box=document.createElement('div');box.style.cssText=`position:fixed;box-sizing:border-box;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;border:${active?2:1}px solid #3278ff;background:transparent;pointer-events:none`;const label=document.createElement('span');label.textContent=el.tagName.toLowerCase()+(active?' · 選択中':'');label.style.cssText='position:absolute;left:-2px;top:-23px;background:#3278ff;color:white;font:12px/21px sans-serif;padding:0 6px;white-space:nowrap';box.append(label);shadow.append(box);}}
 const choose=(el:Element,add:boolean)=>{if(['TH','TD','TR','TBODY','THEAD','TFOOT','COL','COLGROUP'].includes(el.tagName))el=el.closest('table[data-cn-id]')||el;const id=el.getAttribute('data-cn-id');if(!id||['HTML','BODY','HEAD'].includes(el.tagName))return;if(add&&selected.includes(id))selected=selected.filter(x=>x!==id);else{const kept=add?selected.filter(x=>{const n=lookup(x);return n&&!n.contains(el)&&!el.contains(n);}):[];selected=[...kept,id].slice(-8);}draw();emitSelection();};
 document.addEventListener('wheel',e=>{if(e.metaKey||e.ctrlKey){e.preventDefault();e.stopImmediatePropagation();send('zoomWheel',{deltaY:e.deltaY,deltaMode:e.deltaMode,clientX:e.clientX,clientY:e.clientY});}},{capture:true,passive:false});
 let panning=false,panPointer:number|null=null,previousCursor='',previousCursorPriority='';
 const pan=(phase:string,e:PointerEvent)=>send('pan',{phase,x:e.screenX,y:e.screenY});
 const stopPan=(e?:PointerEvent)=>{if(!panning)return;panning=false;panPointer=null;if(previousCursor)document.documentElement.style.setProperty('cursor',previousCursor,previousCursorPriority);else document.documentElement.style.removeProperty('cursor');send('pan',{phase:'end',x:e?.screenX||0,y:e?.screenY||0});};
 document.addEventListener('pointerdown',e=>{if(e.button!==2)return;e.preventDefault();e.stopImmediatePropagation();panning=true;panPointer=e.pointerId;previousCursor=document.documentElement.style.getPropertyValue('cursor');previousCursorPriority=document.documentElement.style.getPropertyPriority('cursor');document.documentElement.setPointerCapture?.(e.pointerId);document.documentElement.style.setProperty('cursor','grabbing','important');pan('start',e);},true);
 document.addEventListener('pointermove',e=>{if(!panning)return;e.preventDefault();e.stopImmediatePropagation();if(!(e.buttons&2)){stopPan(e);return;}pan('move',e);},true);
 document.addEventListener('pointerup',e=>{if(!panning)return;e.preventDefault();e.stopImmediatePropagation();stopPan(e);},true);
 document.addEventListener('pointercancel',e=>stopPan(e),true);
 document.addEventListener('lostpointercapture',e=>{if(e.pointerId===panPointer)stopPan(e);},true);
 document.addEventListener('contextmenu',e=>{e.preventDefault();e.stopImmediatePropagation();},true);
 window.addEventListener('blur',()=>stopPan());
 document.addEventListener('pointermove',e=>{if(!enabled)return;const el=(e.target as Element).closest?.('[data-cn-id]');hover=el&&!['HTML','BODY','HEAD'].includes(el.tagName)?el:null;draw();},true);
 document.addEventListener('pointerleave',()=>{hover=null;draw();},true);
 document.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();if(enabled){const el=(e.target as Element).closest?.('[data-cn-id]');if(el)choose(el,(e as MouseEvent).shiftKey);}},true);
 document.addEventListener('pointerdown',e=>{if(e.button===0&&(e.target as Element).closest?.('input,select,textarea,button,a'))e.preventDefault();},true);
 document.addEventListener('beforeinput',e=>e.preventDefault(),true);
 document.addEventListener('submit',e=>{e.preventDefault();e.stopImmediatePropagation();},true);
 document.addEventListener('keydown',e=>{if(e.key==='Escape'){selected=[];hover=null;draw();emitSelection();}if(enabled&&(e.key==='ArrowDown'||e.key==='ArrowUp')){e.preventDefault();const targets=Array.from(document.querySelectorAll('[data-cn-id]')).filter(el=>!['HTML','BODY','HEAD','STYLE','LINK','META','SCRIPT'].includes(el.tagName)&&el.getBoundingClientRect().width>0&&el.getBoundingClientRect().height>0);const index=hover?targets.indexOf(hover):-1;hover=targets[(index+(e.key==='ArrowDown'?1:-1)+targets.length)%targets.length]||null;hover?.scrollIntoView({block:'nearest'});draw();}if(e.key==='Enter'){e.preventDefault();if(enabled){const el=hover||(e.target as Element).closest?.('[data-cn-id]');if(el)choose(el,e.shiftKey);}}if((e.target as Element).closest?.('input,select,textarea,button,a')&&!['Tab','Escape'].includes(e.key))e.preventDefault();},true);
 let suppressScroll=false;
 const publishScroll=(event:Event)=>{draw();if(suppressScroll)return;const target=event.target;const el=target instanceof Element?target:null;send('scroll',{x:el?el.scrollLeft:window.scrollX,y:el?el.scrollTop:window.scrollY,targetId:el?.getAttribute('data-cn-id')||null});};
 window.addEventListener('scroll',publishScroll,true);window.addEventListener('resize',draw);
 window.addEventListener('message',event=>{if(event.source!==parent||event.data?.channel!==channel)return;const {type,data}=event.data;
 if(type==='measureRegion'&&data&&Array.isArray(data.ids)){
  const ids=data.ids.filter((id:unknown)=>typeof id==='string').slice(0,8),elements=ids.map((id:string)=>lookup(id));
  if(!ids.length||elements.some((el:Element|null)=>!el)){send('region',{token:data.token,rect:null});return;}
  suppressScroll=true;elements[0]!.scrollIntoView({block:'start',inline:'nearest',behavior:'instant'});
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
   const rects=elements.map((el:Element)=>el.getBoundingClientRect());
   const x=Math.max(0,Math.min(...rects.map((r:DOMRect)=>r.left))-8),y=Math.max(0,Math.min(...rects.map((r:DOMRect)=>r.top))-8);
   const endX=Math.min(innerWidth,Math.max(...rects.map((r:DOMRect)=>r.right))+8),endY=Math.min(innerHeight,Math.max(...rects.map((r:DOMRect)=>r.bottom))+8);
   const valid=rects.every((r:DOMRect)=>r.width>0&&r.height>0)&&endX>x&&endY>y;
   send('region',{token:data.token,rect:valid?{x,y,width:endX-x,height:endY-y}:null});suppressScroll=false;draw();
  }));
 }
 if(type==='reportScroll')send('scroll',{x:window.scrollX,y:window.scrollY,targetId:null});
 if(type==='scrollTo'&&data&&Number.isFinite(data.x)&&Number.isFinite(data.y)){
  const target=data.targetId?lookup(data.targetId):window;if(!target)return;suppressScroll=true;
  target.scrollTo({left:Math.max(0,data.x),top:Math.max(0,data.y),behavior:'instant'});
  requestAnimationFrame(()=>requestAnimationFrame(()=>{suppressScroll=false;}));
 }
 if(type==='pickMain'&&enabled){const el=document.querySelector('main[data-cn-id], [role=main][data-cn-id]');if(el)choose(el,false);else send('selectionError','本文領域が見つかりません。画面をクリックしてから上位の範囲を選んでください。');}
 if(type==='restoreSelection'&&enabled&&Array.isArray(data)){selected=data.filter(id=>typeof id==='string'&&lookup(id)).slice(0,8);draw();emitSelection();}if(type==='mode'){enabled=!!data;hover=null;if(!enabled)selected=[];draw();}if(type==='clear'){selected=[];draw();emitSelection();}if(type==='pick'&&enabled&&typeof data==='string'){const el=lookup(data);if(el)choose(el,false);}});
 send('ready',{});
}
export function editorPreview(html:string,channel:string){
 const script='(()=>{const __name=(value)=>value;('+bridge.toString()+')('+JSON.stringify(channel)+');})();';
 const hash=createHash('sha256').update(script).digest('base64');
 return {html:html.replace('</body>','<script>'+script+'</script></body>'),csp:replayCsp.replace("script-src 'none'",`script-src 'sha256-${hash}'`).replace(/; sandbox$/, '; sandbox allow-scripts')};
}
