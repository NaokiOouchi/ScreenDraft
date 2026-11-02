import type {PickedNode} from '../shared/editor-types';
export interface Draft {snapshotId:string;prompt:string;nodes:PickedNode[]}
type Storage=Pick<globalThis.Storage,'getItem'|'setItem'|'removeItem'>;
export class DraftStore {
 private memory=new Map<string,Draft>();
 private volatile=new Set<string>();
 constructor(private storage?:Storage){}
 private key(proposalId:string,screenId:string){return 'change-note:draft:v1:'+proposalId+':'+screenId;}
 read(proposalId:string,screenId:string,snapshotId:string):Draft{
  const key=this.key(proposalId,screenId);let value=this.memory.get(key);
  if(!value)try{const parsed=JSON.parse(this.storage?.getItem(key)||'null');if(parsed&&typeof parsed.prompt==='string'&&typeof parsed.snapshotId==='string'&&Array.isArray(parsed.nodes))value={snapshotId:parsed.snapshotId,prompt:parsed.prompt.slice(0,4000),nodes:parsed.nodes.filter((n:PickedNode)=>typeof n?.id==='string'&&typeof n?.tag==='string'&&typeof n?.text==='string'&&Array.isArray(n.ancestors)).slice(0,8)};}catch{/* Corrupt/unavailable storage must not stop editing. */}
  return {snapshotId,prompt:value?.prompt||'',nodes:value?.snapshotId===snapshotId?value.nodes:[]};
 }
 write(proposalId:string,screenId:string,value:Draft):boolean{
  const key=this.key(proposalId,screenId);this.memory.set(key,value);
  try{if(!this.storage)throw Error('unavailable');this.storage.setItem(key,JSON.stringify(value));this.volatile.delete(key);return true;}catch{this.volatile.add(key);return false;}
 }
 isVolatile(proposalId:string,screenId:string){return this.volatile.has(this.key(proposalId,screenId));}
 clear(proposalId:string,screenId:string){const key=this.key(proposalId,screenId);this.memory.set(key,{snapshotId:'',prompt:'',nodes:[]});try{this.storage?.removeItem(key);}catch{/* The cleared in-memory value wins for this session. */}}
}
let storage:Storage|undefined;try{storage=globalThis.localStorage;}catch{}
export const drafts=new DraftStore(storage);
