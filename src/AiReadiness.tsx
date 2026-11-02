import {CaretDown} from '@phosphor-icons/react';
import {useEffect,useState} from 'react';
export function useAiReadiness(){
 const [result,setResult]=useState<{status:string;version:string|null;message:string;checkedAt:string}|null>(null),[checking,setChecking]=useState(false),[error,setError]=useState('');
 const check=async()=>{setChecking(true);setError('');try{const response=await fetch('/api/ai-readiness');if(!response.ok)throw new Error();setResult(await response.json());}catch{setError('準備状態を確認できませんでした。アプリの接続を確認してください。');}finally{setChecking(false);}};
 useEffect(()=>{void check();},[]);
 return {result,checking,error,check};
}
export type AiReadinessState=ReturnType<typeof useAiReadiness>;
export function AiReadinessCard({state,issuesOnly=false}:{state:AiReadinessState;issuesOnly?:boolean}){
 const [copied,setCopied]=useState(false);
 const ready=state.result?.status==='ready'&&!state.error;
 if(issuesOnly&&!state.error&&(!state.result||ready))return null;
 const labels:Record<string,string>={ready:'Claude接続確認済み','not-installed':'Claude Codeが見つかりません','needs-login':'Claude Codeにログインが必要',unknown:'AIの準備を確認してください'};
 return <details className={'ai-readiness '+(ready?'is-ready':'needs-setup')} open={!ready} aria-label="AIの準備状態"><summary><span className="readiness-dot"/><strong>{state.checking?'AIの準備を確認中…':state.error?'準備確認に失敗しました':labels[state.result?.status||'unknown']}</strong><CaretDown size={14} className="readiness-chevron"/></summary><div className="readiness-details"><p role="status">{state.error||state.result?.message||'このPCでの起動とログイン状態を確認します。'}</p>{!state.error&&(state.result?.status==='not-installed'||state.result?.status==='needs-login')&&<div>{state.result.status==='not-installed'?<p>Claude Codeをインストールしてください。ターミナルで<code>claude</code>を起動し、ログインします。</p>:<p>ターミナルで<code>claude</code>を起動し、ログインを完了してください。</p>}<p>完了後に「再確認」を押します。</p><p>導入とログインの手順はClaude Code公式ガイドで確認できます。</p><code>https://code.claude.com/docs/ja/setup</code><button className="text-button" onClick={()=>void navigator.clipboard.writeText('https://code.claude.com/docs/ja/setup').then(()=>setCopied(true)).catch(()=>setCopied(false))}>{copied?'コピーしました':'URLをコピー'}</button></div>}{state.result&&!state.checking&&<small>{state.result.version&&`Claude Code ${state.result.version} · `}{new Date(state.result.checkedAt).toLocaleTimeString('ja-JP')} 確認</small>}<button className="text-button" disabled={state.checking} onClick={()=>void state.check()}>再確認</button></div></details>;
}
