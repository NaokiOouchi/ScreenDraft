import {parse,parseFragment,serialize} from 'parse5';
import {z} from 'zod';
import {normalizeCapture} from './normalize.js';
import type {AssetStore} from './assets.js';
import type {EditScope,EditResult} from '../shared/editor-types.js';
type N=any;
const attr=(n:N,key:string)=>n.attrs?.find((a:N)=>a.name===key)?.value;
function nodes(root:N):N[]{return [root,...(root.childNodes||[]).flatMap(nodes)];}
export function editContext(html:string,ids:string[]){
 const doc=parse(html),all=nodes(doc),byId=new Map<string,N>(all.filter(n=>attr(n,'data-cn-id')).map(n=>[attr(n,'data-cn-id'),n]));
 const scopes:EditScope[]=[];
 for(const id of ids){let el=byId.get(id);if(!el||['html','head','body','style','script'].includes(el.tagName))throw Object.assign(new Error('編集対象を選び直してください。'),{statusCode:400});
  const selected=el;
  if(['th','td','tr','thead','tbody','tfoot','col','colgroup'].includes(el.tagName)){let p=el.parentNode;while(p){if(p.tagName==='table'){el=p;break;}p=p.parentNode;}}
  const scopeId=attr(el,'data-cn-id');const contained=scopes.find(s=>nodes(byId.get(s.id)).includes(el));if(contained){contained.selectedIds.push(id);continue;}
  for(let i=scopes.length-1;i>=0;i--)if(nodes(el).includes(byId.get(scopes[i].id)))scopes.splice(i,1);
  scopes.push({id:scopeId,tag:el.tagName,html:serialize({nodeName:'#document-fragment',childNodes:[el]} as N),selectedIds:[attr(selected,'data-cn-id')]});
 }
 if(scopes.reduce((n,s)=>n+s.html.length,0)>90000)throw Object.assign(new Error('選択範囲が大きすぎます。小さい範囲を選んでください。'),{statusCode:400});
 const css=all.filter(n=>n.tagName==='style').map(n=>n.childNodes.map((t:N)=>t.value||'').join('')).join('\n').slice(0,60000);
 return {scopes,css};
}
export const editResultSchema=z.object({summary:z.string().min(1).max(1200),replacements:z.array(z.object({targetId:z.string().min(1).max(100),html:z.string().min(1).max(160000)}).strict()).min(1).max(8)}).strict();
export function outputSchema(scopes:EditScope[]){return {type:'object',additionalProperties:false,properties:{summary:{type:'string'},replacements:{type:'array',minItems:1,maxItems:scopes.length,items:{type:'object',additionalProperties:false,properties:{targetId:{type:'string',enum:scopes.map(s=>s.id)},html:{type:'string'}},required:['targetId','html']}}},required:['summary','replacements']};}
export async function applyEdit(html:string,scopes:EditScope[],raw:EditResult,store:AssetStore,knownAsset:(id:string)=>boolean){
 const result=editResultSchema.parse(raw),doc=parse(html),all=nodes(doc),seen=new Set<string>();
 for(const replacement of result.replacements){
  if(seen.has(replacement.targetId)||!scopes.some(s=>s.id===replacement.targetId))throw new Error('AIが選択範囲外を変更しようとしました。');seen.add(replacement.targetId);
  const target=all.find(n=>attr(n,'data-cn-id')===replacement.targetId);if(!target)throw new Error('対象DOMが見つかりません。');
  const fragment=(parseFragment as any)(target.parentNode,replacement.html) as N;
  const roots=fragment.childNodes.filter((n:N)=>n.tagName);if(roots.length!==1||fragment.childNodes.some((n:N)=>n.nodeName==='#text'&&n.value.trim())||(attr(roots[0],'data-cn-id')!==replacement.targetId||roots[0].tagName!==target.tagName))throw new Error('編集対象の識別子が変わりました。再実行してください。');
  const outsideIds=new Set(all.filter(n=>!nodes(target).includes(n)).map(n=>attr(n,'data-cn-id')).filter(Boolean)),newIds=new Set<string>();
  for(const n of nodes(fragment)){
   if(['script','style','link','meta','base','iframe','object','embed','template','foreignObject','animate','animateTransform','set'].includes(n.tagName))throw new Error('AIの結果に実行コードや埋め込みが含まれています。');
   const id=attr(n,'data-cn-id');if(id&&(newIds.has(id)||outsideIds.has(id)))throw new Error('DOM識別子が重複しています。');if(id)newIds.add(id);
   for(const a of n.attrs||[]){if(/^on/i.test(a.name)||['srcdoc','action','formaction'].includes(a.name)||/^javascript:/i.test(a.value))throw new Error('AIの結果に許可されない操作が含まれています。');}
  }
  const index=target.parentNode.childNodes.indexOf(target);roots[0].parentNode=target.parentNode;target.parentNode.childNodes.splice(index,1,roots[0]);
 }
 const updated=serialize(doc),css=nodes(doc).filter(n=>n.tagName==='style').map(n=>n.childNodes.map((c:N)=>c.value||'').join(''));
 const normalized=await normalizeCapture({schemaVersion:1,title:'編集候補',sourceUrl:'http://localhost/',baseUrl:'http://localhost/',viewport:{width:1280,height:900},html:updated,stylesheets:css.map(css=>({url:'http://localhost/',css})),resources:[],resourceUrls:[],warnings:[],capturedAt:new Date().toISOString()},store,knownAsset);
 if(normalized.warnings.length)throw new Error('編集結果に保存できない外部資産やCSSが含まれています。既存のスタイルを使って再実行してください。');
 return normalized.html;
}
