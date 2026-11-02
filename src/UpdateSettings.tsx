import {useEffect,useState} from 'react';
import type {UpdateState} from './desktop';
export function UpdateSettings(){
 const [state,setState]=useState<UpdateState>({status:'idle'}),[error,setError]=useState('');
 useEffect(()=>{const api=window.changeNoteDesktop;if(!api)return;let active=true;void api.updateState().then(s=>{if(active)setState(s)});const stop=api.onUpdateState(s=>setState(s));return()=>{active=false;stop()};},[]);
 const run=async(action:'checkUpdate'|'downloadUpdate'|'installUpdate')=>{setError('');try{const api=window.changeNoteDesktop;if(!api)return;const result=await api[action]();if(action!=='installUpdate')setState(result as UpdateState);}catch{setError(action==='installUpdate'?'作業を保存または終了してから更新してください。':'更新を実行できませんでした。');}};
 const labels:Record<UpdateState['status'],string>={idle:'',unavailable:'デスクトップ版で更新できます。',checking:'更新を確認しています。',available:`バージョン ${state.version||''} を利用できます。`,current:'最新のバージョンです。',downloading:`ダウンロード中 ${state.percent||0}%`,downloaded:`バージョン ${state.version||''} の準備ができました。`,error:state.message||'更新を確認できませんでした。'};
 return <section><h4>アプリの更新</h4>{labels[state.status]&&<p role="status">{labels[state.status]}</p>}{error&&<p role="alert">{error}</p>}{['idle','current','error'].includes(state.status)&&<button className="button secondary" onClick={()=>void run('checkUpdate')}>更新を確認</button>}{state.status==='available'&&<button className="button secondary" onClick={()=>void run('downloadUpdate')}>ダウンロード</button>}{state.status==='downloaded'&&<button className="button primary" onClick={()=>void run('installUpdate')}>再起動して更新</button>}</section>;
}
