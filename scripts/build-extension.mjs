import {mkdir,cp,copyFile,readFile,writeFile,readdir} from 'node:fs/promises';
await mkdir('dist-extension',{recursive:true});
await cp('extension','dist-extension',{recursive:true});
await copyFile('LICENSE','dist-extension/LICENSE');
for(const name of ['capture.js','batch-import.js','import-ux.js','import-target.js'])await copyFile('shared/'+name,'dist-extension/'+name);
for(const file of await readdir('extension'))if(file.endsWith('.js')){const path='dist-extension/'+file;await writeFile(path,(await readFile(path,'utf8')).replaceAll('../shared/','./'));}
console.log('Chrome extension: dist-extension');
