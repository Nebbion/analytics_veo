"""Source-bound game-plan sections. Drawn role lists are not player positions."""
import re
import unicodedata


def page_kind(text):
    title=text.strip().splitlines()[0] if text.strip() else ''
    normalized=title.upper().replace('’',"'")
    if 'CONVOCATI' in text.upper() and re.search(r'Modulo\s*:',text,re.I):return 'match_context'
    if re.search(r"ANGOLO\s+DIFENSIVO",normalized):return 'defensive_corner'
    if re.search(r'PUNIZIONE\s+DIFENSIV',normalized):return 'defensive_free_kick'
    if normalized=='PALLE INATTIVE':return 'set_piece_duties'
    if re.search(r'ANGOLO\s+OFFENSIVO',normalized):return 'offensive_corner'
    if 'IN POSSESSO' in normalized or re.search(r'USCITE\s+V[.S]*\s*',normalized):return 'open_play'
    return 'unsupported'


def match_brief(text):
    formation=re.search(r'Modulo\s*:\s*([\d-]+)',text,re.I)
    lines=text.splitlines();players=[]
    for index,line in enumerate(lines[:-2]):
        # Role and shirt number are separate PDF text lines, with no OCR guess.
        if re.match(r"^(Portiere|Difensore|Centrocampista|Attaccante)\b",lines[index+1]) and re.fullmatch(r'\d{1,2}',lines[index+2].strip()):
            players.append({'name':' '.join(line.split()),'role':lines[index+1].strip(),'shirt_number':int(lines[index+2]),'origin':'pdf_text','is_starter':None})
    return {'formation':formation[1] if formation else None,'roster':players,'lineup_status':'not_inferred_from_shirt_number','origin':'pdf_text'}


def defensive_grid(grid):
    """Rotate both axes: the goal at the top of these drawings is our goal."""
    if not grid:return None
    import numpy as np
    rotation=np.array([[-1,0,68],[0,-1,105],[0,0,1]],dtype=float)
    return {**grid,'field':[[68-x,105-y] for x,y in grid['field']],
            'matrix':(rotation@np.array(grid['matrix'])).tolist(),'goal_orientation':'own_goal_at_top_of_source','proposed':True}


def validate_duties(groups):
    if not isinstance(groups,list) or not 1<=len(groups)<=20:raise ValueError('Indicazioni sui battitori non valide')
    ids=set()
    for group in groups:
        if not isinstance(group,dict) or not isinstance(group.get('id'),str) or not group['id'] or group['id'] in ids:raise ValueError('Gruppo battitori ambiguo')
        ids.add(group['id'])
        if group.get('event_type') not in ('penalty','direct_free_kick','indirect_free_kick'):raise ValueError('Tipo di palla inattiva non valido')
        names=group.get('members')
        if not isinstance(names,list) or not 1<=len(names)<=25 or not all(isinstance(n,str) and 0<len(n.strip())<=150 for n in names):raise ValueError('Battitori non validi')
        if len({name_key(n) for n in names})!=len(names):raise ValueError('Battitore duplicato nello stesso gruppo')


def name_key(value):
    value=unicodedata.normalize('NFKD',str(value))
    return ' '.join(re.sub(r'[^\w\s]',' ',''.join(c for c in value if not unicodedata.combining(c)).casefold()).split())


def review_duty(plan,event,payload):
    group=next((g for g in plan.get('duties',[]) if g['id']==payload.get('duty_id')),None)
    context=payload.get('context') or {};errors=[]
    if not plan.get('reviewed'):errors.append('Conferma una volta la lettura delle indicazioni sui battitori.')
    if not group:errors.append('Scegli il gruppo applicabile tra le indicazioni del piano.')
    elif not context.get('verified') or context.get('event_type')!=group['event_type'] or context.get('duty_id')!=group['id']:errors.append('Tipo di calcio piazzato e gruppo applicabile non verificati nel video.')
    observed=payload.get('observed_taker') or {}
    if not observed.get('verified') or not isinstance(observed.get('name'),str) or not observed['name'].strip():errors.append('Battitore nell’episodio non verificato.')
    valid_frames={f['video_ms'] for f in event.get('frames',[])}
    if payload.get('frame_ms') not in valid_frames:errors.append('Seleziona un fotogramma della clip per la verifica del battitore.')
    if errors:return {'verdict':'non_valutabile','reason':' '.join(errors),'missing_evidence':errors,'observations':[],'interpretations':[]}
    # Source names may be surnames. Their mapping to the observed person must be
    # explicitly checked, not inferred by fuzzy matching or dropdown membership.
    reference=payload.get('taker_reference')
    if reference is None or not payload.get('reference_verified'):
        return {'verdict':'non_valutabile','reason':'Verifica la corrispondenza tra il battitore riconosciuto e il nome nel piano, oppure conferma che non è elencato.','observations':[],'interpretations':[]}
    if reference!='not_listed' and reference not in group['members']:raise ValueError('Riferimento del battitore non presente nel gruppo')
    return {'verdict':'proposta_da_revisionare','reason':'Confronto della sola assegnazione del battitore verificata dallo staff. Nessuna deduzione sull’ordine di scelta, qualità o riuscita del calcio piazzato.',
            'observations':[{'claim_type':'osservazione','name':observed['name'].strip()[:150],'player_id':observed.get('player_id'),'video_ms':payload['frame_ms'],'source':'staff_video_verification'}],
            'interpretations':[{'claim_type':'interpretazione','status':'proposta_da_revisionare','duty_id':group['id'],'listed':reference!='not_listed','reference':reference,'expected_members':group['members'],'priority':'not_inferred'}]}
