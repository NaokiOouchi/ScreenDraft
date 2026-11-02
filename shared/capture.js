/** Self-contained, read-only collector. Used by the extension, sample importer and browser verification. */
export function captureDocument(doc = document) {
  const win = doc.defaultView;
  const baseUrl = doc.baseURI || doc.URL;
  const warnings = [];
  const resourceUrls = new Set();
  let nextId = 0;
  const escape = (s) => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  const absolute = (raw) => { try { return new URL(raw, baseUrl).href; } catch { return raw; } };
  const resource = (raw) => {
    const url = absolute(raw);
    if (/^https?:/.test(url)) { const assetUrl = new URL(url); assetUrl.hash = ''; resourceUrls.add(assetUrl.href); }
    return url;
  };
  const voids = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
  const omitted = new Set(['script', 'noscript', 'style', 'link', 'base', 'meta', 'template']);
  const serialize = (node) => {
    if (node.nodeType === 3) return escape(node.textContent || '');
    if (node.nodeType !== 1) return '';
    const el = node;
    let tag = el.localName;
    let canvasImage;
    if (tag === 'canvas') {
      try { canvasImage = el.toDataURL('image/png'); if (!canvasImage.startsWith('data:image/png;base64,') || canvasImage.length > 8 * 1024 * 1024) throw new Error('canvas size'); warnings.push('Canvasは取り込み時点の画像として保存しました。'); }
      catch { warnings.push('Canvasを画像化できませんでした。グラフが表示されない場合があります。'); }
    }
    if (omitted.has(tag)) return '';
    if (['iframe', 'object', 'embed', 'foreignObject'].includes(tag)) {
      warnings.push('埋め込み画面は保存対象外です。');
      return '<div data-cn-placeholder="embedded">埋め込み画面（取り込み対象外）</div>';
    }
    if (tag === 'input' && ['password', 'hidden', 'file'].includes(el.type)) {
      if (el.type === 'hidden') return '';
      return '<input data-cn-id="n' + (++nextId) + '" type="' + escape(el.type) + '" disabled value="">';
    }
    if (el.shadowRoot) warnings.push('Shadow DOMの内部は現在の取得対象外です。');
    const attrs = new Map(Array.from(el.attributes, (a) => [a.name, a.value]));
    attrs.set('data-cn-id', 'n' + (++nextId));
    for (const key of [...attrs.keys()]) {
      if (/^on/i.test(key) || key.startsWith('data-cn-') && key !== 'data-cn-id' || ['nonce', 'integrity', 'srcdoc', 'contenteditable', 'autofocus', 'action', 'formaction', 'ping'].includes(key)) attrs.delete(key);
    }
    if (tag === 'input') {
      attrs.set('value', el.value);
      if (el.checked) attrs.set('checked', ''); else attrs.delete('checked');
    }
    if (attrs.has('style')) {
      const pattern = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)]*))\s*\)/gi;
      for (const match of attrs.get('style').matchAll(pattern)) { const raw = match[1] ?? match[2] ?? match[3]; if (raw && !raw.startsWith('#') && !raw.startsWith('data:')) resource(raw); }
    }
    if (tag === 'option') { if (el.selected) attrs.set('selected', ''); else attrs.delete('selected'); }
    if (tag === 'details') { if (el.open) attrs.set('open', ''); else attrs.delete('open'); }
    if (tag === 'button') attrs.set('type', 'button');
    if (tag === 'img') {
      attrs.set('src', resource(el.currentSrc || el.src));
      attrs.delete('srcset'); attrs.delete('sizes'); attrs.set('loading', 'eager');
    } else if (attrs.has('src')) attrs.set('src', resource(attrs.get('src')));
    if (attrs.has('poster')) attrs.set('poster', resource(attrs.get('poster')));
    if (tag === 'source') { attrs.delete('srcset'); attrs.delete('src'); }
    if (tag === 'a' || tag === 'area') {
      const href = attrs.get('href') || '';
      attrs.set('data-cn-original-href', href.startsWith('#') ? href : absolute(href));
      attrs.set('href', href.startsWith('#') ? href : '#'); attrs.delete('target'); attrs.delete('download');
    }
    if (canvasImage) {
      const style = win.getComputedStyle(el);
      attrs.set('src', canvasImage); attrs.set('alt', el.getAttribute?.('aria-label') || '取り込み時点のグラフ');
      attrs.set('style', (attrs.get('style') || '') + ';width:' + style.width + ';height:' + style.height + ';display:' + style.display + ';');
      attrs.set('width', String(el.width)); attrs.set('height', String(el.height)); tag = 'img';
    }
    const attrText = Array.from(attrs, ([k, v]) => ' ' + k + '="' + escape(v) + '"').join('');
    if (voids.has(tag)) return '<' + tag + attrText + '>';
    const content = tag === 'textarea' ? escape(el.value) : Array.from(el.childNodes, serialize).join('');
    return '<' + tag + attrText + '>' + content + '</' + tag + '>';
  };
  const stylesheets = Array.from(doc.styleSheets).filter(sheet=>!sheet.disabled).map((sheet) => {
    try { const rules = Array.from(sheet.cssRules, (r) => r.cssText).join('\n'); const media = sheet.media?.mediaText; return { url: sheet.href || baseUrl, css: media && media !== 'all' ? '@media '+media+'{'+rules+'}' : rules }; }
    catch { return { url: sheet.href || baseUrl, css: null, media: sheet.media?.mediaText || '' }; }
  });
  const html = serialize(doc.documentElement);
  const safeUrl = new URL(doc.URL); safeUrl.username = ''; safeUrl.password = ''; safeUrl.search = ''; safeUrl.hash = '';
  const cleanName=value=>{const text=String(value||'').trim().replace(/\s+/g,' ');return /^[\/#\s]*$/.test(text)?'':text;};
  const pageUrl=raw=>{try{const url=new URL(raw,baseUrl);if(!/^https?:$/.test(url.protocol)||url.username||url.password||url.hash)return '';return url.href;}catch{return '';}};
  const currentUrl=new URL(doc.URL);currentUrl.hash='';
  const samePageLinks=Array.from(doc.querySelectorAll?.('a[href]')||[]).filter(a=>pageUrl(a.href)===currentUrl.href&&!a.hasAttribute?.('download'));
  const navigationName=samePageLinks.map(a=>cleanName(a.getAttribute?.('aria-label'))||cleanName(a.textContent)||cleanName(a.getAttribute?.('title'))).find(Boolean);
  const headingName=['main h1, [role=main] h1','h1','main h2, [role=main] h2'].map(selector=>cleanName(doc.querySelector?.(selector)?.textContent)).find(Boolean);
  const screenTitle=navigationName||headingName||cleanName(doc.title)||(currentUrl.pathname==='/'?'トップページ':currentUrl.pathname);
  return {
    textPreview: (doc.body?.innerText || '').slice(0,3000),
    schemaVersion: 1, documentTitle: doc.title, title: screenTitle.slice(0,300), sourceUrl: safeUrl.href, baseUrl: baseUrl,
    viewport: { width: win.innerWidth, height: win.innerHeight }, html, stylesheets,
    resourceUrls: [...resourceUrls], resources: [], warnings: [...new Set(warnings)], capturedAt: new Date().toISOString(),
  };
}

/** Read CSS URL tokens without dropping @layer/@media/@import or rewriting the cascade. */
export function cssResourceUrls(css, baseUrl) {
  const urls = [];
  const pattern = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)]*))\s*\)|@import\s+(?:"([^"]+)"|'([^']+)')/gi;
  for (const match of css.matchAll(pattern)) {
    const raw = match[1] ?? match[2] ?? match[3] ?? match[4] ?? match[5];
    if (!raw || raw.startsWith('#') || raw.startsWith('data:')) continue;
    try { const url = new URL(raw, baseUrl); if (/^https?:$/.test(url.protocol)) { url.hash = ''; urls.push(url.href); }; } catch { /* invalid URL is handled during server normalization */ }
  }
  return [...new Set(urls)];
}

