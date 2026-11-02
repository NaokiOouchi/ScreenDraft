import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {ArrowLeft,ArrowRight,CheckCircle} from '@phosphor-icons/react';
import {tourPosition} from '../shared/tour.js';
export const TOUR_STEPS=[
 {target:'welcome',title:'ScreenDraftへようこそ',body:'表示中の画面を取り込み、変更案を検討できます。まずサンプル画面を選び、内容を確認して保存しましょう。'},
 {target:'screens',title:'画面をドラフトにまとめます',body:'保存した画面はここに表示されます。関連する画面を追加し、切り替えて編集できます。'},
 {target:'canvas',title:'編集する範囲を選びます',body:'画面の見出しやボタンを選択します。列を追加する場合はテーブル全体を選びます。'},
 {target:'ai',title:'AIに変更を指示します',body:'変更内容を入力して編集を依頼します。AI編集にはClaude Codeのインストールとログインが必要です。'},
 {target:'compare',title:'履歴と比較します',body:'「比較」から現在の画面と過去の履歴を並べて確認できます。'},
];
export function GuidedTour({step,setStep,onFinish,onStartSample}:{step:number;setStep:(n:number)=>void;onFinish:(reason:'completed'|'skipped')=>void;onStartSample:()=>void}){
 const item=TOUR_STEPS[step],dialog=useRef<HTMLDivElement>(null),[rect,setRect]=useState<DOMRect|null>(null),[position,setPosition]=useState({left:16,top:100});
 const finish=useRef(onFinish);finish.current=onFinish;
 useLayoutEffect(()=>{
  const update=()=>{const el=document.querySelector<HTMLElement>('[data-tour="'+item.target+'"]');const r=el?.getBoundingClientRect();const visible=r&&r.width>0&&r.height>0?r:null;setRect(visible);const box=dialog.current?.getBoundingClientRect();setPosition(tourPosition(visible,{width:innerWidth,height:innerHeight},{width:box?.width||360,height:box?.height||300}));};
  update();const observer=new ResizeObserver(update);observer.observe(document.documentElement);if(dialog.current)observer.observe(dialog.current);const target=document.querySelector('[data-tour="'+item.target+'"]');if(target)observer.observe(target);window.addEventListener('resize',update);window.addEventListener('scroll',update,true);
  return()=>{observer.disconnect();window.removeEventListener('resize',update);window.removeEventListener('scroll',update,true);};
 },[step,item.target]);
 useEffect(()=>{const previous=document.activeElement as HTMLElement|null;dialog.current?.focus();const key=(e:KeyboardEvent)=>{
  if(e.key==='Escape'){e.preventDefault();finish.current('skipped');}
  if(e.key==='Tab'){const buttons=Array.from(dialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')||[]),first=buttons[0],last=buttons.at(-1);if(e.shiftKey&&(document.activeElement===first||document.activeElement===dialog.current)){e.preventDefault();last?.focus();}else if(!e.shiftKey&&(document.activeElement===last||document.activeElement===dialog.current)){e.preventDefault();first?.focus();}}
 };document.addEventListener('keydown',key,true);return()=>{document.removeEventListener('keydown',key,true);if(previous?.isConnected)previous.focus();else document.querySelector<HTMLButtonElement>('[data-tour-replay]')?.focus();};},[]);
 useEffect(()=>{dialog.current?.focus();},[step]);
 return <div className="tour-overlay"><div className="tour-shade"/>{rect&&<div className="tour-spotlight" style={{left:Math.max(0,rect.left-5),top:Math.max(0,rect.top-5),width:Math.max(0,Math.min(innerWidth,rect.right+5)-Math.max(0,rect.left-5)),height:Math.max(0,Math.min(innerHeight,rect.bottom+5)-Math.max(0,rect.top-5))}}/>}<div ref={dialog} tabIndex={-1} className="tour-card" role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-description" style={position}><div className="tour-card-top"><span>はじめてのScreenDraft · {step+1} / {TOUR_STEPS.length}</span><button className="text-button" onClick={()=>onFinish('skipped')}>スキップ</button></div><div className="tour-dots" aria-hidden="true">{TOUR_STEPS.map((_,index)=><span key={index} className={index===step?'active':''}/>)}</div><h2 id="tour-title">{item.title}</h2><p id="tour-description">{item.body}</p>{step>0&&!rect&&<p className="tour-target-note">この操作は画面を取り込んだ後に利用できます。</p>}<div className="tour-navigation">{step>1&&<button className="button secondary" onClick={()=>setStep(step-1)}><ArrowLeft size={16}/>戻る</button>}{step===0?<button className="button primary" onClick={onStartSample}>サンプルを選ぶ<ArrowRight size={16}/></button>:step<TOUR_STEPS.length-1?<button className="button primary" onClick={()=>setStep(step+1)}>次へ<ArrowRight size={16}/></button>:<button className="button primary" onClick={()=>onFinish('completed')}><CheckCircle size={17}/>完了</button>}</div>{step===0&&<p className="tour-footer-note">サンプル画面を選び、保存後に案内を続けます。</p>}</div></div>;
}
