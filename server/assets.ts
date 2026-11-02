import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

export interface AssetStore {
  put(id: string, bytes: Buffer): Promise<void>;
  get(id: string): Promise<Buffer>;
}
export class LocalAssetStore implements AssetStore {
  constructor(private root: string) {}
  async put(id: string, bytes: Buffer) { await mkdir(this.root, { recursive: true }); await writeFile(join(this.root, id), bytes, { flag: 'w' }); }
  get(id: string) { if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('invalid asset id'); return readFile(join(this.root, id)); }
}
export const hash = (v: string | Buffer) => createHash('sha256').update(v).digest('hex');
