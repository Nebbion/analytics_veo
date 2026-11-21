import type { Row } from './draft';

function words(value:string) {
  return value.replace(/\((?:C|VC)\)/gi,'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('it').replace(/[^\p{L}\p{N}\s]/gu,' ').split(/\s+/).filter(Boolean);
}
export function samePlanName(a:string,b:string) {
  return words(a).sort().join(' ')===words(b).sort().join(' ');
}
export function rosterCrosscheck(roster:Row[],players:Row[],lineups:Row[]) {
  return roster.map(person=>{
    const matches=players.filter(player=>samePlanName(person.name,String(player.nome??'')));
    const player=matches.length===1?matches[0]:null;
    return {...person,player_id:player?.player_id??null,linked:!!player,ambiguous:matches.length>1,
      in_lineup:player?lineups.some(row=>row.player_id===player.player_id):null};
  });
}
export function suggestTakerReference(members:string[],name:string,roster:Row[]):string|null {
  const observed=new Set(words(name));
  const matches=members.filter(member=>words(member).every(word=>observed.has(word)));
  if(matches.length!==1)return matches.length===0?'not_listed':null;
  const memberWords=words(matches[0]);
  const candidates=roster.filter(person=>{const personWords=new Set(words(String(person.nome??person.name??'')));return memberWords.every(word=>personWords.has(word));});
  return candidates.length===1?matches[0]:null;
}
