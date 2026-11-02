import {useEffect,useRef,useState} from 'react';
import {House,Monitor,SlidersHorizontal,Export,Question,Database,MagnifyingGlass,CaretRight} from '@phosphor-icons/react';
import {BackupGuide} from './BackupGuide';
import {AiReadinessCard,type AiReadinessState} from './AiReadiness';

export type GuideTopic='setup'|'import'|'editing'|'saving'|'troubleshooting'|'limits';
export type GuideAction='new'|'sample'|'connect'|'select'|'edit'|'compare';
const desktopApp=navigator.userAgent.includes('Electron/');
const topics: {id:GuideTopic;label:string;icon:typeof House;keywords:string}[]=[
 {id:'setup',label:'はじめる',icon:House,keywords:'サンプル ツアー 初めて'},
 {id:'import',label:'画面を取り込む',icon:Monitor,keywords:'chrome 拡張 接続 インストール ドラフト 画面 取得 サンプル'},
 {id:'editing',label:'編集・比較',icon:SlidersHorizontal,keywords:'選択 範囲 ai 指示 比較 履歴 ズーム'},
 {id:'saving',label:'保存・書き出し',icon:Export,keywords:'zip ファイル 復元 バックアップ 削除 再取り込み'},
 {id:'troubleshooting',label:'困ったとき',icon:Question,keywords:'エラー 警告 要確認 フォント 画像 接続 失敗 ログイン ポート'},
 {id:'limits',label:'データと制約',icon:Database,keywords:'個人情報 送信 動画 グラフ 保存 制限'},
];

function ClaudeGuideLink(){
 const [copied,setCopied]=useState(false);
 return <p>Claude Codeの公式ガイド：<code>https://code.claude.com/docs/ja/setup</code> <button className="text-button" onClick={()=>void navigator.clipboard.writeText('https://code.claude.com/docs/ja/setup').then(()=>setCopied(true)).catch(()=>setCopied(false))}>{copied?'コピーしました':'URLをコピー'}</button></p>;
}

