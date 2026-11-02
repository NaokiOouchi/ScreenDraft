export function BackupGuide({desktop,onOpenFolder}:{desktop:boolean;onOpenFolder?:()=>void}){
 const folder=desktop?'workspace':'.data';
 return <section className="backup-guide" aria-label="バックアップと復元"><h4>バックアップと復元</h4>
 <p>ドラフト、画面、履歴、リソース、確認待ちのAI候補を保存先フォルダごとコピーします。</p>
 <details><summary>バックアップする</summary><ol>
 <li>{desktop?<>アプリの「設定 → データ保存」で保存先を開きます。{onOpenFolder&&<button className="text-button" onClick={onOpenFolder}>保存先を開く</button>}</>:<>保存先の<code>.data</code>フォルダを確認します。<code>DATA_DIR</code>を指定している場合はそのフォルダが対象です。</>}</li>
 <li>{desktop?'取得・AI編集の処理が終わってから「ScreenDraft → Quit ScreenDraft」で終了します。ウインドウを閉じた後にアプリが終了したことを確認してください。':'取得・AI編集の処理が終わってからサーバーを停止します。'}</li>
 <li><code>{folder}</code>フォルダ全体を別の保存場所へコピーします。コピーには日付とアプリのバージョンが分かる名前を付けてください。</li>
 </ol><p>DBファイルだけでは画像やフォントを復元できません。フォルダ内のファイルを省略せずコピーしてください。</p></details>
 <details><summary>バックアップから復元する</summary><ol>
 <li>保存先を開いてから{desktop?'ScreenDraftを終了':'サーバーを停止'}します。原則としてバックアップ時と同じバージョンを使用してください。</li>
 <li>現在の<code>{folder}</code>フォルダの名前を<code>{folder}-復元前-日付</code>などに変更して退避します。削除しないでください。</li>
 <li>バックアップを保存先の親フォルダへコピーします。コピーしたフォルダの名前を<code>{folder}</code>に戻します。現在のフォルダへの上書き・統合は行いません。</li>
 <li>{desktop?'ScreenDraft':'サーバー'}を起動します。ドラフト・画面・履歴・画像と確認待ち候補を確認してください。</li>
 </ol><p>復元すると保存内容はバックアップ時点に戻ります。復元後に表示できない場合はアプリまたはサーバーを終了してください。その後に復元したフォルダを退避します。その後に「復元前」のフォルダ名を<code>{folder}</code>へ戻します。</p></details>
 <details><summary>含まれるデータと対象外のデータ</summary><p>接続キーと過去のAI指示も含まれます。バックアップは第三者が閲覧できない場所に保存してください。接続キーが変わった場合はChrome拡張を再接続してください。</p><p>未送信の指示下書き、DOMの選択状態、表示設定、接続ポートの設定はこのバックアップに含まれません。必要な未送信の指示は別途控えてください。Chrome拡張内の未保存の取得結果とClaude Codeの認証情報も対象外です。</p></details>
 </section>;
}
