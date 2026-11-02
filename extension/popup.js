import {captureSavePayload} from '../shared/import-target.js';
import {createCapturePreview} from './preview.js';
import {documentLinks,collectLinkCandidates} from './batch-import.js';
import {captureDocument,collectResources,cssResourceUrls} from './capture.js';
const $=id=>document.getElementById(id);
let capture,saveId=crypto.randomUUID(),connected=false,screens=[],loadedProposal='',autoDisplay=false;
async function loadTargets(){const id=$('proposal').value;if(!id)return;const health=await api('/health');autoDisplay=!!health.features?.importSync;screens=health.features?.screenReimport?(await api('/proposals/'+id)).screens:[];loadedProposal=id;$('save-target').replaceChildren(new Option('別の画面として追加',''),...screens.map(s=>new Option('既存画面を更新：'+s.title,s.id)));$('target-note').textContent=health.features?.screenReimport?'新しい画面として追加します。':'接続先は追加のみ対応しています。既存画面の更新にはアプリを最新版にしてください。';}
const message=text=>{$('status').textContent=text;};
const busy=value=>document.querySelectorAll('button,select').forEach(b=>b.disabled=value);
const endpoint=()=>{const u=new URL($('endpoint').value);if(!['127.0.0.1','localhost'].includes(u.hostname)||u.protocol!=='http:')throw new Error('接続先にはローカルアプリのHTTP URLを指定してください。');return u.origin;};
async function api(path,options={}){const response=await fetch(endpoint()+'/api'+path,{...options,headers:{'Content-Type':'application/json','Authorization':'Bearer '+$('key').value,...options.headers},signal:AbortSignal.timeout(30000)});const data=await response.json();if(!response.ok)throw new Error(data.error||'接続できませんでした。');return data;}
async function run(work){busy(true);try{await work();}catch(e){message(e.message);}finally{busy(false);}}
const preview=createCapturePreview($('capture-preview'),{api,endpoint});
const settings=await chrome.storage.local.get(['endpoint','key']);if(settings.endpoint)$('endpoint').value=settings.endpoint;if(settings.key)$('key').value=settings.key;
$('connect').onclick=()=>run(async()=>{const proposals=await api('/proposals');$('proposal').replaceChildren(...proposals.map(p=>new Option(p.title,p.id)));$('connected').hidden=false;connected=true;await loadTargets();await chrome.storage.local.set({endpoint:endpoint(),key:$('key').value});message(proposals.length?'接続しました。取り込み先を選んでください。':'アプリでドラフトを作成した後に再接続してください。');});
$('capture').onclick=()=>run(async()=>{if(!connected||!$('proposal').value)throw new Error('取り込み先のドラフトを選んでください。');await loadTargets();message('DOM・CSS・画像を取得しています。このままお待ちください。');const [tab]=await chrome.tabs.query({active:true,currentWindow:true});if(!tab?.id||!/^https?:/.test(tab.url||''))throw new Error('HTTPまたはHTTPSのページで実行してください。');const [result]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:captureDocument});capture=await collectResources(result.result,async url=>fetch(url,{credentials:'include',signal:AbortSignal.timeout(10000)}));saveId=crypto.randomUUID();$('save-target').value='';$('title').value=capture.title;$('summary').textContent=`${capture.viewport.width} × ${capture.viewport.height} / ${capture.resources.length}件のリソース`;$('warnings').textContent=capture.warnings.length?`確認事項 ${capture.warnings.length}件\n`+capture.warnings.join('\n').replaceAll('資産','リソース'):'';$('grant').hidden=!capture.warnings.some(w=>w.startsWith('資産を取得できませんでした:'));$('review').hidden=false;preview.setCapture(capture);message('取得できました。まだ保存されていません。内容の確認後に「この画面を保存」を押してください。');});
$('save').onclick=()=>run(async()=>{if(!capture)return;capture.title=$('title').value.trim();if(!capture.title)throw new Error('画面名を入力してください。');await api('/proposals/'+$('proposal').value+'/captures',{method:'POST',headers:{'Idempotency-Key':saveId},body:JSON.stringify(captureSavePayload(capture,screens.find(s=>s.id===$('save-target').value)))});message(autoDisplay?'保存しました。アプリに自動表示されます。':'保存しました。アプリを再読み込みすると確認できます。');$('review').hidden=true;capture=null;preview.setCapture(null);});
$('export').onclick=()=>{if(!capture)return;capture.title=$('title').value.trim()||capture.title;const url=URL.createObjectURL(new Blob([JSON.stringify(capture)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='screendraft-capture.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};

$('grant').onclick=()=>{
 if(!capture)return;
 const urls=[...capture.resourceUrls,...capture.stylesheets.flatMap(s=>s.css===null?[s.url]:cssResourceUrls(s.css,s.url))];
 const origins=[...new Set(urls.filter(u=>/^https?:/.test(u)).map(u=>new URL(u).origin+'/*'))];
 if(!origins.length){message('追加のリソースURLはありません。取得結果を確認してください。');return;}
 chrome.permissions.request({origins}).then(granted=>{if(granted)$('capture').click();else message('許可されませんでした。不足を含めて保存するか、取り込みをやり直してください。');}).catch(e=>message(e.message));
};

$('batch').onclick=()=>run(async()=>{
 if(!connected||!$('proposal').value)throw new Error('先にアプリへ接続してください。接続後に取り込み先を選択してください。');
 const [tab]=await chrome.tabs.query({active:true,currentWindow:true});if(!tab?.id||!/^https?:/.test(tab.url||''))throw new Error('HTTPまたはHTTPSの画面で実行してください。');
 const [result]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:documentLinks});
 const launch=collectLinkCandidates(result.result),id=crypto.randomUUID();launch.proposalId=$('proposal').value;
 await chrome.storage.session.set({['batch-launch:'+id]:launch});await chrome.tabs.create({url:chrome.runtime.getURL('batch.html?launch='+id)});message('専用タブを開きました。そちらで画面を選択してください。');
});

$('proposal').onchange=()=>run(async()=>{capture=null;$('review').hidden=true;preview.setCapture(null);await loadTargets();});
$('save-target').onchange=()=>{const screen=screens.find(s=>s.id===$('save-target').value);if(screen)$('title').value=screen.title;$('target-note').textContent=screen?'選択した画面を更新します。更新前の内容は履歴に残ります。':'新しい画面として追加します。';};
$('title').addEventListener('input',()=>{saveId=crypto.randomUUID();});$('save-target').addEventListener('change',()=>{saveId=crypto.randomUUID();});
