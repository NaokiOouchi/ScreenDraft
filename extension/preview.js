/** Show the server-sanitized preview in place, keeping unsaved captures in this page. */
export function createCapturePreview(container,{api,endpoint}){
 const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent='保存前プレビュー';
 const note=document.createElement('p');note.className='preview-note';note.setAttribute('role','status');
 const viewport=document.createElement('div');viewport.className='capture-preview-viewport';viewport.hidden=true;
 container.append(button,note,viewport);
 let capture=null,session='',generation=0,working=false;
 const remove=id=>{if(id)void api('/capture-previews/'+id,{method:'DELETE'}).catch(()=>{});};
 const clear=()=>{generation++;remove(session);session='';viewport.replaceChildren();viewport.hidden=true;note.textContent='';button.textContent='保存前プレビュー';};
 button.addEventListener('click',async()=>{
  if(!capture||working)return;clear();const request=generation;working=true;button.disabled=true;note.textContent='プレビューを準備しています…';
  try{
   const result=await api('/capture-previews',{method:'POST',body:JSON.stringify(capture)});
   if(request!==generation){remove(result.id);return;}session=result.id;
   const frame=document.createElement('iframe');frame.title='保存前の画面プレビュー';frame.setAttribute('sandbox','');frame.src=new URL(result.url,endpoint()).href;
   const wrapper=document.createElement('div');wrapper.className='capture-preview-sized';wrapper.append(frame);viewport.append(wrapper);viewport.hidden=false;
   const fit=()=>{const scale=Math.min(1,viewport.clientWidth/capture.viewport.width);frame.style.cssText=`border:0;width:${capture.viewport.width}px;height:${capture.viewport.height}px;transform:scale(${scale});transform-origin:top left`;wrapper.style.cssText=`overflow:hidden;width:${capture.viewport.width*scale}px;height:${capture.viewport.height*scale}px`;};
   fit();note.textContent='未保存のプレビューです。5分で期限切れになります。表示が消えたら再表示してください。'+(result.warnings.length?' 確認事項：'+result.warnings.join(' / '):'');button.textContent='プレビューを再表示';
  }catch(e){if(request===generation)note.textContent='プレビューを表示できませんでした：'+e.message+' 取得結果は保持しています。再試行できます。';}
  finally{working=false;button.disabled=!capture;}
 });
 return {setCapture(value){if(value===capture)return;clear();capture=value;button.hidden=!value;button.disabled=!value||working;},clear};
}
