import { z } from 'zod';
const resource = z.object({ url: z.url().max(8192), mime: z.string().max(200), base64: z.string().max(12 * 1024 * 1024) });
export const captureSchema = z.object({
  schemaVersion: z.literal(1), title: z.string().min(1).max(300),
  sourceUrl: z.url().max(8192).refine(v => /^https?:/.test(v), 'HTTPの画面だけ取り込めます'),
  baseUrl: z.url().max(8192).refine(v => /^https?:/.test(v)),
  viewport: z.object({ width: z.number().int().min(200).max(7680), height: z.number().int().min(100).max(7680) }),
  html: z.string().min(1).max(8 * 1024 * 1024),
  stylesheets: z.array(z.object({ url: z.url().max(8192), css: z.string().max(4 * 1024 * 1024).nullable(), media: z.string().max(4000).optional() })).max(150),
  resourceUrls: z.array(z.string().max(8192)).max(2000), resources: z.array(resource).max(250),
  warnings: z.array(z.string().max(2000)).max(1000), capturedAt: z.iso.datetime(),
});
