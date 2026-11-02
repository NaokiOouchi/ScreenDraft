import {test} from 'node:test';
import assert from 'node:assert/strict';
// @ts-ignore
import {captureDocument,collectResources} from '../shared/capture.js';
// Minimal DOM boundary: capture still runs its real serializer and resource collector.
function canvasDoc(fail=false):any{
 const canvas:any={nodeType:1,localName:'canvas',attributes:[{name:'id',value:'chart'},{name:'class',value:'chart'}],childNodes:[],width:400,height:200,toDataURL:()=>{if(fail)throw new Error('tainted');return 'data:image/png;base64,iVBORw0KGgo=';}};
 const root:any={nodeType:1,localName:'html',attributes:[],childNodes:[canvas]};
 return {defaultView:{innerWidth:1280,innerHeight:873,getComputedStyle:()=>({width:'200px',height:'100px',display:'block'})},URL:'https://app.test/',baseURI:'https://app.test/',title:'Chart',styleSheets:[],documentElement:root,body:{innerText:''}};
}
test('canvas pixels are captured as an image with original identity and CSS dimensions',()=>{
 const result=captureDocument(canvasDoc());assert.match(result.html,/<img/);assert.match(result.html,/data:image\/png;base64/);assert.match(result.html,/id="chart"/);assert.match(result.html,/class="chart"/);assert.match(result.html,/width:200px/);assert.match(result.html,/height:100px/);assert.doesNotMatch(result.html,/<canvas/);assert.ok(result.warnings.some((w:string)=>w.includes('画像として保存')));
});
test('unreadable canvas does not fail the whole screen and warns',()=>{const result=captureDocument(canvasDoc(true));assert.match(result.html,/<canvas/);assert.ok(result.warnings.some((w:string)=>w.includes('画像化できません')));});
test('resource retry retains downloaded assets and clears only recovered failures',async()=>{
 const url='https://cdn.test/font.css',image='https://app.test/image.png';
 const result=await collectResources({resourceUrls:[url,image],stylesheets:[],resources:[{url:image,mime:'image/png',base64:'AA=='}],warnings:['Canvasを画像として保存しました。','資産を取得できませんでした: '+url]},async(u)=>{assert.equal(u,url);return new Response('body{}',{headers:{'content-type':'text/css'}});});
 assert.equal(result.resources.length,2);assert.deepEqual(result.warnings,['Canvasを画像として保存しました。']);
});
test('missing asset permissions include only unfetched HTTP hosts including nested font URLs',async()=>{
 const {missingAssetOrigins}=await import('../shared/capture.js');
 assert.deepEqual(missingAssetOrigins([{resourceUrls:['https://cdn.test/font.woff2','https://site.test/logo.png'],resources:[{url:'https://site.test/logo.png'}],stylesheets:[{url:'https://css.test/a.css',css:null}]}]),['https://cdn.test/*','https://css.test/*']);
});
