import {useEffect,useState} from 'react';
import type {PortSettingsState} from './desktop';

export function PortSettings(){
 const [state,setState]=useState<PortSettingsState|null>(null),[mode,setMode]=useState('auto'),[value,setValue]=useState('4173');
 const [error,setError]=useState(''),[saving,setSaving]=useState(false),[saved,setSaved]=useState(false);
 useEffect(()=>{let active=true;window.changeNoteDesktop?.getPortSettings().then(next=>{if(!active)return;setState(next);setMode(next.port===null?'auto':'manual');setValue(String(next.port??4173));}).catch(()=>{if(active)setError('接続ポートの設定を読み込めませんでした。画面を開き直してください。');});return()=>{active=false;};},[]);
 const port=mode==='auto'?null:/^\d+$/.test(value)?Number(value):NaN;
 const valid=port===null||(Number.isInteger(port)&&port>=1024&&port<=65535);
 const changed=state&&state.port!==port;
 async function save(){
  if(!valid||!changed||!window.changeNoteDesktop)return;
  setSaving(true);setError('');setSaved(false);
  try{setState(await window.changeNoteDesktop.setPortSettings({port}));setSaved(true);}catch{setError('設定を保存できませんでした。保存先の書き込み権限を確認してください。');}finally{setSaving(false);}
 }
 return <div className="port-settings" data-unsaved={!!changed}>
  <label className="field-label">現在の接続先<input readOnly value={state?`http://127.0.0.1:${state.activePort}`:location.origin}/></label>
  <fieldset disabled={!state||saving}><legend>接続ポート</legend><div className="port-options">
   <label><input type="radio" name="port-mode" checked={mode==='auto'} onChange={()=>{setMode('auto');setSaved(false);}}/>自動</label>
   <label><input type="radio" name="port-mode" checked={mode==='manual'} onChange={()=>{setMode('manual');setSaved(false);}}/>手動指定</label>
  </div>{mode==='manual'&&<label className="field-label">ポート番号<input inputMode="numeric" value={value} aria-invalid={!valid} aria-describedby="port-hint" onChange={e=>{setValue(e.target.value);setSaved(false);}}/></label>}
  <p id="port-hint" className={!valid?'warning-text':'field-hint'}>{mode==='auto'?'空いているポートを自動で選択します。':'1024〜65535の整数を指定してください。使用中の場合は起動時に案内します。'}</p>
  </fieldset>
  {error&&<p className="alert error" role="alert">{error}</p>}
  {(state?.restartRequired||saved)&&<p className="alert info" role="status">{state?.restartRequired?'設定を保存しました。アプリを終了して開き直すと反映されます。再起動後にChrome拡張の接続先を確認してください。':'設定を保存しました。現在の設定で起動しています。'}</p>}
  <button className="button primary wide" disabled={!changed||!valid||saving} onClick={()=>void save()}>{saving?'保存しています':'設定を保存'}</button>
 </div>;
}
