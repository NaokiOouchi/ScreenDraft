import {useEffect,useRef,useState} from 'react';
import type {ExtensionState,ImportEvent} from '../shared/import-sync';
export function useExtensionSync(onImports:(events:ImportEvent[])=>Promise<boolean>){
 const [connected,setConnected]=useState(false),callback=useRef(onImports);callback.current=onImports;
 useEffect(()=>{let live=true,instance='',cursor=-1;let timer:ReturnType<typeof setTimeout>;const controller=new AbortController();
 const tick=async()=>{try{const response=await fetch('/api/extension-state',{signal:controller.signal,cache:'no-store'});if(!response.ok)throw Error();const state:ExtensionState=await response.json();if(!live)return;setConnected(!!state.connectedAt);
 if(instance!==state.instanceId){instance=state.instanceId;cursor=state.sequence;}
 else if(state.sequence>cursor){const events=state.imports.filter(event=>event.sequence>cursor);if(await callback.current(events))cursor=state.sequence;}
 }catch{if(live)setConnected(false);}finally{if(live)timer=setTimeout(tick,1500);}};void tick();return()=>{live=false;controller.abort();clearTimeout(timer);};},[]);
 return connected;
}
