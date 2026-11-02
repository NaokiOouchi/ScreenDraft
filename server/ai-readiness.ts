import {execFile} from 'node:child_process';
type CommandResult={status:'ok'|'not-found'|'timeout'|'error';stdout:string};
type Probe=(args:string[])=>Promise<CommandResult>;
const run:Probe=args=>new Promise(resolve=>{execFile(process.env.CHANGE_NOTE_CLAUDE_BIN||'claude',args,{timeout:8000,maxBuffer:65536,encoding:'utf8'},(error,stdout)=>{const e=error as NodeJS.ErrnoException&{killed?:boolean}|null;resolve({status:!e?'ok':e.code==='ENOENT'?'not-found':e.killed?'timeout':'error',stdout:stdout||''});});});
export async function checkAiReadiness(probe:Probe=run){
 const [versionResult,auth]=await Promise.all([probe(['--version']),probe(['auth','status','--json'])]);
 const version=versionResult.stdout.match(/\b\d+\.\d+\.\d+(?:[-\w.]*)?/)?.[0]||null;
 let status:'ready'|'not-installed'|'needs-login'|'unknown'='unknown';
 if(versionResult.status==='not-found')status='not-installed';
 else if(auth.status!=='timeout'){try{const value=JSON.parse(auth.stdout);if(value.loggedIn===true&&auth.status==='ok')status='ready';else if(value.loggedIn===false)status='needs-login';}catch{/* Unsupported/failed status probes are not proof of logout. */}}
 const messages={ready:'Claude Codeの起動とログインを確認しました。AIの応答・通信・利用枠は未確認です。','not-installed':'Claude Codeを起動できません。インストールとアプリの実行環境を確認してください。','needs-login':'Claude Codeへのログインが必要です。ターミナルでclaudeを起動してログインしてください。',unknown:'準備状態を確認できませんでした。Claude Codeのバージョン・ログイン状態・実行環境の確認後に再実行してください。'};
 return {status,version,checkedAt:new Date().toISOString(),message:messages[status]};
}
