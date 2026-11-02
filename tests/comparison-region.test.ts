import {test} from 'node:test';import assert from 'node:assert/strict';
import {comparisonRegion,regionScale} from '../src/comparison-region.js';
test('region keeps valid viewport bounds and rejects absent, hidden, non-finite or stale dimensions',()=>{
 assert.deepEqual(comparisonRegion({x:10,y:20,width:500,height:300},1280,900),{x:10,y:20,width:500,height:300});
 for(const rect of [null,{x:0,y:0,width:0,height:2},{x:NaN,y:0,width:5,height:5},{x:1200,y:0,width:100,height:20}])assert.equal(comparisonRegion(rect,1280,900),null);
});
test('both sides use the larger region width and leave space for borders',()=>{assert.equal(regionScale(400,{width:600},{width:800}),.8);assert.equal(regionScale(1000,{width:500},{width:400}),1);});
import {runInNewContext} from 'node:vm';import {editorPreview} from '../server/preview.js';
test('frame measurement is channel-bound, uses all selected nodes and reports missing IDs',()=>{
 const messages:any[]=[];let listener:(event:any)=>void=()=>{};let scrolled=0;
 const element=(left:number,top:number,width:number,height:number)=>({scrollIntoView:()=>scrolled++,getBoundingClientRect:()=>({left,top,right:left+width,bottom:top+height,width,height})});
 const nodes:Record<string,unknown>={a:element(20,40,200,100),b:element(300,60,100,80)};
 const parent={postMessage:(message:unknown)=>messages.push(message)};
 const document={createElement:()=>({setAttribute(){},style:{},attachShadow:()=>({replaceChildren(){}})}),documentElement:{append(){}},addEventListener(){},querySelector:(selector:string)=>nodes[selector.match(/"(.*)"/)?.[1]||'']||null};
 const window={addEventListener:(type:string,fn:typeof listener)=>{if(type==='message')listener=fn;}};
 const script=editorPreview('<body></body>','test').html.match(/<script>([\s\S]*)<\/script>/)![1];
 runInNewContext(script,{document,window,parent,CSS:{escape:(s:string)=>s},innerWidth:1280,innerHeight:900,requestAnimationFrame:(fn:()=>void)=>fn()});
 listener({source:parent,data:{channel:'wrong',type:'measureRegion',data:{ids:['a'],token:'wrong'}}});assert.equal(scrolled,0);
 listener({source:parent,data:{channel:'test',type:'measureRegion',data:{ids:['a','b'],token:'both'}}});
 assert.deepEqual(JSON.parse(JSON.stringify(messages.at(-1).data)),{token:'both',rect:{x:12,y:32,width:396,height:116}});
 listener({source:parent,data:{channel:'test',type:'measureRegion',data:{ids:['missing'],token:'gone'}}});assert.equal(messages.at(-1).data.rect,null);
});
