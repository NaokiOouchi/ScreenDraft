import { resolve } from 'node:path';
import { createApp } from './app.js';
const port=Number(process.env.PORT || 4174);
const app=await createApp({dataDir:resolve(process.env.DATA_DIR || '.data'),port,frontend:process.env.SERVE_CLIENT === '1'});
await app.listen({port,host:'127.0.0.1'});
console.log(`ScreenDraft API: http://127.0.0.1:${port}`);
for (const signal of ['SIGINT','SIGTERM'] as const) process.on(signal,()=>{void app.close().then(()=>process.exit(0));});
