import {test} from 'node:test';import assert from 'node:assert/strict';
// @ts-ignore
import {tourPosition,shouldAutoStartTour} from '../shared/tour.js';
test('tour starts only before completion or skip, including when storage is unavailable',()=>{assert.equal(shouldAutoStartTour(null),true);assert.equal(shouldAutoStartTour('skipped'),false);assert.equal(shouldAutoStartTour('completed'),false);});
test('tour card stays inside the viewport even when target is near its edge',()=>{
 for(const r of [{left:1100,top:780,right:1270,bottom:880},{left:0,top:0,right:1250,bottom:800},null]){const p=tourPosition(r,{width:1280,height:900},{width:360,height:300});assert.ok(p.left>=16&&p.left+360<=1264);assert.ok(p.top>=16&&p.top+300<=884);}
});
