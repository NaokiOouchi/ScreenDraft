import {createApp} from '../server/app.js';
// Electron utility processes have Node APIs without exposing them to the renderer.
import {listenLocal} from './runtime.cjs';
import {portCandidates} from './connection-settings.cjs';
const parent=(process as any).parentPort;
let server:Awaited<ReturnType<typeof createApp>>|undefined,stopping=false;
async function stop(){if(stopping)return;stopping=true;await server?.close();parent?.postMessage({type:'stopped'});process.exit(0);}
parent.on('message',({data}:any)=>{if(data?.type==='stop')void stop();else if(data?.type==='retry-auto')void start(null);});
async function start(port:number|null){try{
 const result=await listenLocal((port:number)=>createApp({port,dataDir:process.env.CHANGE_NOTE_DATA_DIR!,resourceRoot:process.env.CHANGE_NOTE_RESOURCE_ROOT!,frontend:true}),portCandidates(port));server=result.server;
 parent.postMessage({type:'ready',port:result.port});
}catch(error){parent.postMessage({type:'failed',message:(error as Error).message,code:(error as NodeJS.ErrnoException).code,port});}}
void start(JSON.parse(process.env.CHANGE_NOTE_PORT || 'null'));
