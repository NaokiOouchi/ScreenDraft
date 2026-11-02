import {captureDocument,collectResources} from '../shared/capture.js';
import {candidateUrl} from '../shared/batch-import.js';
/** Runs inside the temporary source tab. Observe rendering without modifying the page. */
export async function waitForRendered(expectedOrigin) {
  if(location.origin!==expectedOrigin)throw new Error('別のサイトへ移動したため取得しませんでした。');
  await Promise.race([Promise.allSettled([document.fonts?.ready,...Array.from(document.images).filter(image=>!image.complete).slice(0,100).map(image=>new Promise(resolve=>{const done=()=>{image.removeEventListener('load',done);image.removeEventListener('error',done);resolve();};image.addEventListener('load',done,{once:true});image.addEventListener('error',done,{once:true});setTimeout(done,2500);}))]),new Promise(resolve=>setTimeout(resolve,3000))]);
  await new Promise(resolve=>{
    let idle;const finish=()=>{clearTimeout(idle);clearTimeout(limit);observer.disconnect();resolve();};
    const observer=new MutationObserver(()=>{clearTimeout(idle);idle=setTimeout(finish,500);});
    const limit=setTimeout(finish,3000);observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true});idle=setTimeout(finish,500);
  });
  return {origin:location.origin,hasCanvas:!!document.querySelector('canvas')};
}
export async function waitForCanvasPaint() {
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  await new Promise(resolve=>setTimeout(resolve,1200));
  return {origin:location.origin};
}
function abortable(promise,signal) {
  if(signal.aborted)return Promise.reject(signal.reason);
  return new Promise((resolve,reject)=>{const abort=()=>reject(signal.reason);signal.addEventListener('abort',abort,{once:true});promise.then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));});
}
export function createChromeBatchAdapter(api,{origin,collect=collectResources,timeoutMs=45000,pollMs=150}) {
  const validate=(url)=>{if(!url||new URL(url).origin!==origin)throw new Error('別のサイトへ移動したため取得しませんでした。');};
  return {async capture(url,signal) {
    if(!candidateUrl(url,origin+'/'))throw new Error('対象外のURLです。');signal.throwIfAborted();
    const bounded=AbortSignal.any([signal,AbortSignal.timeout(timeoutMs)]);let tab,previousTab;
    try {
      tab=await api.tabs.create({url,active:false});if(!tab?.id)throw new Error('取得用のタブを開けませんでした。');
      while(true){bounded.throwIfAborted();const current=await abortable(api.tabs.get(tab.id),bounded);if(current.status==='complete'){validate(current.url);break;}await abortable(new Promise(resolve=>setTimeout(resolve,pollMs)),bounded);}
      const current=await api.tabs.get(tab.id);
      if(/\/(?:login|signin|sign-in)(?:\/|$)/i.test(new URL(current.url).pathname)&&new URL(current.url).pathname!==new URL(url).pathname)throw new Error('ログイン画面へ移動しました。元のサイトでログインして再取得してください。');
      const [ready]=await abortable(api.scripting.executeScript({target:{tabId:tab.id},func:waitForRendered,args:[origin]}),bounded);validate(ready?.result?.origin);
      if(ready?.result?.hasCanvas){
        const [active]=await api.tabs.query({active:true,windowId:tab.windowId});previousTab=active?.id;
        await abortable(api.tabs.update(tab.id,{active:true}),bounded);
        const [painted]=await abortable(api.scripting.executeScript({target:{tabId:tab.id},func:waitForCanvasPaint}),bounded);validate(painted?.result?.origin);
      }
      const [result]=await abortable(api.scripting.executeScript({target:{tabId:tab.id},func:captureDocument}),bounded);if(!result?.result)throw new Error('画面を取得できませんでした。');validate(result.result.sourceUrl);
      const capture=await abortable(collect(result.result,assetUrl=>fetch(assetUrl,{credentials:'include',signal:AbortSignal.any([bounded,AbortSignal.timeout(10000)])})),bounded);
      validate((await api.tabs.get(tab.id)).url);bounded.throwIfAborted();return capture;
    } catch(error) {if(bounded.aborted&&!signal.aborted)throw new Error('画面の取得に時間がかかりすぎました。再取得してください。');throw error;}
    finally {
      if(previousTab&&tab?.id){
        const [active]=await api.tabs.query({active:true,windowId:tab.windowId}).catch(()=>[]);
        if(active?.id===tab.id)await api.tabs.update(previousTab,{active:true}).catch(()=>{});
      }
      if(tab?.id)await api.tabs.remove(tab.id).catch(()=>{});
    }
  }};
}
