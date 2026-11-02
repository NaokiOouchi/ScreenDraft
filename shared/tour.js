export function shouldAutoStartTour(value) { return !['completed','skipped'].includes(value); }
export function tourPosition(rect, viewport, card) {
 const margin=16,gap=16,clamp=(n,max)=>Math.max(margin,Math.min(n,Math.max(margin,max)));
 let left=(viewport.width-card.width)/2,top=(viewport.height-card.height)/2;
 if(rect){
  if(rect.right+gap+card.width<=viewport.width-margin){left=rect.right+gap;top=rect.top;}
  else if(rect.left-gap-card.width>=margin){left=rect.left-gap-card.width;top=rect.top;}
  else if(rect.bottom+gap+card.height<=viewport.height-margin){left=rect.left;top=rect.bottom+gap;}
  else if(rect.top-gap-card.height>=margin){left=rect.left;top=rect.top-gap-card.height;}
  else{left=viewport.width-card.width-margin;top=viewport.height-card.height-margin;}
 }
 return {left:clamp(left,viewport.width-card.width-margin),top:clamp(top,viewport.height-card.height-margin)};
}
