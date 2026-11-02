export type Route={page:'library'}|{page:'trash'}|{page:'workspace';proposalId:string;screenId?:string};
export function readRoute(url:string):Route{const p=new URL(url).searchParams;const id=p.get('proposal');return id?{page:'workspace',proposalId:id,...(p.get('screen')?{screenId:p.get('screen')!}:{})}:{page:p.get('view')==='trash'?'trash':'library'};}
export function routeUrl(route:Route){const p=new URLSearchParams();if(route.page==='workspace'){p.set('proposal',route.proposalId);if(route.screenId)p.set('screen',route.screenId);}else if(route.page==='trash')p.set('view','trash');return '/'+(p.size?'?'+p.toString():'');}
export interface WorkspaceState{screenId:string;comparing:boolean;revisionId:string;rail:boolean;inspectorOpen:boolean;inspectorWidth:number}
const defaults:WorkspaceState={screenId:'',comparing:false,revisionId:'',rail:false,inspectorOpen:true,inspectorWidth:320};
type Storage=Pick<globalThis.Storage,'getItem'|'setItem'>;
export function readWorkspace(storage:Storage|undefined,id:string):WorkspaceState{try{const p=JSON.parse(storage?.getItem('screendraft:workspace:v1:'+id)||'null');if(!p)return {...defaults,rail:storage?.getItem('change-note:rail-v2')==='collapsed'};return {screenId:typeof p.screenId==='string'?p.screenId:'',revisionId:typeof p.revisionId==='string'?p.revisionId:'',comparing:p.comparing===true,rail:p.rail===true,inspectorOpen:p.inspectorOpen!==false,inspectorWidth:typeof p.inspectorWidth==='number'&&Number.isFinite(p.inspectorWidth)?Math.max(280,Math.min(420,p.inspectorWidth)):320};}catch{return {...defaults};}}
export function saveWorkspace(storage:Storage|undefined,id:string,state:WorkspaceState){try{storage?.setItem('screendraft:workspace:v1:'+id,JSON.stringify(state));}catch{/* 表示設定の保存失敗で編集を中断しない。 */}}

// 古い通信の成功・失敗を、移動後の画面へ反映しない。
export class LatestRequest {
 private generation=0;
 invalidate(){this.generation++;}
 checkpoint(){const version=this.generation;return ()=>version===this.generation;}
 async run(operation:(current:()=>boolean)=>Promise<void>){
  this.invalidate();const current=this.checkpoint();
  try{await operation(current);}catch(error){if(current())throw error;}
 }
}
