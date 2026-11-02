import {randomUUID} from 'node:crypto';
import {normalizeCapture} from './normalize.js';
import type {Capture} from '../shared/types.js';
interface Preview{html:string;expiresAt:number;assets:Map<string,{bytes:Buffer;mime:string}>}
/** Bounded, expiring in-memory previews. No repository or persistent asset writes. */
export class CapturePreviews{
 private entries=new Map<string,Preview>();
 private timer=setInterval(()=>this.prune(),30000).unref();
 private prune(){for(const [id,p]of this.entries)if(p.expiresAt<=Date.now())this.entries.delete(id);}
 async create(capture:Capture){
  const buffers=new Map<string,Buffer>();const result=await normalizeCapture(capture,{put:async(id,bytes)=>{buffers.set(id,bytes);},get:async id=>{const value=buffers.get(id);if(!value)throw new Error('missing');return value;}});
  this.prune();while(this.entries.size>=3)this.entries.delete(this.entries.keys().next().value!);
  const id=randomUUID(),url='/api/capture-previews/'+id,prefix=url+'/assets/';
  const assets=new Map(result.assets.map(a=>{const bytes=buffers.get(a.id)!;return [a.id,{mime:a.mime,bytes:a.mime==='text/css'?Buffer.from(bytes.toString().replaceAll('/api/assets/',prefix)):bytes}]as const;}));
  this.entries.set(id,{html:result.html.replaceAll('/api/assets/',prefix),expiresAt:Date.now()+300000,assets});
  return {id,url,warnings:result.warnings,width:capture.viewport.width,height:capture.viewport.height};
 }
 get(id:string){this.prune();return this.entries.get(id);}
 remove(id:string){this.entries.delete(id);}
 close(){clearInterval(this.timer);this.entries.clear();}
}
