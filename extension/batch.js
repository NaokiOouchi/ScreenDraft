import {captureSavePayload,assertUniqueUpdateTargets} from '../shared/import-target.js';
import {createCapturePreview} from './preview.js';
import {batchSaveState} from '../shared/import-ux.js';
import {collectResources,missingAssetOrigins} from '../shared/capture.js';
import {BatchImport} from '../shared/batch-import.js';
import {createChromeBatchAdapter} from './chrome-batch.js';
const $=id=>document.getElementById(id);
async function loadTargetScreens(){const health=await api('/health');return health.features?.screenReimport?(await api('/proposals/'+$('proposal').value)).screens:[];}
const statuses={pending:'未取得',acquiring:'取得中',ready:'取得済み・未保存',failed:'取得失敗',saving:'保存中',saved:'保存済み','save-failed':'保存失敗・再試行できます'};
let queue,launch,settings,targetProposal='',permissionPending=false,availableScreens=[];const selected=new Set(),rows=new Map();
const error=message=>{$('error').textContent=message;$('error').hidden=!message;};
const status=message=>{$('status').textContent=message;};
function endpoint(){const u=new URL(settings.endpoint||'http://127.0.0.1:4173');if(u.protocol!=='http:'||!['127.0.0.1','localhost'].includes(u.hostname))throw new Error('アプリの接続先を確認してください。');return u.origin;}
async function api(path,options={}){const response=await fetch(endpoint()+'/api'+path,{...options,headers:{'Content-Type':'application/json','Authorization':'Bearer '+settings.key,...options.headers},signal:AbortSignal.timeout(30000)});const data=await response.json();if(!response.ok)throw new Error(data.error||'アプリへ接続できませんでした。');return data;}
function render(){
 if(!queue)return;for(const item of queue.items)if(item.status==='saved')selected.delete(item.id);const busy=queue.busy||permissionPending,anyWork=queue.items.some(item=>!['pending','failed'].includes(item.status));
 $('proposal').disabled=busy||anyWork;$('selection-count').textContent=selected.size+' / 10画面を選択';
 const needAcquire=queue.items.some(item=>selected.has(item.id)&&['pending','failed'].includes(item.status));
 $('acquire').disabled=busy||!selected.size||!needAcquire||!$('proposal').value;$('acquire').textContent=queue.items.some(item=>selected.has(item.id)&&item.status==='failed')?'未取得・失敗した画面を取得':'選択した画面を取得';
 $('cancel').hidden=!queue.busy;$('cancel').textContent=queue.mode==='save'?'この保存の完了後に中止':'中止する';
 const view=batchSaveState(queue.items,[...selected],$('confirm').checked);
 $('save-summary').hidden=!view.saved;
 $('save-summary-title').textContent=view.complete?'✓ '+view.saved+'画面の保存が完了しました':view.saved+'画面を保存済み・未完了の画面があります';
 $('save-destination').textContent='保存先：'+$('proposal').selectedOptions[0]?.textContent;
 const appUrl=new URL(endpoint());appUrl.searchParams.set('proposal',targetProposal||$('proposal').value);$('saved-app-link').href=appUrl.href;
 $('save-controls').hidden=view.complete;
 $('selection-count').textContent=view.complete?'保存済み '+view.saved+'画面 · 追加する画面を選べます':selected.size+' / 10画面を選択';
 const saveItems=queue.items.filter(item=>selected.has(item.id)&&['ready','save-failed'].includes(item.status));
 const retryable=queue.items.filter(item=>item.status==='ready'&&item.capture);
 const origins=missingAssetOrigins(retryable.map(item=>item.capture));
 $('grant').hidden=!origins.length;$('grant').disabled=busy;$('grant-hint').textContent=origins.length?'追加取得するサイト: '+origins.map(url=>new URL(url).hostname).join('、'):'';
 $('save').disabled=busy||!saveItems.length||!$('confirm').checked;$('confirm').disabled=busy||!saveItems.length;
 $('save').textContent=saveItems.length?saveItems.length+'画面を保存':'画面を保存';$('save-hint').textContent=view.complete?'保存済みの画面は選び直す必要はありません。別の画面を追加する場合は上の候補から選んでください。':view.hint;
 for(const item of queue.items){const row=rows.get(item.id);row.box.classList.toggle('selected',selected.has(item.id));row.box.dataset.state=item.status;row.check.hidden=item.status==='saved';row.check.checked=selected.has(item.id);row.savedMark.hidden=item.status!=='saved';row.savedName.hidden=item.status!=='saved';row.savedName.textContent='画面名：'+item.title;row.nameLabel.hidden=item.status==='saved';row.title.textContent=item.title;row.check.disabled=busy||item.status==='saved'||(!selected.has(item.id)&&selected.size>=10);row.status.textContent=statuses[item.status];row.error.textContent=item.error;row.result.hidden=!item.capture&&!item.saved;
  if(document.activeElement!==row.name)row.name.value=item.title;row.name.disabled=busy||item.status!=='ready';row.target.disabled=busy||item.status!=='ready';row.targetLabel.hidden=item.status==='saved';
  row.visualPreview.setCapture(item.capture||null);
  if(item.capture){row.meta.textContent=item.capture.viewport.width+' × '+item.capture.viewport.height+' / '+item.capture.resources.length+'件のリソース';row.warnings.textContent=(item.capture.warnings||[]).join('\n').replaceAll('資産','リソース');row.preview.textContent=item.capture.textPreview||'元画面の表示内容も確認してください。';}
  else if(item.saved){row.meta.textContent='保存したリソース '+item.saved.assetCount+'件';row.warnings.textContent=(item.saved.warnings||[]).join('\n').replaceAll('資産','リソース');row.details.hidden=true;}
 }
}
function createRow(item){
 const box=document.createElement('article');box.className='candidate';
 const head=document.createElement('div');head.className='row-head';const label=document.createElement('label');const check=document.createElement('input');check.type='checkbox';const title=document.createElement('span');title.textContent=item.title;const savedMark=document.createElement('span');savedMark.textContent='✓';savedMark.className='saved-mark';savedMark.hidden=true;label.append(check,savedMark,title);const state=document.createElement('span');state.className='row-status';head.append(label,state);
 const url=document.createElement('p');url.className='url';url.textContent=item.url;const tools=document.createElement('div');tools.className='row-tools';const link=document.createElement('a');link.href=item.url;link.target='_blank';link.rel='noopener noreferrer';link.textContent='元画面を確認 ↗';tools.append(link);
 const failure=document.createElement('p');failure.className='row-error';failure.setAttribute('role','status');
 const result=document.createElement('div');result.className='result';const nameLabel=document.createElement('label');nameLabel.textContent='保存する画面名';const name=document.createElement('input');name.type='text';name.maxLength=300;nameLabel.append(name);const meta=document.createElement('p');meta.className='meta';const warnings=document.createElement('p');warnings.className='warnings';const details=document.createElement('details');const summary=document.createElement('summary');summary.textContent='取得した表示テキストを確認（先頭3000文字）';const preview=document.createElement('pre');details.append(summary,preview);const previewContainer=document.createElement('div');const visualPreview=createCapturePreview(previewContainer,{api,endpoint});const savedName=document.createElement('p');savedName.className='saved-name';savedName.hidden=true;const targetLabel=document.createElement('label');targetLabel.textContent='保存方法';const target=document.createElement('select');target.replaceChildren(new Option('別の画面として追加',''),...availableScreens.map(s=>new Option('既存画面を更新：'+s.title,s.id)));targetLabel.append(target);target.addEventListener('change',()=>{item.updateTarget=availableScreens.find(s=>s.id===target.value)||null;if(item.updateTarget)item.title=item.updateTarget.title;$('confirm').checked=false;render();});result.append(targetLabel,nameLabel,savedName,meta,warnings,previewContainer,details);box.append(head,url,tools,failure,result);$('candidates').append(box);
 check.addEventListener('change',()=>{if(check.checked){if(selected.size>=10){check.checked=false;return;}selected.add(item.id);}else selected.delete(item.id);$('confirm').checked=false;render();});
 name.addEventListener('input',()=>{item.titleEdited=true;item.title=name.value;if(item.capture)item.capture.title=name.value;$('confirm').checked=false;render();});
 rows.set(item.id,{target,targetLabel,box,check,savedMark,savedName,nameLabel,title,name,status:state,error:failure,result,meta,warnings,preview,details,visualPreview});
}
$('grant').addEventListener('click',()=>{
 if(queue.busy||permissionPending)return;
 const items=queue.items.filter(item=>item.status==='ready'&&item.capture);
 const origins=missingAssetOrigins(items.map(item=>item.capture));if(!origins.length)return;
 permissionPending=true;$('confirm').checked=false;error('');render();
 chrome.permissions.request({origins}).then(async granted=>{
  if(!granted){error('アクセスが許可されませんでした。取得結果は保持しています。');return;}
  status('不足しているフォント・画像を再取得しています。');
  for(const item of items)item.capture=await collectResources(item.capture,url=>fetch(url,{credentials:'include',signal:AbortSignal.timeout(10000)}));
  status('リソースの再取得が完了しました。警告の内容を確認した後に保存してください。追加のサイトが見つかった場合は、もう一度アクセスを許可できます。');
 }).catch(e=>error(e.message)).finally(()=>{permissionPending=false;render();});
});
$('confirm').addEventListener('change',render);
$('proposal').addEventListener('change',async()=>{$('confirm').checked=false;permissionPending=true;render();try{availableScreens=await loadTargetScreens();for(const item of queue.items){item.updateTarget=null;const row=rows.get(item.id);row.target.replaceChildren(new Option('別の画面として追加',''),...availableScreens.map(s=>new Option('既存画面を更新：'+s.title,s.id)));}}catch(e){error(e.message);}finally{permissionPending=false;render();}});
$('cancel').addEventListener('click',()=>{queue.cancel();status(queue.mode==='save'?'現在の画面の保存が完了した後に処理を中止します。':'取得を中止しました。完了した取得結果は残ります。');});
$('acquire').addEventListener('click',()=>{
 if(queue.busy||permissionPending)return;error('');$('confirm').checked=false;permissionPending=true;render();
 // Chrome match patterns cover a host's ports; the adapter separately enforces exact origin.
 const u=new URL(launch.origin),pattern=u.protocol+'//'+u.hostname+'/*';
 chrome.permissions.request({origins:[pattern]}).then(async granted=>{
  permissionPending=false;if(!granted){error('このサイトへのアクセスが許可されませんでした。取得は開始していません。');render();return;}
  targetProposal=$('proposal').value;status('選択した画面を順番に取得しています。');await queue.acquire([...selected]);
  status(queue.stopped?'取得を中止しました。完了した結果は確認・保存できます。':'取得処理が完了しました。各画面の内容を確認した後に保存してください。');
 }).catch(e=>{permissionPending=false;error(e.message);render();});
});
$('save').addEventListener('click',async()=>{if(queue.busy||!$('confirm').checked)return;error('');if(queue.items.some(item=>selected.has(item.id)&&['ready','save-failed'].includes(item.status)&&!item.title.trim())){error('保存する画面名を入力してください。');return;}
 status('画面とリソースを保存しています。');try{assertUniqueUpdateTargets(queue.items.filter(item=>item.status==='saved'||selected.has(item.id)&&['ready','save-failed'].includes(item.status)));await queue.saveReady([...selected]);$('confirm').checked=false;status(queue.items.some(item=>item.status==='save-failed')?'保存できなかった画面があります。内容の確認後に再試行できます。':'保存が完了しました。保存先と件数を下の完了表示で確認できます。');}catch(e){error(e.message);}render();if(queue.items.some(item=>item.status==='saved'))$('save-summary').scrollIntoView({behavior:'smooth',block:'center'});});
