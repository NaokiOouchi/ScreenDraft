export function clampInspectorWidth(value:number,viewport:number,sidebar:number){
 const maximum=Math.max(280,Math.min(420,viewport-sidebar-520));
 return Math.round(Math.max(280,Math.min(maximum,Number.isFinite(value)?value:320)));
}
