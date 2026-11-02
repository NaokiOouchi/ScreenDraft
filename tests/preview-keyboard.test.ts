import {test} from 'node:test';import assert from 'node:assert/strict';import {runInNewContext} from 'node:vm';
import {editorPreview} from '../server/preview.js';
test('保存済みフレームは矢印キーとEnterで対象を選択し、無効時は選択しない',()=>{
 const messages:any[]=[];const listeners:Record<string,(e:any)=>void>={};let receive:(e:any)=>void=()=>{};
 const box=()=>({style:{},append(){},setAttribute(){},attachShadow:()=>({replaceChildren(){},append(){}})});
 const nodes=['h','p'].map((id,i)=>({tagName:i?'P':'H1',parentElement:null,textContent:id,getAttribute:(name:string)=>name==='data-cn-id'?id:null,getBoundingClientRect:()=>({left:0,top:10,width:100,height:20}),scrollIntoView(){},contains:(el:any)=>el===nodes[i]}));
 const parent={postMessage:(m:any)=>messages.push(m)};const document={createElement:box,documentElement:{append(){}},querySelectorAll:()=>nodes,querySelector:(selector:string)=>nodes.find(n=>selector.includes('"'+n.textContent+'"'))||null,addEventListener:(type:string,fn:(e:any)=>void)=>{listeners[type]=fn;}};
 const script=editorPreview('<body></body>','test').html.match(/<script>([\s\S]*)<\/script>/)![1];
 runInNewContext(script,{document,parent,window:{addEventListener:(type:string,fn:(e:any)=>void)=>{if(type==='message')receive=fn;}},CSS:{escape:(s:string)=>s},requestAnimationFrame:(f:()=>void)=>f()});
 const press=(key:string)=>listeners.keydown({key,shiftKey:false,preventDefault(){},target:{closest:()=>null}});
 press('ArrowDown');press('Enter');assert.equal(messages.filter(m=>m.type==='selection').length,0);
 receive({source:parent,data:{channel:'test',type:'mode',data:true}});press('ArrowDown');press('Enter');assert.equal(messages.at(-1).data[0].id,'h');
 press('ArrowDown');press('Enter');assert.equal(messages.at(-1).data[0].id,'p');press('ArrowUp');press('Enter');assert.equal(messages.at(-1).data[0].id,'h');
 press('Escape');assert.equal(messages.at(-1).data.length,0);
 let prevented=false;listeners.wheel({metaKey:false,ctrlKey:false,deltaY:-80,deltaMode:0,clientX:120,clientY:80,preventDefault(){prevented=true;},stopImmediatePropagation(){}});assert.equal(prevented,false);listeners.wheel({metaKey:true,ctrlKey:false,deltaY:-80,deltaMode:0,clientX:120,clientY:80,preventDefault(){prevented=true;},stopImmediatePropagation(){}});assert.equal(prevented,true);assert.equal(messages.at(-1).type,'zoomWheel');assert.equal(messages.at(-1).data.deltaY,-80);assert.equal(messages.at(-1).data.clientX,120);assert.equal(messages.at(-1).data.clientY,80);
});

test('フレーム内の右ドラッグは選択操作と分離し、解放・キャンセルで終了する',()=>{
 const messages:any[]=[],events:Record<string,((e:any)=>void)[]>={},windowEvents:Record<string,((e:any)=>void)[]>={};
 const add=(map:typeof events,type:string,fn:(e:any)=>void)=>(map[type]??=[]).push(fn);
 const style={cssText:'',getPropertyValue:()=>'',getPropertyPriority:()=>'',setProperty(){},removeProperty(){}};
 const box=()=>({style:{},append(){},setAttribute(){},attachShadow:()=>({replaceChildren(){},append(){}})});
 const document={createElement:box,documentElement:{append(){},style,setPointerCapture(){}},querySelectorAll:()=>[],addEventListener:(t:string,f:(e:any)=>void)=>add(events,t,f)};
 const parent={postMessage:(m:any)=>messages.push(m)};
 const script=editorPreview('<body></body>','pan-test').html.match(/<script>([\s\S]*)<\/script>/)![1];
 runInNewContext(script,{document,parent,window:{addEventListener:(t:string,f:(e:any)=>void)=>add(windowEvents,t,f)},CSS:{escape:(s:string)=>s},requestAnimationFrame:(f:()=>void)=>f()});
 const emit=(type:string,extra={})=>{let stopped=false;const e={button:2,buttons:2,pointerId:7,screenX:300,screenY:240,target:{closest:()=>null},preventDefault(){},stopImmediatePropagation(){stopped=true;},...extra};for(const f of events[type]||[]){f(e);if(stopped)break;}};
 emit('pointerdown',{button:0,buttons:1});assert.equal(messages.filter(m=>m.type==='pan').length,0);
 emit('pointerdown');emit('pointermove',{screenX:350,screenY:270});emit('pointerup',{buttons:0});emit('pointermove',{buttons:0});
 assert.deepEqual(messages.filter(m=>m.type==='pan').map(m=>m.data.phase),['start','move','end']);assert.equal(messages.find(m=>m.type==='pan'&&m.data.phase==='move').data.x,350);assert.equal(messages.filter(m=>m.type==='selection').length,0);
 emit('pointerdown');emit('pointercancel');assert.equal(messages.at(-1).data.phase,'end');
 emit('pointerdown');emit('pointermove',{buttons:0});assert.equal(messages.at(-1).data.phase,'end');
 emit('pointerdown');for(const f of windowEvents.blur)f({});assert.equal(messages.at(-1).data.phase,'end');
});