export async function collectResources(capture, fetcher = fetch) {
  const warnings = capture.warnings.filter(w=>!w.startsWith('資産を取得できませんでした:') && w!=='資産取得の上限に達しました。');
  const queue = [...capture.resourceUrls];
  for (const sheet of capture.stylesheets) {
    if (sheet.css === null) queue.push(sheet.url);
    else queue.push(...cssResourceUrls(sheet.css, sheet.url));
  }
  const resources = [...capture.resources], seen = new Set(resources.map(r=>r.url));
  let bytes = resources.reduce((sum,r)=>sum + Math.ceil(r.base64.length * 3 / 4),0);
  while (queue.length && seen.size < 250) {
    const url = queue.shift();
    if (seen.has(url)) continue;
    seen.add(url);
    try {
      const response = await fetcher(url);
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const mime = (response.headers.get('content-type') || 'application/octet-stream').split(';')[0];
      const buffer = new Uint8Array(await response.arrayBuffer());
      bytes += buffer.byteLength;
      if (buffer.byteLength > 8 * 1024 * 1024 || bytes > 32 * 1024 * 1024) throw new Error('資産サイズの上限を超えました');
      let binary = ''; for (let i = 0; i < buffer.length; i += 8192) binary += String.fromCharCode(...buffer.subarray(i, i + 8192));
      resources.push({ url, mime, base64: btoa(binary) });
      if (mime === 'text/css') queue.push(...cssResourceUrls(new TextDecoder().decode(buffer), url));
    } catch { warnings.push('資産を取得できませんでした: ' + new URL(url).origin + new URL(url).pathname); }
  }
  if (queue.length) warnings.push('資産取得の上限に達しました。');
  return { ...capture, resourceUrls: [...seen], resources, warnings: [...new Set(warnings)] };
}

/** Host permissions for assets still absent from the captured bundle. */
export function missingAssetOrigins(captures) {
  const origins = new Set();
  for (const capture of captures) {
    const downloaded = new Set(capture.resources.map(r=>r.url));
    const urls = [...capture.resourceUrls,...capture.stylesheets.flatMap(s=>s.css===null?[s.url]:cssResourceUrls(s.css,s.url))];
    for (const raw of urls) {
      if (downloaded.has(raw)) continue;
      try { const url = new URL(raw); if (/^https?:$/.test(url.protocol)) origins.add(url.protocol+'//'+url.hostname+'/*'); } catch { /* malformed URLs are reported by normalization */ }
    }
  }
  return [...origins];
}
