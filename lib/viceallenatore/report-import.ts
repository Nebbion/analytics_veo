// MIME is decoded as data. HTML is never inserted into the page or executed.
export function reportLines(bytes: Uint8Array) {
  if (bytes.byteLength > 50 * 1024 * 1024) throw new Error('Report oltre 50 MB.');
  let raw = '';
  for (let i=0;i<bytes.length;i+=32768) raw += String.fromCharCode(...bytes.subarray(i,i+32768));
  const boundary = /boundary\s*=\s*(?:"([^"]+)"|([^;\r\n]+))/i.exec(raw);
  const parts = boundary ? raw.split(`--${boundary[1] || boundary[2]}`) : [raw];
  const texts: string[] = [];
  for (const part of parts) {
    const separator = /\r?\n\r?\n/.exec(part);
    if (!separator) continue;
    const headers = part.slice(0,separator.index).replace(/\r?\n[ \t]+/g,' ');
    if (!/content-type:\s*text\/(html|plain)/i.test(headers)) continue;
    const content = part.slice(separator.index+separator[0].length).replace(/\r?\n--$/, '');
    const charset = /charset\s*=\s*"?([^;"\s]+)/i.exec(headers)?.[1] ?? 'utf-8';
    let decoded: Uint8Array;
    if (/content-transfer-encoding:\s*base64/i.test(headers)) {
      const binary = atob(content.replace(/\s/g,''));
      decoded = Uint8Array.from(binary,c=>c.charCodeAt(0));
    } else if (/content-transfer-encoding:\s*quoted-printable/i.test(headers)) {
      const unwrapped = content.replace(/=\r?\n/g,'');
      const values: number[]=[];
      for(let i=0;i<unwrapped.length;i++) {
        if(unwrapped[i]==='=' && /^[a-f0-9]{2}$/i.test(unwrapped.slice(i+1,i+3))) {values.push(parseInt(unwrapped.slice(i+1,i+3),16));i+=2;}
        else values.push(unwrapped.charCodeAt(i)&255);
      }
      decoded = new Uint8Array(values);
    } else decoded = Uint8Array.from(content,c=>c.charCodeAt(0)&255);
    let html: string;
    try { html = new TextDecoder(charset).decode(decoded); } catch { html = new TextDecoder().decode(decoded); }
    // Strip executable and nonvisible elements before reading any labels.
    html=html.replace(/<(script|style|svg|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'');
    html=html.replace(/<\/?(?:p|div|tr|li|br|h[1-6]|section)\b[^>]*>/gi,'\n').replace(/<[^>]*>/g,'');
    html=html.replace(/&#(x[\da-f]+|\d+);/gi,(_,n:string)=> {const code=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);return code>=0&&code<=0x10ffff?String.fromCodePoint(code):'';})
      .replace(/&(nbsp|amp|lt|gt|quot|apos|prime|rsquo);/gi,(_,n:string)=>({nbsp:' ',amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",prime:'′',rsquo:'’'}[n.toLowerCase()] ?? ''));
    texts.push(html);
  }
  const lines=texts.flatMap(t=>t.split(/\r?\n/)).map(l=>l.replace(/\s+/g,' ').trim()).filter(Boolean);
  if(!lines.length) throw new Error('Il file non contiene un report HTML leggibile.');
  return lines;
}
export function reportMatchDate(lines: string[]) {
  const months=['gen','feb','mar','apr','mag','giu','lug','ago','set','ott','nov','dic'];
  for(const line of lines){
    const numeric=/(\d{2})\/(\d{2})\/(\d{4})/.exec(line);
    if(numeric) return `${numeric[3]}-${numeric[2]}-${numeric[1]}`;
    const italian=/(\d{1,2})\s*(gen|feb|mar|apr|mag|giu|lug|ago|set|ott|nov|dic)\w*\s*(\d{4})/i.exec(line);
    if(italian) return `${italian[3]}-${String(months.indexOf(italian[2].toLowerCase())+1).padStart(2,'0')}-${italian[1].padStart(2,'0')}`;
  }
  return null;
}
export function extractReport(lines: string[]) {
  const provider = lines.some(l=>/Veo\s*\||Report della partita/i.test(l)) ? 'veo' : lines.some(l=>/Partita\s*\|\s*YouCoach/i.test(l)) ? 'youcoach' : null;
  if(!provider) throw new Error('Fonte ambigua: usa il motore locale per indicare Veo o YouCoach una sola volta.');
  const minutePattern=/(\d{1,3})(?:\s*\+\s*(\d+))?\s*['′’°]/;
  const timeline_candidates: any[]=[]; const goal_candidates: any[]=[]; const kpi_candidates: any[]=[];
  lines.forEach((line,i)=>{
    const previous=lines[i-1] ?? ''; const m=minutePattern.exec(line) ?? (/^\d+(?:\s*\+\s*\d+)?\s*['′’°]$/.test(previous)?minutePattern.exec(previous):null);
    if(m && /^(?:Gol di|Cartellino (?:Giallo|Rosso)|Sostituzione)/i.test(line)) {
      const event_type=/^Gol/i.test(line)?'goal':/^Cartellino/i.test(line)?'card':'substitution';
      const item={minute:Number(m[1]),stoppage:Number(m[2]??0),event_type,excerpt:line.slice(0,250),status:'candidate_unverified'};
      timeline_candidates.push(item); if(event_type==='goal') goal_candidates.push(item);
    }
  });
  if(provider==='veo' && !goal_candidates.length) {
    const score=lines.findIndex(l=>/\b\d+\s*-\s*\d+\b/.test(l));
    if(score>=0) for(const line of lines.slice(score+1,score+26)) {
      if(/^(Panoramica|Overview)$/.test(line)) break;
      const m=minutePattern.exec(line);
      if(m && /^(Jersey|Maglia)\s*#\d+\s*\(/.test(line)) goal_candidates.push({minute:Number(m[1]),stoppage:Number(m[2]??0),excerpt:line,status:'candidate_unverified'});
    }
  }
  const start=lines.indexOf('Numeri chiave di entrambe le squadre');
  const labels=['Gol','Tiri totali',"Calci d'angolo",'Falli','Calci di punizione','Possesso','Passaggi totali','Passaggi riusciti','Precisione passaggi'];
  if(provider==='veo'&&start>=0) for(let i=start+1;i<Math.min(lines.length-2,start+45);i++) if(labels.includes(lines[i]) && /^\d+(?:[.,]\d+)?%?$/.test(lines[i+1]) && /^\d+(?:[.,]\d+)?%?$/.test(lines[i+2])) kpi_candidates.push({metric:lines[i],first_value:lines[i+1],second_value:lines[i+2],status:'candidate_unverified'});
  return {provider,metadata:{line_count:lines.length,goal_candidates,kpi_candidates,timeline_candidates,extractor_version:'browser-1',notice:'Dati documentati nel report; nessuna identità o sincronizzazione video dedotta.'}};
}
