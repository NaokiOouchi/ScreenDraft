const {readFile,writeFile,rename,mkdir}=require('node:fs/promises');
const {dirname}=require('node:path');
const {randomUUID}=require('node:crypto');
function validatePort(port){if(port===null)return null;if(typeof port!=='number'||!Number.isInteger(port)||port<1024||port>65535)throw new Error('ポートは1024〜65535の整数で指定してください。');return port;}
function portCandidates(port){return validatePort(port)===null?[4173,4175,4176,4177,4178,4179]:[port];}
async function readSettings(file){let raw;try{raw=await readFile(file,'utf8');}catch(error){if(error.code==='ENOENT')return{port:null};throw error;}try{return{port:validatePort(JSON.parse(raw).port)};}catch{throw new Error('接続ポートの設定を読み込めません。自動設定に戻して起動できます。');}}
async function writeSettings(file,value){const port=validatePort(value?.port);await mkdir(dirname(file),{recursive:true});const temporary=file+'.'+randomUUID()+'.tmp';await writeFile(temporary,JSON.stringify({port})+'\n',{mode:0o600});await rename(temporary,file);return{port};}
module.exports={validatePort,portCandidates,readSettings,writeSettings};
