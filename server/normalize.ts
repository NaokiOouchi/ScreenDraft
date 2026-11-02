import { parse, serialize } from 'parse5';
import postcss from 'postcss';
import valueParser from 'postcss-value-parser';
import { hash, type AssetStore } from './assets.js';
import type { Capture } from '../shared/types.js';

type HtmlNode = any;
export const replayCsp = "default-src 'none'; script-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; media-src 'self' data:; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'self'; sandbox";
const cleanUrl = (v: string) => { try { const u = new URL(v); return /^https?:$/.test(u.protocol) ? u.origin + u.pathname : '(非対応のURL)'; } catch { return '(不正なURL)'; } };
function mimeFor(mime: string, url: string) {
  if (/^(image\/(png|jpeg|gif|webp|avif|svg\+xml|x-icon)|font\/[a-z0-9-]+|application\/(font-woff|vnd.ms-fontobject)|text\/css|audio\/[a-z0-9-]+|video\/[a-z0-9-]+)$/.test(mime)) return mime;
  if (/\.woff2?(\?|$)/i.test(url)) return /\.woff2/i.test(url) ? 'font/woff2' : 'font/woff';
  if (/\.ttf(\?|$)/i.test(url)) return 'font/ttf';
  if (/\.otf(\?|$)/i.test(url)) return 'font/otf';
  return null;
}

