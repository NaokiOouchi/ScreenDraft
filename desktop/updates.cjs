function createUpdateController(updater,{enabled=true,onChange=()=>{}}={}){
 let current={status:enabled?'idle':'unavailable'};
 function set(value){current=value;onChange(current);}
 updater.autoDownload=false;updater.autoInstallOnAppQuit=false;updater.allowPrerelease=false;
 updater.on('checking-for-update',()=>set({status:'checking'}));
 updater.on('update-available',info=>set({status:'available',version:info.version}));
 updater.on('update-not-available',()=>set({status:'current'}));
 updater.on('download-progress',info=>set({status:'downloading',percent:Math.max(0,Math.min(100,Math.round(info.percent||0)))}));
 updater.on('update-downloaded',info=>set({status:'downloaded',version:info.version}));
 updater.on('error',()=>set({status:'error',message:'更新を確認できませんでした。時間をおいて再試行してください。'}));
 return {state:()=>({...current}),check:async()=>{if(!enabled)return;try{set({status:'checking'});await updater.checkForUpdates();}catch{set({status:'error',message:'更新を確認できませんでした。時間をおいて再試行してください。'});}},download:async()=>{if(current.status!=='available')return;try{set({status:'downloading',percent:0});await updater.downloadUpdate();}catch{set({status:'error',message:'更新をダウンロードできませんでした。再試行してください。'});}},canInstall:work=>current.status==='downloaded'&&!work?.working&&!work?.pending&&!work?.unsaved};
}
module.exports={createUpdateController};
