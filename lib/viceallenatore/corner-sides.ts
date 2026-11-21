import type { Row } from './draft';
export type CornerSide = '' | 'left' | 'right';
export const cornerSideLabel=(side: string)=>side==='left'?'sinistra':side==='right'?'destra':'non verificato';

export function cornerPointsForSide(plan:Row,side:CornerSide):Row[] {
  const active=(plan.points??[]).filter((point:Row)=>point.active!==false);
  if(!plan.side_rule)return active;
  if(!side||!plan.side_rule.assignment_complete||active.some((point:Row)=>!point.sides?.length||point.sides.some((value:string)=>!['left','right'].includes(value))))return [];
  const selected=active.filter((point:Row)=>point.sides.includes(side));
  const roles=selected.map((point:Row)=>point.role_key).filter(Boolean);
  return new Set(roles).size===roles.length?selected:[];
}
