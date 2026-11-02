export interface PickedNode {id:string;tag:string;text:string;ancestors:{id:string;tag:string;text:string}[]}
export interface EditJob {
 id:string;proposalId:string;screenId:string;baseRevisionId:string;baseSnapshotId:string;
 selectedIds:string[];prompt:string;status:'queued'|'running'|'ready'|'accepted'|'discarded'|'failed'|'cancelled';
 summary:string|null;candidateSnapshotId:string|null;error:string|null;createdAt:string;updatedAt:string;
}
export interface EditScope {id:string;tag:string;html:string;selectedIds:string[]}
export interface EditResult {summary:string;replacements:{targetId:string;html:string}[]}
