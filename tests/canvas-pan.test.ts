import {test} from 'node:test';import assert from 'node:assert/strict';
import {panCanvases} from '../src/canvas-pan';
function pane(x=0,y=0){const wrap={style:{left:x+'px',top:y+'px'}};return {wrap,el:{querySelector:()=>wrap,get scrollLeft(){return 0;},set scrollLeft(_:number){},get scrollTop(){return 0;},set scrollTop(_:number){}} as unknown as HTMLElement};}
test('右ドラッグの移動量をそのまま反映する',()=>{const p=pane();panCanvases([p.el],48,-32);assert.equal(p.wrap.style.left,'48px');assert.equal(p.wrap.style.top,'-32px');panCanvases([p.el],-8,12);assert.equal(p.wrap.style.left,'40px');assert.equal(p.wrap.style.top,'-20px');});
test('同期時は両方を移動し、非同期時は指定した側だけを移動する',()=>{const a=pane(),b=pane(12,8);panCanvases([a.el,b.el],30,20);assert.equal(a.wrap.style.left,'30px');assert.equal(b.wrap.style.left,'42px');panCanvases([b.el],-10,5);assert.equal(a.wrap.style.left,'30px');assert.equal(b.wrap.style.left,'32px');assert.equal(b.wrap.style.top,'33px');});

test('比較の同期設定から移動対象を判定する',async()=>{const {panTargets}=await import('../src/canvas-pan');const a=pane().el,b=pane().el,group={dataset:{panSync:'true'},querySelectorAll:()=>[a,b]};const viewport={closest:()=>group} as unknown as HTMLElement;assert.deepEqual(panTargets(viewport),[a,b]);group.dataset.panSync='false';assert.deepEqual(panTargets(viewport),[viewport]);});
