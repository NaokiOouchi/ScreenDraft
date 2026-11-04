const {join}=require('node:path');
const {readdirSync}=require('node:fs');
function desktopUserData(appData){return join(appData,'変更ノート');}
function desktopPath(current,home){
 const versions=(root,suffix)=>{try{return readdirSync(root,{withFileTypes:true}).filter(entry=>entry.isDirectory()).map(entry=>entry.name).sort((a,b)=>b.localeCompare(a,undefined,{numeric:true})).map(version=>join(root,version,suffix));}catch{return [];}};
 const user=['.local/bin','.bun/bin','.nvm/current/bin','.volta/bin','.fnm/current/bin','.local/share/mise/shims','.asdf/shims','bin'].map(path=>join(home,path));
 const node=[...versions(join(home,'.nvm/versions/node'),'bin'),...versions(join(home,'Library/Application Support/fnm/node-versions'),'installation/bin'),...versions(join(home,'.local/share/fnm/node-versions'),'installation/bin')];
 return [...new Set([...(current||'').split(':'),...user,...node,'/opt/homebrew/bin','/usr/local/bin','/usr/bin','/bin'].filter(Boolean))].join(':');
}
function allowedAppNavigation(value,origin){try{const url=new URL(value);return url.origin===origin&&url.pathname==='/';}catch{return false;}}
async function listenLocal(create,ports){for(const port of ports){const server=await create(port);try{await server.listen({port,host:'127.0.0.1'});return{server,port};}catch(error){await server.close();if(error.code!=='EADDRINUSE')throw error;}}throw Object.assign(new Error('接続ポートを確保できません。使用中のアプリを確認して再試行してください。'),{code:'EADDRINUSE'});}
function allowPermission(permission,details,origin){return permission==='clipboard-sanitized-write'&&details?.isMainFrame===true&&allowedAppNavigation(details.requestingUrl,origin);}
function allowDesktopAction(url,isMainFrame,origin){return isMainFrame===true&&allowedAppNavigation(url,origin);}
function quitWarning(state){if(state?.working===true)return 'AI編集を中止して終了しますか？生成途中の結果は保存されません。';if(state?.pending===true)return '保存していない取り込み結果を破棄して終了しますか？';if(state?.unsaved===true)return '保存していない入力内容を破棄して終了しますか？';return null;}
module.exports={quitWarning,desktopUserData,allowDesktopAction,allowPermission,desktopPath,allowedAppNavigation,listenLocal};
