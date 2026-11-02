import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
// @ts-ignore Electron and Node shared settings
import settings from '../desktop/connection-settings.cjs';
// @ts-ignore Electron runtime
import {listenLocal} from '../desktop/runtime.cjs';

test('port settings reject invalid values without coercion',()=>{
 assert.equal(settings.validatePort(null),null);
 for(const port of [1024,4173,65535])assert.equal(settings.validatePort(port),port);
 for(const port of [0,80,1023,65536,-1,4173.5,'4173','',undefined,NaN,{},true])assert.throws(()=>settings.validatePort(port),/1024/);
 assert.deepEqual(settings.portCandidates(null),[4173,4175,4176,4177,4178,4179]);
 assert.deepEqual(settings.portCandidates(54321),[54321]);
});
test('settings persist across reads, default only when missing, and reject corrupt data',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'cn-port-'));const file=join(dir,'connection.json');
 try{
 assert.deepEqual(await settings.readSettings(file),{port:null});
 await settings.writeSettings(file,{port:54321});assert.deepEqual(await settings.readSettings(file),{port:54321});
 await assert.rejects(()=>settings.writeSettings(file,{port:'54321'}),/1024/);assert.deepEqual(await settings.readSettings(file),{port:54321});
 await settings.writeSettings(file,{port:null});assert.equal(JSON.parse(await readFile(file,'utf8')).port,null);
 await writeFile(file,'bad json');await assert.rejects(()=>settings.readSettings(file),/設定/);
 await writeFile(file,'{}');await assert.rejects(()=>settings.readSettings(file),/設定/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('manual port collision retains conflict code and does not try another port',async()=>{
 const tried:number[]=[];
 await assert.rejects(()=>listenLocal(async(port:number)=>({listen:async()=>{tried.push(port);throw Object.assign(new Error('occupied'),{code:'EADDRINUSE'});},close:async()=>{}}),settings.portCandidates(54321)),{code:'EADDRINUSE'});
 assert.deepEqual(tried,[54321]);
});

import Fastify from 'fastify';
test('real occupied socket stays available while manual startup fails and automatic retry succeeds',async()=>{
 const blocker=Fastify();blocker.get('/owner',async()=>({owner:'other-app'}));await blocker.listen({host:'127.0.0.1',port:0});
 const address=blocker.server.address();assert.ok(address&&typeof address==='object');const occupied=address.port;
 const attempted:number[]=[];const create=async(port:number)=>{attempted.push(port);return Fastify();};
 try{
 await assert.rejects(()=>listenLocal(create,settings.portCandidates(occupied)),{code:'EADDRINUSE'});assert.deepEqual(attempted,[occupied]);
 assert.equal((await fetch(`http://127.0.0.1:${occupied}/owner`)).status,200);
 const result=await listenLocal(create,[occupied,0]);
 try{assert.deepEqual(attempted,[occupied,occupied,0]);assert.ok(result.server.server.listening);assert.equal((await fetch(`http://127.0.0.1:${occupied}/owner`)).status,200);}finally{await result.server.close();}
 }finally{await blocker.close();}
});