export async function normalizeCapture(capture: Capture, store: AssetStore, storedAsset?: (id:string)=>boolean,options?:{maxResourceBytes:number}) {
  const warnings = new Set(capture.warnings);
  const assets = new Map<string, { id: string; mime: string; bytes: Buffer }>();
  let total = 0;
  for (const resource of capture.resources) {
    const mime = mimeFor(resource.mime, resource.url);
    if (!mime) { warnings.add('対応していない資産形式: ' + cleanUrl(resource.url)); continue; }
    const bytes = Buffer.from(resource.base64, 'base64'); total += bytes.length;
    if (bytes.length > 8 * 1024 * 1024 || total > (options?.maxResourceBytes||32 * 1024 * 1024)) throw new Error('保存できる資産サイズを超えています。');
    assets.set(resource.url, { id: hash(resource.url + ':' + hash(bytes)), mime, bytes });
  }
  // CSS identities include the dependency bundle: unchanged CSS can point at changed images.
  // This keeps older snapshots immutable without needing a cycle-sensitive CSS graph hash.
  const bundleHash = hash([...assets].map(([url,a])=>url+':'+a.id).sort().join('\n'));
  for (const [url,asset] of assets) if(asset.mime==='text/css') asset.id=hash(url+':'+hash(asset.bytes)+':'+bundleHash);
  const resolve = (raw: string, base: string): string => {
    if (!raw || raw==='data:,' || raw.startsWith('#')) return raw;
    if (/^data:(image\/(png|jpeg|gif|webp|avif|svg\+xml)|font\/woff2?|application\/font-woff)[;,]/i.test(raw)) return raw;
    if (/^data:/i.test(raw)) { warnings.add('対応していない埋め込みリソースを除外しました。'); return 'data:,'; }
    let url: URL;
    try { url = new URL(raw, base); } catch { warnings.add('不正な資産URLを除去しました。'); return 'data:,'; }
    const fragment = url.hash; url.hash = '';
    const stored = url.pathname.match(/^\/api\/assets\/([a-f0-9]{64})$/);
    if(stored && storedAsset?.(stored[1])) return '/api/assets/'+stored[1]+fragment;
    const asset = assets.get(url.href) || assets.get(raw);
    if (!asset) { warnings.add('資産が不足しています: ' + cleanUrl(url.href)); return 'data:,'; }
    return '/api/assets/' + asset.id + fragment;
  };
  const rewriteValue = (value: string, base: string, isImport = false) => {
    const parsed = valueParser(value);
    parsed.walk(n => {
      if (n.type === 'function' && n.value.toLowerCase() === 'url') {
        const raw = valueParser.stringify(n.nodes).trim().replace(/^(['"])([\s\S]*)\1$/, '$2');
        n.nodes = [{ type: 'string', quote: '"', value: resolve(raw, base), sourceIndex: 0, sourceEndIndex: 0 }];
        return false;
      }
    });
    if (isImport && parsed.nodes[0]?.type === 'string') parsed.nodes[0].value = resolve(parsed.nodes[0].value, base);
    return parsed.toString();
  };
  const rewriteCss = (css: string, base: string) => {
    try {
      const root = postcss.parse(css);
      root.walkDecls(d => { d.value = rewriteValue(d.value, base); });
      root.walkAtRules(r => { if (r.name.toLowerCase() === 'import') r.params = rewriteValue(r.params, base, true); });
      return root.toString().replace(/<\/style/gi, '<\\/style');
    } catch { warnings.add('読み取れないCSSがありました。'); return ''; }
  };
  for (const [url, asset] of assets) {
    if (asset.mime === 'text/css') asset.bytes = Buffer.from(rewriteCss(asset.bytes.toString('utf8'), url));
    await store.put(asset.id, asset.bytes);
  }
  const css = capture.stylesheets.map(sheet => {
    if (sheet.css !== null) return rewriteCss(sheet.css, sheet.url);
    const asset = assets.get(sheet.url);
    if (asset?.mime === 'text/css') { const rules=asset.bytes.toString('utf8'); return sheet.media && sheet.media!=='all' ? '@media '+sheet.media+'{'+rules+'}' : rules; }
    warnings.add('スタイルシートを取得できませんでした: ' + cleanUrl(sheet.url));
    return '';
  }).join('\n');
  const doc = parse(capture.html);
  const reservedIds=new Set<string>();
  const reserve=(node:HtmlNode)=>{for(const a of node.attrs||[])if(a.name==='data-cn-id')reservedIds.add(a.value);for(const child of node.childNodes||[])reserve(child);};reserve(doc);
  const seenIds = new Set<string>(); let fallbackId = 0;
  const blocked = new Set(['script', 'noscript', 'style', 'link', 'meta', 'base', 'iframe', 'object', 'embed', 'template', 'foreignObject', 'animate', 'animateTransform', 'set']);
  const clean = (node: HtmlNode) => {
    if (!node.childNodes) return;
    node.childNodes = node.childNodes.filter((n: HtmlNode) => !blocked.has(n.tagName));
    for (const child of node.childNodes as HtmlNode[]) {
      if (child.attrs) {
        child.attrs = child.attrs.filter((a: any) => !/^on/i.test(a.name) && !['srcdoc', 'nonce', 'integrity', 'autofocus', 'contenteditable', 'action', 'formaction', 'ping', 'target', 'download', 'srcset'].includes(a.name));
        const get = (name: string) => child.attrs.find((a: any) => a.name === name);
        const set = (name: string, value: string) => { const a = get(name); if (a) a.value = value; else child.attrs.push({ name, value }); };
        let id = get('data-cn-id')?.value;
        if (!id || seenIds.has(id)) { do { id = 's' + (++fallbackId); } while (seenIds.has(id)||reservedIds.has(id)); set('data-cn-id', id); }
        seenIds.add(id);
        for (const attr of child.attrs) {
          if (['src', 'poster', 'background'].includes(attr.name)) attr.value = resolve(attr.value, capture.baseUrl);
          if (attr.name === 'style') attr.value = rewriteCss('x{' + attr.value + '}', capture.baseUrl).replace(/^x\{/, '').replace(/\}$/, '');
          if (attr.name === 'href') {
            if (child.tagName === 'a' || child.tagName === 'area') attr.value = attr.value.startsWith('#') ? attr.value : '#';
            else if (!attr.value.startsWith('#')) attr.value = resolve(attr.value, capture.baseUrl);
          }
        }
        if (child.tagName === 'input' && ['password', 'file', 'hidden'].includes(get('type')?.value?.toLowerCase())) set('value', '');
        if (child.tagName === 'button') set('type', 'button');
      }
      clean(child);
    }
  };
  clean(doc);
  const html = doc.childNodes.find((n: HtmlNode) => n.tagName === 'html') as HtmlNode;
  const head = html.childNodes.find((n: HtmlNode) => n.tagName === 'head') as HtmlNode;
  const text: HtmlNode = { nodeName: '#text', value: css };
  const style: HtmlNode = { nodeName: 'style', tagName: 'style', namespaceURI: 'http://www.w3.org/1999/xhtml', attrs: [], childNodes: [text], parentNode: head };
  text.parentNode=style;
  head.childNodes.push(style);
  const serialized=serialize(doc);
  return { resourceMap:Object.fromEntries([...assets].map(([url,a])=>[url,a.id])), html: (/^<!doctype/i.test(serialized)?'':'<!doctype html>') + serialized, warnings: [...warnings], assets: [...assets.values()].map(a => ({ id: a.id, mime: a.mime, size: a.bytes.length })) };
}
