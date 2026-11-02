import {test} from 'node:test';import assert from 'node:assert/strict';
// @ts-ignore Electronと共有する実行条件
import {quitWarning} from '../desktop/runtime.cjs';
test('終了確認は未保存の取り込みと実行中AIだけを対象にする',()=>{
 assert.equal(quitWarning({working:false,pending:false}),null);assert.match(quitWarning({unsaved:true})!,/保存していない入力/);
 assert.match(quitWarning({working:true,pending:false})!,/AI/);
 assert.match(quitWarning({working:false,pending:true})!,/取り込み/);
 assert.match(quitWarning({working:true,pending:true})!,/AI/);
});
