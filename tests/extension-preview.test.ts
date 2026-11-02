import {test} from 'node:test';
import assert from 'node:assert/strict';
class Element{
 children:Element[]=[];textContent='';className='';hidden=false;disabled=false;clientWidth=320;style={cssText:''};listeners:Record<string,()=>Promise<void>>={};
 append(...items:Element[]){this.children.push(...items);}replaceChildren(){this.children=[];}setAttribute(){}addEventListener(name:string,fn:()=>Promise<void>){this.listeners[name]=fn;}
}
test('extension preview keeps capture on failure, retries in place and removes stale sessions',async()=>{
 const original=globalThis.document;
 // Small DOM adapter exercises request/session lifecycle, rather than browser capture APIs.
 globalThis.document={createElement:()=>new Element()} as any;
 try{
  // @ts-ignore JavaScript extension UI module
  const {createCapturePreview}=await import('../extension/preview.js');const box=new Element(),calls:string[]=[];let fail=true;
  const view=createCapturePreview(box,{endpoint:()=> 'http://127.0.0.1:4173',api:async(path:string,options:any)=>{calls.push(options.method+' '+path);if(options.method==='DELETE')return;if(fail)throw new Error('offline');return{id:'test',url:'/api/capture-previews/test',warnings:[]};}});
  const capture={viewport:{width:1280,height:900}};view.setCapture(capture);const [button,note,viewport]=box.children;
  await button.listeners.click();assert.match(note.textContent,/取得結果は保持/);assert.equal(button.disabled,false);
  fail=false;await button.listeners.click();assert.equal(viewport.hidden,false);assert.match(note.textContent,/未保存/);assert.equal(viewport.children.length,1);assert.equal(button.textContent,'プレビューを再表示');
  view.setCapture(capture);assert.equal(viewport.children.length,1);view.setCapture(null);assert.equal(viewport.hidden,true);assert.ok(calls.includes('DELETE /capture-previews/test'));assert.ok(!calls.some(c=>c.includes('/captures')));
 }finally{globalThis.document=original;}
});
