import {test} from 'node:test';import assert from 'node:assert/strict';
import {wheelZoom,clampZoom} from '../src/canvas-zoom';
test('CmdまたはCtrl付きスクロールだけで倍率を変更する',()=>{assert.equal(wheelZoom(.8,{deltaY:-100,metaKey:false,ctrlKey:false}),null);assert.ok(wheelZoom(.8,{deltaY:-100,metaKey:true,ctrlKey:false})!>.8);assert.ok(wheelZoom(.8,{deltaY:100,metaKey:false,ctrlKey:true})!<.8);});
test('倍率の上限・下限とホイールの単位を扱う',()=>{assert.equal(clampZoom(9),1.5);assert.equal(clampZoom(.01),.1);assert.equal(wheelZoom(.8,{deltaY:-1,deltaMode:1,metaKey:true}),wheelZoom(.8,{deltaY:-16,metaKey:true}));assert.equal(wheelZoom(.8,{deltaY:NaN,metaKey:true}),null);});

test('倍率変更前後のキャンバス位置からカーソル位置の補正量を計算する',async()=>{
 const {zoomScrollDelta}=await import('../src/canvas-zoom');
 assert.equal(zoomScrollDelta(400,100,60,.5,1),260);
 assert.equal(zoomScrollDelta(400,100,200,1,.5),-50);
 assert.equal(zoomScrollDelta(240,40,40,.8,.8),0);
});

test('スクロール端でも表示位置を補正し、連続ズームで同じ要素を維持する',async()=>{
 const {anchorZoom}=await import('../src/canvas-zoom');
 let scale=.5;
 const wrap={style:{left:'',top:''},getBoundingClientRect:()=>({left:100+(parseFloat(wrap.style.left)||0),top:80+(parseFloat(wrap.style.top)||0)})};
 const pane={classList:{contains:()=>false},querySelector:()=>wrap,getBoundingClientRect:()=>({left:0,top:0}),get scrollLeft(){return 0;},set scrollLeft(_:number){},get scrollTop(){return 0;},set scrollTop(_:number){}};
 const point={x:300,y:200},local={x:400,y:240};
 for(const next of [1,.7,1.2,.5]){anchorZoom(pane as unknown as HTMLElement,point,scale,next,()=>{scale=next;});const rect=wrap.getBoundingClientRect();assert.ok(Math.abs(rect.left+local.x*scale-point.x)<.001);assert.ok(Math.abs(rect.top+local.y*scale-point.y)<.001);}
});
