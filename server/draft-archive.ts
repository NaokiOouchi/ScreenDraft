import {z} from 'zod';
import {zipSync,unzipSync,strToU8,strFromU8} from 'fflate';
import {hash} from './assets.js';
const id=z.string().regex(/^[a-zA-Z0-9-]{1,80}$/),text=z.string().max(10000);
const screen=z.object({id,title:z.string().min(1).max(300),sourceUrl:z.string().max(8192),snapshotId:id,width:z.number().int().min(200).max(7680),height:z.number().int().min(100).max(7680),createdAt:z.iso.datetime(),warnings:z.array(z.string().max(2000)).max(1000),assetCount:z.number().int().min(0).max(2000)}).strict();
const schema=z.object({format:z.literal('ScreenDraft'),version:z.literal(1),title:z.string().min(1).max(120),description:text,screenNotes:z.record(id,text).default({}),head:id.nullable(),revisions:z.array(z.object({id,parentId:id.nullable(),createdAt:z.iso.datetime(),screens:z.array(screen).max(500)}).strict()).max(1000),snapshots:z.array(z.object({id,html:z.string().min(1).max(8*1024*1024)}).strict()).max(2000),assets:z.array(z.object({id:z.string().regex(/^[a-f0-9]{64}$/),mime:z.string().max(200),base64:z.string().max(24*1024*1024)}).strict()).max(1000)}).strict();
export type DraftArchive=z.infer<typeof schema>;
const fail=()=>{throw Object.assign(Error('ScreenDraftファイルが不正、未対応、または上限を超えています。'),{statusCode:400});};
function validate(value:unknown){const parsed=schema.safeParse(value);if(!parsed.success)return fail();const a=parsed.data;
 const revisions=new Set<string>(),snapshots=new Set(a.snapshots.map(s=>s.id)),assets=new Set(a.assets.map(s=>s.id));if(snapshots.size!==a.snapshots.length||assets.size!==a.assets.length)fail();
 for(const r of a.revisions){if(revisions.has(r.id)||r.parentId&&!revisions.has(r.parentId))fail();const screens=new Set<string>();for(const s of r.screens){if(screens.has(s.id)||!snapshots.has(s.snapshotId))fail();screens.add(s.id);}revisions.add(r.id);}
 if(a.head!==null&&!revisions.has(a.head)||a.head===null&&a.revisions.length||a.revisions.length&&a.head!==a.revisions.at(-1)!.id)fail();return a;
}
export function encodeArchive(value:DraftArchive){const a=validate(value),files:Record<string,Uint8Array>=Object.create(null);
 const snapshots=a.snapshots.map(s=>{const path='snapshots/'+s.id+'.html',bytes=strToU8(s.html);files[path]=bytes;return {id:s.id,path,sha256:hash(Buffer.from(bytes))};});
 const assets=a.assets.map(s=>{const path='assets/'+s.id,bytes=Buffer.from(s.base64,'base64');files[path]=bytes;return {id:s.id,mime:s.mime,path,sha256:hash(Buffer.from(bytes))};});
 files['manifest.json']=strToU8(JSON.stringify({...a,snapshots,assets}));
 const entries=Object.entries(files);if(entries.length>4001||entries.some(([path,bytes])=>bytes.length>(path.startsWith('assets/')?8:24)*1024*1024)||entries.reduce((sum,[,bytes])=>sum+bytes.length,0)>128*1024*1024)fail();
 const bytes=zipSync(files,{level:6});if(bytes.length>64*1024*1024)fail();return bytes;
}
export function decodeArchive(bytes:Uint8Array):DraftArchive{try{
 if(bytes.length>64*1024*1024||bytes.length<22)fail();
 // 展開前に中央ディレクトリで重複パスと展開サイズを検証する。ZIP64は対象外。
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let end=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(view.getUint32(i,true)===0x06054b50&&i+22+view.getUint16(i+20,true)===bytes.length){end=i;break;}if(end<0)fail();
 const count=view.getUint16(end+10,true);if(count>4001||view.getUint16(end+4,true)||view.getUint16(end+6,true)||view.getUint16(end+8,true)!==count)fail();
 let at=view.getUint32(end+16,true),total=0;const paths=new Set<string>();for(let n=0;n<count;n++){if(view.getUint32(at,true)!==0x02014b50)fail();const size=view.getUint32(at+24,true),len=view.getUint16(at+28,true),extra=view.getUint16(at+30,true),comment=view.getUint16(at+32,true),path=strFromU8(bytes.slice(at+46,at+46+len));if(!/^(manifest\.json|snapshots\/[a-zA-Z0-9-]{1,80}\.html|assets\/[a-f0-9]{64})$/.test(path)||paths.has(path)||size>24*1024*1024||(total+=size)>128*1024*1024)fail();paths.add(path);at+=46+len+extra+comment;}if(at!==end)fail();
 const files=unzipSync(bytes);if(Object.keys(files).length!==paths.size||!files['manifest.json'])fail();const m=JSON.parse(strFromU8(files['manifest.json']));if(m.format!=='ScreenDraft'||m.version!==1||!Array.isArray(m.snapshots)||!Array.isArray(m.assets))fail();
 const used=new Set(['manifest.json']);const read=(p:any,expected:string)=>{if(p.path!==expected||used.has(p.path)||!files[p.path]||hash(Buffer.from(files[p.path]))!==p.sha256)fail();used.add(p.path);return files[p.path];};
 const snapshots=m.snapshots.map((s:any)=>({id:s.id,html:strFromU8(read(s,'snapshots/'+s.id+'.html'))}));const assets=m.assets.map((a:any)=>({id:a.id,mime:a.mime,base64:Buffer.from(read(a,'assets/'+a.id)).toString('base64')}));if(used.size!==paths.size)fail();return validate({...m,snapshots,assets});
 }catch{return fail();}}
