import {build}from'esbuild';
await build({entryPoints:['desktop/backend.ts'],outfile:'dist-desktop/backend.cjs',bundle:true,packages:'external',platform:'node',format:'cjs',target:'node24'});
console.log('Desktop backend: dist-desktop/backend.cjs');
