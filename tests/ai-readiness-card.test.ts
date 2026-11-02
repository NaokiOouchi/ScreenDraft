import {test} from 'node:test';import assert from 'node:assert/strict';import {createElement} from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {AiReadinessCard,type AiReadinessState} from '../src/AiReadiness';
test('editor shows readiness only when action or recovery is needed; help retains full status',()=>{
 const state:AiReadinessState={result:null,checking:true,error:'',check:async()=>{}};
 const render=(issuesOnly=true)=>renderToStaticMarkup(createElement(AiReadinessCard,{state,issuesOnly}));
 assert.equal(render(),'');state.checking=false;state.result={status:'ready',message:'準備確認済み',version:'1',checkedAt:'2026-10-27T00:00:00Z'};
 assert.equal(render(),'');assert.match(render(false),/Claude接続確認済み/);
 for(const status of ['not-installed','needs-login','unknown']){state.result.status=status;assert.match(render(),/再確認/);}state.result.status='not-installed';assert.match(render(),/code\.claude\.com\/docs\/ja\/setup/);assert.match(render(),/ターミナル/);assert.match(render(),/URLをコピー/);state.result.status='needs-login';assert.match(render(),/ログインを完了/);assert.match(render(),/code\.claude\.com/);
 state.result.status='ready';state.error='接続を確認してください。';assert.match(render(),/接続を確認してください/);
});
