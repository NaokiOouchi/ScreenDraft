/** Explicit destination only: matching URLs must never silently overwrite a screen. */
export function captureSavePayload(capture,screen){
 const {updateScreenId,baseSnapshotId,...data}=capture;
 if(!screen)return data;
 if(!screen.id||!screen.snapshotId)throw new Error('更新先の画面を読み込み直してください。');
 return {...data,updateScreenId:screen.id,baseSnapshotId:screen.snapshotId};
}
export function assertUniqueUpdateTargets(items){
 const ids=items.map(item=>item.updateTarget?.id).filter(Boolean);
 if(new Set(ids).size!==ids.length)throw new Error('同じ既存画面を複数の取得結果の更新先には指定できません。');
}
