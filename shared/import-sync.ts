export interface ImportEvent{sequence:number;proposalId:string;screenId:string}
export interface ExtensionState{instanceId:string;connectedAt:string|null;sequence:number;imports:ImportEvent[]}
export function importDestination(events:ImportEvent[],view:{proposalId:string;screenId:string;editing:boolean}){
 const last=events.at(-1);if(!last)return null;
 return view.editing?{proposalId:view.proposalId,screenId:view.screenId,navigate:false}:{proposalId:last.proposalId,screenId:last.screenId,navigate:true};
}
