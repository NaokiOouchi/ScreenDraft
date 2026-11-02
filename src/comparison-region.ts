export interface FrameRegion{x:number;y:number;width:number;height:number}
export function comparisonRegion(value:unknown,width:number,height:number):FrameRegion|null{
 if(!value||typeof value!=='object')return null;const r=value as FrameRegion;
 if(![r.x,r.y,r.width,r.height].every(Number.isFinite)||r.x<0||r.y<0||r.width<=0||r.height<=0||r.x+r.width>width+1||r.y+r.height>height+1)return null;
 return {x:r.x,y:r.y,width:r.width,height:r.height};
}
export function regionScale(paneWidth:number,left:Pick<FrameRegion,'width'>,right:Pick<FrameRegion,'width'>){return Math.min(1,Math.max(.8,paneWidth/Math.max(left.width,right.width)));}
