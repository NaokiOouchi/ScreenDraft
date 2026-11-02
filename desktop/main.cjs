const {app,BrowserWindow,utilityProcess,dialog,Menu,shell,ipcMain}=require('electron');
const {join}=require('node:path');
const {homedir}=require('node:os');
const {readSettings,writeSettings}=require('./connection-settings.cjs');
const {quitWarning,desktopUserData,desktopPath,allowedAppNavigation,allowPermission,allowDesktopAction}=require('./runtime.cjs');
const legacyUserData=desktopUserData(app.getPath('appData'));
require('node:fs').mkdirSync(legacyUserData,{recursive:true});
app.setPath('userData',legacyUserData);
app.setPath('sessionData',legacyUserData);
app.setName('ScreenDraft');
let workState={working:false,pending:false,unsaved:false},quitConfirmed=false,confirmingQuit=false;
let window,backend,origin='',quitting=false,stopped=false,started=false,startupPort=null,recovering=false;
const settingsFile=()=>join(app.getPath('userData'),'connection-settings.json');
function trustedAction(event){return window&&event.sender===window.webContents&&allowDesktopAction(event.senderFrame?.url,event.senderFrame===window.webContents.mainFrame,origin);}
function portState(port){return {port,activePort:Number(new URL(origin).port),restartRequired:port!==startupPort};}
ipcMain.handle('change-note:get-port-settings',async event=>{if(!trustedAction(event))throw new Error('この画面からは操作できません。');return portState((await readSettings(settingsFile())).port);});
ipcMain.handle('change-note:set-port-settings',async(event,value)=>{if(!trustedAction(event))throw new Error('この画面からは操作できません。');return portState((await writeSettings(settingsFile(),value)).port);});
let renderingReview=false;
ipcMain.handle('screendraft:render-review',async(event,input)=>{if(!trustedAction(event))throw Error('この画面からは操作できません。');if(renderingReview)throw Error('画像を作成中です。');renderingReview=true;try{return await require('./review-render.cjs').renderReview(origin,input);}finally{renderingReview=false;}});
ipcMain.handle('screendraft:save-draft-file',async(event,value)=>{if(!trustedAction(event))throw Error('この画面からは操作できません。');if(!value||typeof value.name!=='string'||!/^.{1,120}\.(zip|screendraft)$/.test(value.name)||/[\\/]/.test(value.name)||!(value.bytes instanceof Uint8Array)||value.bytes.length>128*1024*1024)throw Error('書き出しデータが不正です。');const result=await dialog.showSaveDialog(window,{defaultPath:value.name,filters:[{name:value.name.endsWith('.zip')?'ZIP':'ScreenDraft',extensions:[value.name.endsWith('.zip')?'zip':'screendraft']}]});if(result.canceled||!result.filePath)return {saved:false};const fs=require('node:fs/promises'),temp=result.filePath+'.'+require('node:crypto').randomUUID()+'.tmp';try{await fs.writeFile(temp,Buffer.from(value.bytes),{flag:'wx',mode:0o600});await fs.rename(temp,result.filePath);}catch(error){await fs.unlink(temp).catch(()=>{});throw error;}return {saved:true};});
ipcMain.handle('screendraft:work-state',(event,value)=>{if(!trustedAction(event))throw new Error('この画面からは操作できません。');workState={working:value?.working===true,pending:value?.pending===true,unsaved:value?.unsaved===true};});
const dataDir=()=>join(app.getPath('userData'),'workspace');
ipcMain.handle('screendraft:app-info',event=>{if(!trustedAction(event))throw new Error('この画面からは操作できません。');return {version:app.getVersion(),dataPath:dataDir()};});
ipcMain.handle('screendraft:open-data-folder',async event=>{if(!trustedAction(event))throw new Error('この画面からは操作できません。');const error=await shell.openPath(dataDir());if(error)throw new Error('保存先を開けませんでした。');return {ok:true};});
function fail(message){dialog.showErrorBox('ScreenDraftを起動できませんでした',message+'\n保存済みデータは削除していません。');app.quit();}
function openWindow(){
 if(window){window.show();window.focus();return;}
 window=new BrowserWindow({width:1440,height:960,minWidth:1100,minHeight:760,title:'ScreenDraft',backgroundColor:'#f1f1f1',show:false,webPreferences:{preload:join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});
 window.webContents.session.setPermissionRequestHandler((_wc,permission,callback,details)=>callback(allowPermission(permission,details,origin)));
 window.webContents.session.setPermissionCheckHandler((_wc,permission,_requestingOrigin,details)=>allowPermission(permission,details,origin));
 window.webContents.on('will-navigate',(event,url)=>{if(!allowedAppNavigation(url,origin))event.preventDefault();});
 window.webContents.on('will-prevent-unload',event=>{if(quitConfirmed){event.preventDefault();return;}const message=quitWarning(workState);if(!message)return;const answer=dialog.showMessageBoxSync(window,{type:'question',message,buttons:['作業を続ける','終了する'],defaultId:0,cancelId:0});if(answer===1){quitConfirmed=true;event.preventDefault();}});
 window.webContents.on('will-attach-webview',event=>event.preventDefault());
 window.webContents.setWindowOpenHandler(({url})=>{try{const u=new URL(url);if(u.origin===origin&&/^\/api\/snapshots\/[a-f0-9-]{36}$/.test(u.pathname))void shell.openExternal(u.href);}catch{}return{action:'deny'};});
 window.once('ready-to-show',()=>window?.show());window.on('closed',()=>{window=null;});
 void window.loadURL(origin).catch(()=>fail('編集画面を読み込めませんでした。アプリを開き直してください。'));
}
ipcMain.handle('change-note:open-extension-folder',async event=>{if(!trustedAction(event))throw new Error('この画面からは操作できません。');const error=await shell.openPath(app.isPackaged?join(process.resourcesPath,'dist-extension'):join(app.getAppPath(),'dist-extension'));if(error)throw new Error('拡張フォルダを開けませんでした。');return {ok:true};});
function menu(){Menu.setApplicationMenu(Menu.buildFromTemplate([
 {label:'ScreenDraft',submenu:[{role:'about'},{type:'separator'},{label:'保存先を開く',click:()=>void shell.openPath(dataDir())},{label:'Chrome拡張フォルダを開く',click:()=>void shell.openPath(app.isPackaged?join(process.resourcesPath,'dist-extension'):join(app.getAppPath(),'dist-extension'))},{type:'separator'},{role:'quit'}]},
 {label:'編集',submenu:[{role:'undo'},{role:'redo'},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]},
 {label:'表示',submenu:[{role:'reload'},{role:'togglefullscreen'},...(!app.isPackaged?[{role:'toggleDevTools'}]:[])]},
 {label:'ウィンドウ',submenu:[{role:'minimize'},{role:'front'}]}
 ]));}
if(!app.requestSingleInstanceLock()){app.quit();}else{
 app.on('second-instance',()=>{if(origin)openWindow();});
 app.whenReady().then(async()=>{
  menu();
  try{startupPort=(await readSettings(settingsFile())).port;}catch{const choice=await dialog.showMessageBox({type:'error',title:'接続ポートの設定を読み込めません',message:'接続ポートの設定を読み込めません',detail:'自動設定に戻して起動できます。保存済みの画面や履歴は保持されます。',buttons:['自動に戻して起動','終了'],defaultId:0,cancelId:1});if(choice.response!==0){app.quit();return;}await writeSettings(settingsFile(),{port:null});startupPort=null;}
  backend=utilityProcess.fork(join(app.getAppPath(),'dist-desktop/backend.cjs'),[],{env:{...process.env,PATH:desktopPath(process.env.PATH,homedir()),CHANGE_NOTE_PORT:JSON.stringify(startupPort),CHANGE_NOTE_DATA_DIR:dataDir(),CHANGE_NOTE_RESOURCE_ROOT:app.getAppPath()},stdio:'pipe',serviceName:'ScreenDraft ローカル保存'});
  let timer;const armTimeout=()=>{clearTimeout(timer);timer=setTimeout(()=>fail('ローカル保存の起動が時間内に完了しませんでした。'),30000);};armTimeout();
  backend.on('message',async message=>{
   if(message.type==='ready'){clearTimeout(timer);started=true;origin='http://127.0.0.1:'+message.port;openWindow();}
   else if(message.type==='failed'){
    clearTimeout(timer);if(recovering)return;
    if(message.code!=='EADDRINUSE'){fail('ローカル保存を起動できません。空き容量・書き込み権限・接続ポートを確認してください。');return;}
    recovering=true;
    try{
     const manual=message.port!==null;
     const choice=await dialog.showMessageBox({type:'warning',title:'接続ポートを使用できません',message:manual?`ポート ${message.port} はほかのアプリが使用しています。`:'自動選択の接続ポートがすべて使用中です。',detail:manual?'自動設定に戻すと空いているポートで起動します。Chrome拡張の接続先も設定し直してください。':'使用中のアプリを確認してから再試行してください。ほかのアプリを自動終了することはありません。',buttons:[manual?'自動に戻して起動':'再試行','終了'],defaultId:0,cancelId:1});
     if(choice.response!==0){app.quit();return;}
     await writeSettings(settingsFile(),{port:null});startupPort=null;armTimeout();backend.postMessage({type:'retry-auto'});
    }catch{fail('自動設定への変更に失敗しました。保存先の書き込み権限を確認してください。');}finally{recovering=false;}
   }else if(message.type==='stopped'){stopped=true;app.quit();}
  });
  backend.on('exit',()=>{clearTimeout(timer);stopped=true;if(quitting)app.quit();else fail(started?'ローカル保存が停止しました。アプリを開き直してください。':'ローカル保存を起動できませんでした。');});
  // Development logs only: never include user captures, prompts, or credentials.
  if(!app.isPackaged){backend.stderr?.on('data',data=>console.error(String(data)));backend.stdout?.on('data',data=>console.log(String(data)));}
 }).catch(()=>fail('アプリの初期化に失敗しました。'));
 app.on('activate',()=>{if(origin&&!quitting)openWindow();});
 app.on('window-all-closed',()=>app.quit());
 app.on('before-quit',event=>{const message=quitWarning(workState);if(message&&!quitConfirmed){event.preventDefault();if(confirmingQuit)return;confirmingQuit=true;void dialog.showMessageBox(window,{type:'question',message,buttons:['作業を続ける','終了する'],defaultId:0,cancelId:0}).then(answer=>{confirmingQuit=false;if(answer.response===1){quitConfirmed=true;app.quit();}});return;}if(backend&&!stopped){event.preventDefault();if(quitting)return;quitting=true;backend.postMessage({type:'stop'});setTimeout(()=>{backend?.kill();stopped=true;app.quit();},6000).unref();}});
}