window.addEventListener('beforeunload',event=>{if(permissionPending||queue?.busy||queue?.items.some(item=>['ready','save-failed'].includes(item.status))){event.preventDefault();event.returnValue='';}});
try{
 const launchId=new URL(location.href).searchParams.get('launch');if(!launchId||!/^[a-f0-9-]{36}$/.test(launchId))throw new Error('拡張の「画面候補を探す」から開いてください。');
 const key='batch-launch:'+launchId;const stored=await chrome.storage.session.get(key);launch=stored[key];if(!launch)throw new Error('候補情報がありません。元画面で拡張を開き直してください。');await chrome.storage.session.remove(key);
 settings=await chrome.storage.local.get(['endpoint','key']);if(!settings.key)throw new Error('先に拡張のポップアップからアプリへ接続してください。');
 const proposals=await api('/proposals');if(!proposals.length)throw new Error('アプリでドラフトを作成してから開き直してください。');$('proposal').replaceChildren(...proposals.map(p=>new Option(p.title,p.id)));if(proposals.some(p=>p.id===launch.proposalId))$('proposal').value=launch.proposalId;
 $('app-link').href=endpoint();$('app-link').hidden=false;$('origin').textContent=launch.origin;$('limits').textContent=launch.candidates.length+'件の候補 / 最大10画面を選択。同じURL・ページ内リンクをまとめ、対象外リンクを除外しました。'+(launch.truncated?'候補は先頭50件までです。':'');
 availableScreens=await loadTargetScreens();
 const adapter=createChromeBatchAdapter(chrome,{origin:launch.origin});queue=new BatchImport(launch.candidates,{capture:adapter.capture,save:item=>api('/proposals/'+targetProposal+'/captures',{method:'POST',headers:{'Idempotency-Key':item.importId},body:JSON.stringify(captureSavePayload({...item.capture,title:item.title.trim()},item.updateTarget))}),onChange:render});
 queue.items.forEach(createRow);$('workspace').hidden=false;status('対象のURLを確認し、必要な画面を選択してください。');render();
}catch(e){status('');error(e.message);}
