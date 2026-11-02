import {useEffect,useRef,useState} from 'react';
import type {Capture} from '../shared/types';
export function CaptureReviewPreview({capture}:{capture:Capture}){
 const [preview,setPreview]=useState<{url:string;warnings:string[]}|null>(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0),[width,setWidth]=useState(600),[loaded,setLoaded]=useState(false);
 const container=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(!container.current)return;const observer=new ResizeObserver(entries=>setWidth(entries[0].contentRect.width));observer.observe(container.current);return()=>observer.disconnect();},[]);
 useEffect(()=>{
  let disposed=false,id='';setPreview(null);setError('');setLoaded(false);
  const remove=()=>{if(id)void fetch('/api/capture-previews/'+id,{method:'DELETE'}).catch(()=>{});};
  void fetch('/api/capture-previews',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(capture)}).then(async response=>{const value=await response.json();if(!response.ok)throw new Error(value.error||'プレビューを作成できませんでした。');id=value.id;if(disposed)remove();else setPreview(value);}).catch(e=>{if(!disposed)setError(e.message);});
  return()=>{disposed=true;remove();};
 },[capture.html,capture.stylesheets,capture.resources,capture.viewport,attempt]);
 const scale=Math.min(1,width/capture.viewport.width);
 return <section className="capture-review-preview"><div className="preview-caption"><strong>保存前のプレビュー</strong><span>未保存・操作は再現しません</span></div><div ref={container} className="capture-review-viewport">{preview&&<div style={{width:capture.viewport.width*scale,height:capture.viewport.height*scale,overflow:'hidden'}}><iframe title="保存前の画面プレビュー" src={preview.url} sandbox="" onLoad={()=>setLoaded(true)} style={{width:capture.viewport.width,height:capture.viewport.height,transform:`scale(${scale})`,transformOrigin:'top left',border:0}}/></div>}{!error&&(!preview||!loaded)&&<p role="status">プレビューを読み込んでいます…</p>}{error&&<p role="alert">{error}</p>}</div><div className="preview-caption"><small>5分で期限切れになります。表示が消えたら再表示してください。</small><button className="text-button" onClick={()=>setAttempt(n=>n+1)}>再表示</button></div>{!!preview?.warnings.length&&<details><summary>表示の確認事項（{preview.warnings.length}件）</summary><ul>{preview.warnings.map((w,i)=><li key={i}>{w}</li>)}</ul></details>}</section>;
}
