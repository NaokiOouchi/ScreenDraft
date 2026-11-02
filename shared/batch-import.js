/** URL policy shared by discovery, the selection UI, and the Chrome adapter. */
export function candidateUrl(raw, sourceUrl, text = '') {
  try {
    const url = new URL(raw, sourceUrl), source = new URL(sourceUrl);
    if (!/^https?:$/.test(url.protocol) || url.origin !== source.origin || url.username || url.password) return null;
    const path = decodeURIComponent(url.pathname);
    if (/(?:^|\/)(?:api|logout|log-out|signout|sign-out|delete|destroy|remove|unsubscribe)(?:\/|\.|$)/i.test(path)) return null;
    if (/ログアウト|サインアウト|削除|退会|購入|送信|解約/.test(text)) return null;
    for (const [key, value] of url.searchParams) {
      if (/token|secret|password|signature|api[_-]?key|^code$|^auth$/i.test(key)) return null;
      if (/^(action|do|operation|method)$/i.test(key) && /delete|remove|destroy|logout|signout|unsubscribe|purchase/i.test(value)) return null;
    }
    url.hash = '';
    return url.href;
  } catch { return null; }
}
export function collectLinkCandidates({sourceUrl, title, links}) {
  const source = new URL(sourceUrl);
  if (!/^https?:$/.test(source.protocol)) throw new Error('HTTPまたはHTTPSの画面で実行してください。');
  const clean=value=>{const text=String(value||'').trim().replace(/\s+/g,' ');return /^[\/#\s]*$/.test(text)?'':text;};
  const linkName=link=>clean(link.text);
  const labelFor=url=>links.find(link=>!link.download&&linkName(link)&&candidateUrl(link.href,sourceUrl,link.text)===url);
  const candidates = [], seen = new Set(); let excluded = 0, truncated = false;
  for (const link of [{href:sourceUrl,text:''}, ...links]) {
    const url = candidateUrl(link.href, sourceUrl, link.text);
    if (!url || link.download) { excluded++; continue; }
    if (seen.has(url)) continue; seen.add(url);
    if (candidates.length === 50) { truncated = true; continue; }
    const label=linkName(labelFor(url)||{});
    const current=url===candidateUrl(sourceUrl,sourceUrl);
    const fallback=new URL(url).pathname==='/'?'トップページ':new URL(url).pathname;
    candidates.push({id:'c'+candidates.length,url,title:(label||(current&&clean(title))||fallback).slice(0,160),titleSource:label?'link':current&&clean(title)?'document':'url'});
  }
  return {origin:source.origin,candidates,excluded,truncated};
}
/** Collector injected into the source tab. Reads links only; never clicks or changes DOM. */
export function documentLinks() {
  return {sourceUrl:location.href,title:document.title,links:Array.from(document.querySelectorAll('a[href]')).slice(0,2000).map(a=>({href:a.href,text:(a.getAttribute('aria-label')||a.textContent||'').trim(),download:a.hasAttribute('download')}))};
}
export class BatchImport {
  constructor(items, {capture, save, onChange = () => {}}) {
    this.items = items.map(item=>({...item,status:'pending',importId:crypto.randomUUID(),capture:null,error:'',saved:null}));
    this.capture = capture; this.save = save; this.onChange = onChange; this.busy = false; this.stopped = false; this.controller = null; this.mode = '';
  }
  changed() { this.onChange(this); }
  async acquire(ids) {
    if (this.busy) throw new Error('現在の処理が終わるまでお待ちください。');
    const unique = [...new Set(ids)];
    if (!unique.length || unique.length > 10) throw new Error('取り込む画面は1〜10件を選択してください。');
    if (unique.some(id=>!this.items.some(item=>item.id===id))) throw new Error('対象画面が見つかりません。');
    this.busy = true; this.stopped = false; this.mode = 'acquire'; this.controller = new AbortController(); this.changed();
    try {
      for (const item of this.items.filter(item=>unique.includes(item.id) && ['pending','failed'].includes(item.status))) {
        if (this.stopped) break;
        item.status = 'acquiring'; item.error = ''; this.changed();
        try { const result = await this.capture(item.url,this.controller.signal); this.controller.signal.throwIfAborted(); item.capture = result; item.title = item.titleSource&&item.titleSource!=='link'&&!item.titleEdited ? result.title : item.title?.trim() || result.title; item.status = 'ready'; }
        catch (error) { item.status = this.stopped ? 'pending' : 'failed'; item.error = this.stopped ? '' : (error?.message || '取得できませんでした。'); }
        this.changed();
      }
    } finally { this.busy = false; this.controller = null; this.mode = ''; this.changed(); }
  }
  async saveReady(ids = this.items.map(item=>item.id)) {
    if (this.busy) throw new Error('現在の処理が終わるまでお待ちください。');
    this.busy = true; this.stopped = false; this.mode = 'save'; this.changed();
    try {
      for (const item of this.items.filter(item=>ids.includes(item.id) && ['ready','save-failed'].includes(item.status))) {
        if (this.stopped) break;
        item.status = 'saving'; item.error = ''; this.changed();
        try { item.saved = await this.save(item); item.status = 'saved'; item.capture = null; }
        catch (error) { item.status = 'save-failed'; item.error = error?.message || '保存できませんでした。'; }
        this.changed();
      }
    } finally { this.busy = false; this.mode = ''; this.changed(); }
  }
  cancel() { this.stopped = true; if (this.mode === 'acquire') this.controller?.abort(); this.changed(); }
}
