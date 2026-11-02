import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createUpdateController} from '../desktop/updates.cjs';

test('更新確認とダウンロードは利用者の操作で進み、状態を表示する', async()=>{
 const updater=new EventEmitter() as any; let downloads=0;
 updater.checkForUpdates=async()=>{updater.emit('update-available',{version:'0.2.0'});};
 updater.downloadUpdate=async()=>{downloads++;updater.emit('update-downloaded',{version:'0.2.0'});};
 const controller=createUpdateController(updater,{enabled:true});
 assert.equal(updater.autoDownload,false);assert.equal(updater.autoInstallOnAppQuit,false);
 await controller.check();assert.equal(controller.state().status,'available');assert.equal(downloads,0);
 await controller.download();assert.equal(controller.state().status,'downloaded');assert.equal(downloads,1);
});
test('作業中は再起動を拒否し、エラーに内部情報を含めない',async()=>{
 const updater=new EventEmitter() as any;updater.checkForUpdates=async()=>{throw Error('secret path');};
 const controller=createUpdateController(updater,{enabled:true});await controller.check();assert.equal(controller.state().status,'error');assert.doesNotMatch((controller.state() as any).message,/secret/);
 updater.emit('update-downloaded',{version:'0.2.0'});assert.equal(controller.canInstall({working:true}),false);assert.equal(controller.canInstall({pending:true}),false);assert.equal(controller.canInstall({unsaved:true}),false);assert.equal(controller.canInstall({}),true);
});
