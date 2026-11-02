/** User-facing save state, independent of Chrome and the DOM. */
export function batchSaveState(items, selectedIds, confirmed) {
 const selected=new Set(selectedIds),saved=items.filter(x=>x.status==='saved').length;
 const unsaved=items.filter(x=>['ready','save-failed','saving','acquiring'].includes(x.status)).length;
 const failed=items.filter(x=>['failed','save-failed'].includes(x.status)).length;
 const ready=items.filter(x=>selected.has(x.id)&&['ready','save-failed'].includes(x.status)).length;
 return {saved,unsaved,failed,ready,complete:saved>0&&!unsaved&&!failed,
  hint:!ready?'保存する取得済み画面を選択してください。':!confirmed?'内容の確認後に確認チェックを入れてください。':'確認済みの'+ready+'画面を保存できます。'};
}
