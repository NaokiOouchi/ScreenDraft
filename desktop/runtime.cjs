const {join}=require('node:path');
function desktopUserData(appData){return join(appData,'変更ノート');}
function desktopPath(current,home){return [...new Set([join(home,'.local/bin'),'/opt/homebrew/bin','/usr/local/bin',...(current||'').split(':'),'/usr/bin','/bin'].filter(Boolean))].join(':');}
function allowedAppNavigation(value,origin){try{const url=new URL(value);return url.origin===origin&&url.pathname==='/';}catch{return false;}}
async function listenLocal(create,ports){for(const port of ports){const server=await create(port);try{await server.listen({port,host:'127.0.0.1'});return{server,port};}catch(error){await server.close();if(error.code!=='EADDRINUSE')throw error;}}throw Object.assign(new Error('接続ポートを確保できません。使用中のアプリを確認して再試行してください。'),{code:'EADDRINUSE'});}
function allowPermission(permission,details,origin){return permission==='clipboard-sanitized-write'&&details?.isMainFrame===true&&allowedAppNavigation(details.requestingUrl,origin);}
function allowDesktopAction(url,isMainFrame,origin){return isMainFrame===true&&allowedAppNavigation(url,origin);}
function quitWarning(state){if(state?.working===true)return 'AI編集を中止して終了しますか？生成途中の結果は保存されません。';if(state?.pending===true)return '保存していない取り込み結果を破棄して終了しますか？';if(state?.unsaved===true)return '保存していない入力内容を破棄して終了しますか？';return null;}
module.exports={quitWarning,desktopUserData,allowDesktopAction,allowPermission,desktopPath,allowedAppNavigation,listenLocal};