export function GettingStarted({topic,setTopic,hasScreen,onAction,aiReadiness,onReplay}:{topic:GuideTopic;setTopic:(topic:GuideTopic)=>void;step:number;setStep:(step:number)=>void;hasScreen:boolean;onAction:(action:GuideAction)=>void;aiReadiness:AiReadinessState;onReplay:()=>void}){
 const [query,setQuery]=useState('');
 const contentRef=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(contentRef.current)contentRef.current.scrollTop=0;},[topic]);
 const matching=query.trim()?topics.filter(item=>(item.label+' '+item.keywords).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())):[];
 return <div className="guide-layout"><nav className="guide-nav" aria-label="使い方の項目"><strong className="guide-nav-title">使い方</strong>{topics.map(item=><button key={item.id} aria-pressed={topic===item.id&&!query.trim()} onClick={()=>{setQuery('');setTopic(item.id);}}><item.icon size={19}/>{item.label}</button>)}</nav><div ref={contentRef} className="guide-content"><div className="guide-topbar"><span>使い方{topic!=='setup'&&' / '+topics.find(item=>item.id===topic)?.label}</span><label className="guide-search"><MagnifyingGlass size={18}/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="使い方を検索" aria-label="使い方を検索"/></label></div>
 {query.trim()?<><h3>検索結果</h3>{matching.length?<div className="guide-cards">{matching.map(item=><button key={item.id} className="guide-card" onClick={()=>{setQuery('');setTopic(item.id);}}><item.icon size={25}/><span><strong>{item.label}</strong></span><CaretRight size={18}/></button>)}</div>:<p>一致する項目はありません。別の言葉で検索してください。</p>}</>:
 topic==='setup'?<><h3>何をしますか？</h3><p>画面を取り込み、変更案を検討できます。<br/>はじめての方はサンプルから試せます。</p><div className="guide-cards"><button className="guide-card" onClick={()=>onAction('sample')}><Monitor size={27}/><span><strong>サンプルで試す</strong><small>画面の取り込みから比較まで試す</small></span><CaretRight size={18}/></button><button className="guide-card" onClick={()=>setTopic('import')}><Monitor size={27}/><span><strong>実画面を取り込む</strong><small>Chromeで表示中の画面を保存する</small></span><CaretRight size={18}/></button><button className="guide-card" onClick={()=>setTopic('troubleshooting')}><Question size={27}/><span><strong>困ったとき</strong><small>接続や取り込みの問題を確認する</small></span><CaretRight size={18}/></button></div><button className="text-button tour-replay" data-tour-replay onClick={onReplay}>ツアーをもう一度見る →</button></>:
 topic==='import'?<><h3>Chromeで画面を取り込む</h3><p>Chromeに表示中の画面をドラフトに保存します。取り込みと表示にAIの準備は必要ありません。</p><ol className="guide-overview"><li><strong>ドラフトを作成する</strong><span>ドラフト一覧で「新しいドラフト」を作成します。</span></li><li><strong>Chrome拡張を接続する</strong><span>拡張機能を読み込み、接続先と接続キーを設定します。</span></li><li><strong>画面を取得して保存する</strong><span>拡張で画面を取得します。プレビューを確認して保存します。</span></li></ol><section><h4>サンプルで試す</h4><p>サンプルを選択してプレビューを確認します。その後に画面を保存します。ドラフト一覧から始めた場合は保存時に練習用のドラフトを作成します。編集中の場合は現在のドラフトに追加します。</p><button className="button secondary" onClick={()=>onAction('sample')}>サンプルで試す</button></section>
 <section><h4>Chrome拡張を準備する</h4><ol><li>「設定 → Chrome拡張」を開きます。「拡張機能の管理画面」のURLをコピーします。Chromeのアドレスバーに貼り付けて開きます。</li><li>Chromeの拡張機能画面で「デベロッパーモード」を有効にします。</li><li>{desktopApp?'設定の「拡張フォルダを開く」を押します。':<>プロジェクトの <code>dist-extension</code> フォルダを確認します。</>}Chromeで「パッケージ化されていない拡張機能を読み込む」を選択します。続けて拡張フォルダを指定します。</li><li>取り込みたいページでScreenDraft拡張を開きます。設定画面の接続先と接続キーを入力します。その後に「接続する」を押します。</li></ol><button className="button secondary" onClick={()=>onAction('connect')}>Chrome拡張の設定を開く</button><p>アプリや拡張を更新した後はChromeの拡張機能画面でScreenDraftの更新ボタンを押してください。</p></section>
 <section><h4>実画面を取り込む</h4><ol><li>ドラフト一覧で「新しいドラフト」を作成します。</li><li>Chromeで取り込みたい画面を表示します。その画面でScreenDraft拡張を開きます。</li><li>保存先のドラフトを選択します。その後に「この画面を取得」を押します。<figure className="guide-figure guide-extension-image"><img src="/guide/chrome-capture.png" alt="Chrome拡張でドラフトを選び、この画面を取得を押す画面"/><figcaption>画面の取得</figcaption></figure></li><li>画面名と保存前プレビューを確認します。必要に応じて不足リソースを再取得します。</li><li>「この画面を保存」を押します。アプリで保存した画面を確認します。<figure className="guide-figure guide-extension-image"><div className="guide-preview-image"><img src="/guide/chrome-save.jpg" alt="保存前のプレビューと、この画面を保存するボタン"/></div><figcaption>プレビューの確認と保存</figcaption></figure></li></ol><p>複数画面を取得する場合は「画面候補を探す・一括取り込み」を選びます。取得結果を確認してチェックを入れます。その後に保存します。</p><button className="button secondary" onClick={()=>onAction('new')}>新しいドラフトを作成</button></section>
 <button className="text-button guide-related" onClick={()=>setTopic('troubleshooting')}>画像やフォントが欠けるとき →</button><section><h4>AI編集を準備する</h4><p>Claude Codeをインストールします。ターミナルで <code>claude</code> を起動し、ログインします。AI編集にはインターネット接続とClaudeの利用枠が必要です。</p><ClaudeGuideLink/><AiReadinessCard state={aiReadiness}/></section>
 {desktopApp&&<p>デスクトップ版はアプリを開くと起動します。開発サーバーの操作は必要ありません。</p>}</>:
 topic==='editing'?<><h3>編集・比較</h3><section><h4>編集する範囲を選ぶ</h4><ol><li>ドラフトを開きます。左の画面一覧から編集する画面を選択します。</li><li>キャンバス上部の「選択」を有効にします。その後に変更したい部分をクリックします。Shiftを押しながらクリックすると複数選択できます。</li><li>右の「選択範囲」で対象を確認します。「上位の範囲から選ぶ」では選択した部分を含む範囲を選べます。</li></ol><p>列や行を変更するときはテーブル全体を選びます。背景を変更するときは「本文全体を選ぶ」を試してください。</p><button className="button secondary" disabled={!hasScreen} onClick={()=>onAction('select')}>範囲選択を開く</button>{!hasScreen&&<p>画面を保存すると選択できます。</p>}</section>
 <figure className="guide-figure"><img src="/guide/editor-sample.jpg" alt="サンプル画面を開いた編集画面。左に画面一覧、中央に画面、右にAIへの指示が表示されています"/><figcaption>サンプル画面を開いた編集画面</figcaption></figure><section><h4>AIに変更を指示する</h4><ol><li>右側の入力欄に変更内容を入力します。その後に「変更を試す」を押します。</li><li>編集候補と変更前を確認します。</li><li>反映する場合は「この変更を保存」、取り消す場合は「破棄」を押します。</li></ol><p>編集候補は保存するまで保存済みの画面に反映されません。AIによる編集結果は保存前に確認してください。</p><button className="button secondary" disabled={!hasScreen} onClick={()=>onAction('edit')}>AI編集パネルを開く</button></section>
 <section><h4>保存履歴と比較する</h4><p>「比較」を押すと左に現在の画面が表示されます。右には選択した履歴が表示されます。右側で比較する履歴を選べます。</p><p>履歴はドラフト全体の保存時点です。後から追加した画面は追加前の履歴には表示されません。「この版に戻す」で選択中の画面を復元すると新しい履歴が作成されます。</p><button className="button secondary" disabled={!hasScreen} onClick={()=>onAction('compare')}>履歴比較を開く</button></section>
 <section><h4>画面の表示を調整する</h4><p>キャンバス下部の倍率から表示を変更できます。MacではCommandキーを押しながらスクロールするとカーソル位置を中心に拡大・縮小できます。右クリックしたままドラッグすると表示位置を移動できます。</p><p>比較画面の「スクロールを同期」がオンの場合は左右が連動します。選択範囲があるときは比較の表示範囲も切り替えられます。</p></section></>:
 topic==='saving'?<><h3>保存・書き出し</h3><section><h4>画面を追加・更新する</h4><p>ドラフト内の「画面を取り込む」から画面を追加できます。Chrome拡張の保存時には「別の画面として追加」か「既存画面を更新」を選べます。更新前の内容は履歴に残ります。</p><p>画面一覧の各画面のメニューから「再取り込み」も選べます。</p></section>
 <section><h4>名前変更・削除・復元</h4><p>ドラフト一覧または画面一覧の各項目のメニューから名前変更と削除を行えます。削除した項目はドラフト一覧の「ゴミ箱」から復元できます。</p></section>
 <section><h4>ZIPで渡す</h4><ol><li>ドラフト右上の「書き出す」を開きます。形式は「ZIP」を選択します。</li><li>対象の画面と比較元の履歴を選びます。必要に応じて変更内容を入力します。</li><li>「書き出しプレビューを作成」で画像を確認します。その後に「ZIPを書き出す」を押します。</li></ol><p>ZIPには比較画像、変更前後の画像、説明用のMarkdownが含まれます。比較元に画面がない場合は変更前の画像が含まれません。画像内には名前や入力値も含まれます。渡す前に内容を確認してください。画像ZIPの作成はデスクトップ版で利用できます。</p></section>
 <section><h4>ScreenDraft形式で保存する</h4><p>「書き出す」でScreenDraft形式を選びます。画面、保存履歴、リソースを含むファイルを書き出せます。ドラフト一覧の「読み込む」から選択すると新しいドラフトとして追加されます。</p><p>過去のAI指示、履歴の説明、未送信の下書き、接続キーは含まれません。編集中の処理がある場合は終了してください。確認待ちの候補がある場合は保存するか破棄してください。</p></section><BackupGuide desktop={desktopApp}/></>:
 topic==='troubleshooting'?<><h3>困ったとき</h3><section><h4>拡張機能に接続できない</h4><p>ScreenDraftを起動してください。「設定 → Chrome拡張」に表示される接続先と接続キーを拡張に入力します。接続ポートを変更した場合も接続先を確認してください。その後に再接続します。</p><button className="button secondary" onClick={()=>onAction('connect')}>Chrome拡張の設定を開く</button></section>
 <section><h4>画像やフォントが欠ける</h4><p>取得結果に「不足リソースへのアクセスを許可して再取得」が表示された場合は、追加のアクセス先を確認してから再取得できます。サイトによっては取得できないリソースもあります。</p><p>保存後に「要確認」と表示された場合は画面のメニューから「画面情報」を開きます。内容を確認したら「確認済みにする」を押せます。確認後も記録は残ります。再取り込み時に確認事項があれば再び「要確認」と表示されます。</p></section>
 <section><h4>AI編集ができない</h4><p>Claude Codeのインストールとログインを確認します。準備後は「再確認」を押してください。通信状態と利用枠も確認してください。必要に応じて選択範囲を小さくしてから再実行します。</p><ClaudeGuideLink/><AiReadinessCard state={aiReadiness}/></section>
 <section><h4>一括取り込みでログイン状態が反映されない</h4><p>サイトの認証方式によっては取得用の別タブで同じ状態を表示できない場合があります。元の画面で「この画面を取得」を試してください。</p><p>一括取り込みタブを閉じたり再読み込みしたりすると未保存の取得結果は失われます。</p></section>
 <section><h4>接続ポートが使用中</h4><p>デスクトップ版では「設定 → 接続ポート」で自動選択または手動指定を選べます。起動時にポートを使用できない場合は表示された案内に従ってください。</p></section></>:
 <><h3>データと制約</h3><section><h4>保存とAIへの送信</h4><p>ドラフトや取り込んだ画面はこのPCに保存します。クラウド同期と共有リンクには対応していません。</p><p>AI編集では選択範囲の画面内容、スタイル、入力した指示をClaude Code経由でAIサービスへ送信します。画面内の名前や入力値が含まれる場合があります。送信前に内容を確認してください。</p><p>画面の取得時には元サイトやリソース配信元との通信が発生します。パスワード、非表示の入力欄、ファイル入力の値は取得しません。その他の機密情報は自動では削除されません。</p></section>
 <section><h4>取り込みの範囲</h4><p>表示中の画面を保存します。元のプロダクトのクリック動作や処理は再現しません。取得できるCanvasは静止画像として保存します。</p><p>動画、埋め込み画面、Shadow DOMの内部、仮想リストの未描画行は対象外です。リソースを取得できない場合は見た目が異なることがあります。</p><p>一括取り込みでは同じサイトのリンクから最大50件を候補に表示します。一度に選べるのは最大10画面です。リンク先をたどって候補を繰り返し収集することはありません。</p></section>
 <section><h4>AI編集と履歴</h4><p>AIは選択した範囲を編集します。別画面への同じ変更の自動反映には対応していません。履歴から画面を復元しても過去の履歴は残ります。</p></section></>}
 </div></div>;
}
