import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {GuidedTour,TOUR_STEPS} from '../src/GuidedTour';

test('初回案内はサンプルの選択から始まり、保存後に画面操作を案内する',()=>{
 const props={step:0,setStep:()=>{},onFinish:()=>{},onStartSample:()=>{}};
 const welcome=renderToStaticMarkup(createElement(GuidedTour,props));
 assert.match(welcome,/ScreenDraftへようこそ/);
 assert.match(welcome,/サンプルを選ぶ/);
 assert.doesNotMatch(welcome,/この操作は画面を取り込んだ後/);
 assert.equal(TOUR_STEPS[1].target,'screens');
 assert.equal(TOUR_STEPS.at(-1)?.target,'compare');
});
