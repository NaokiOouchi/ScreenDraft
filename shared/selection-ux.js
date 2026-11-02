/** Labels describe DOM scope without inferring application-specific components. */
export function nodeLabel(node) {
 const labels={main:'本文全体',table:'テーブル全体',thead:'表の見出し部分',tbody:'表のデータ部分',tfoot:'表の末尾',tr:'行',th:'列の見出し',td:'セル',button:'ボタン',a:'リンク',input:'入力欄',select:'選択欄',textarea:'入力欄',form:'フォーム全体',section:'セクション',nav:'ナビゲーション',header:'ヘッダー',footer:'フッター',div:'グループ',span:'テキスト',p:'段落',img:'画像',ul:'リスト',ol:'リスト',li:'リスト項目'};
 return /^h[1-6]$/.test(node.tag)?'見出し':labels[node.tag]||'要素';
}
export function scopeChoices(node) {
 if(!node)return [];
 return node.ancestors.filter(a=>['table','form','main'].includes(a.tag)).map(a=>({...a,label:nodeLabel(a)}));
}
