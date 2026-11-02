import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,mkdir,writeFile,rm}from'node:fs/promises';import {tmpdir}from'node:os';import {join}from'node:path';import {createApp}from'../server/app.js';
// @ts-ignore desktop helper is shared with Electron main
import {desktopPath,allowedAppNavigation,allowPermission,listenLocal}from'../desktop/runtime.cjs';
test('desktop isolates app navigation and discovers standard native Claude install paths',()=>{
 assert.ok(desktopPath('/usr/bin','/Users/test').split(':').includes('/Users/test/.local/bin'));assert.ok(desktopPath('/usr/bin','/Users/test').includes('/opt/homebrew/bin'));
 assert.equal(allowedAppNavigation('http://127.0.0.1:4175/?proposal=x','http://127.0.0.1:4175'),true);for(const url of ['https://evil.test','http://127.0.0.1:4175/api/session','http://127.0.0.1:4175/sample/users','file:///tmp/a','javascript:alert(1)'])assert.equal(allowedAppNavigation(url,'http://127.0.0.1:4175'),false);
});
test('desktop tries a free port without adopting or stopping another server',async()=>{
 const seen:number[]=[];let closed=0;const result=await listenLocal(async(port:number)=>({listen:async()=>{seen.push(port);if(port===4173)throw Object.assign(new Error(),{code:'EADDRINUSE'});},close:async()=>{closed++;}}),[4173,4175]);assert.equal(result.port,4175);assert.deepEqual(seen,[4173,4175]);assert.equal(closed,1);await result.server.close();
});
test('packaged resources resolve independently of the launch working directory',async()=>{
 const root=await mkdtemp(join(tmpdir(),'cn-desktop-'));await mkdir(join(root,'public'));await mkdir(join(root,'fixtures'));await mkdir(join(root,'dist/client'),{recursive:true});await writeFile(join(root,'fixtures/users.html'),'<h1>PACKAGED SAMPLE</h1>');await writeFile(join(root,'dist/client/index.html'),'<h1>PACKAGED APP</h1>');
 const app=await createApp({dataDir:join(root,'data'),frontend:true,resourceRoot:root} as any);try{assert.match((await app.inject('/sample/users')).body,/PACKAGED SAMPLE/);assert.match((await app.inject('/')).body,/PACKAGED APP/);}finally{await app.close();await rm(root,{recursive:true,force:true});}
});

test('only the trusted app main frame may write the clipboard; snapshots cannot use native permissions',()=>{
 const origin='http://127.0.0.1:4173';assert.equal(allowPermission('clipboard-sanitized-write',{isMainFrame:true,requestingUrl:origin+'/'},origin),true);
 for(const permission of ['clipboard-read','media','geolocation'])assert.equal(allowPermission(permission,{isMainFrame:true,requestingUrl:origin+'/'},origin),false);
 assert.equal(allowPermission('clipboard-sanitized-write',{isMainFrame:false,requestingUrl:origin+'/'},origin),false);assert.equal(allowPermission('clipboard-sanitized-write',{isMainFrame:true,requestingUrl:origin+'/api/snapshots/a'},origin),false);
});
test('desktop stops after the bounded port list and does not hide non-port startup errors',async()=>{
 let closed=0;await assert.rejects(()=>listenLocal(async()=>({listen:async()=>{throw Object.assign(new Error('occupied'),{code:'EADDRINUSE'});},close:async()=>{closed++;}}),[4173,4175]),/接続ポート/);assert.equal(closed,2);
 await assert.rejects(()=>listenLocal(async()=>({listen:async()=>{throw Object.assign(new Error('denied'),{code:'EACCES'});},close:async()=>{}}),[4173]),/denied/);
});
// @ts-ignore shared Electron boundary helper
import {allowDesktopAction} from '../desktop/runtime.cjs';
test('extension folder action accepts only the trusted app main document',()=>{
 const origin='http://127.0.0.1:4173';assert.equal(allowDesktopAction(origin+'/?proposal=test',true,origin),true);
 for(const [url,main] of [[origin+'/',false],[origin+'/api/previews/a',true],['https://example.com/',true],['about:srcdoc',false]])assert.equal(allowDesktopAction(url,main,origin),false);
});
// @ts-ignore shared desktop identity helper
import {desktopUserData} from '../desktop/runtime.cjs';
test('ScreenDraft keeps the existing workspace and Chromium storage directory after renaming',()=>{
 assert.equal(desktopUserData('/Users/test/Library/Application Support'),'/Users/test/Library/Application Support/変更ノート');
});
