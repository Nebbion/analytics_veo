"""Open-play plan/video comparison. Descriptive measurements and reviewed proposals only."""
import copy
import hashlib
import json
import math
import re
import time
from pathlib import Path
try:
    from . import corner_engine as core
    from . import game_plan
except ImportError:
    import corner_engine as core
    import game_plan

PIPELINE='game-plan-0.2'


def diagram_bounds(hsv):
    import cv2
    import numpy as np
    grass=cv2.inRange(hsv,np.array([25,45,35]),np.array([95,255,255]))
    rows=np.where((grass>0).sum(axis=1)>hsv.shape[1]*.4)[0]
    if len(rows)<2:return None
    top,bottom=int(rows.min()),int(rows.max())
    ys,xs=np.where(grass[top:bottom+1]>0)
    return int(xs.min()),top,int(xs.max()-xs.min()+1),bottom-top+1


def full_pitch_grid(image_path):
    """Propose a mapping of the trapezoid in a full-pitch drawing to field coordinates."""
    import cv2
    import numpy as np
    image=cv2.imread(str(image_path));hsv=cv2.cvtColor(image,cv2.COLOR_BGR2HSV)
    grass=cv2.inRange(hsv,np.array([25,45,35]),np.array([95,255,255]))
    bounds=diagram_bounds(hsv)
    if not bounds:return None
    x,y,w,h=bounds
    white=cv2.inRange(hsv,np.array([0,0,185]),np.array([179,50,255]));white[:y]=0;white[y+h:]=0;white[:,:x]=0;white[:,x+w:]=0
    lines=cv2.HoughLinesP(white,1,np.pi/180,40,minLineLength=h*.35,maxLineGap=20)
    left=[];right=[]
    for line in [] if lines is None else lines[:,0]:
        x1,y1,x2,y2=map(float,line)
        if abs(y2-y1)<h*.35 or max(y1,y2)<y+h*.8:continue
        slope=(x2-x1)/(y2-y1);intercept=x1-slope*y1
        if -.6<slope<-.08:left.append((slope,intercept,min(y1,y2),max(y1,y2)))
        if .08<slope<.6:right.append((slope,intercept,min(y1,y2),max(y1,y2)))
    if not left or not right:return None
    l=np.median(np.array(left),axis=0);r=np.median(np.array(right),axis=0)
    bright=cv2.inRange(hsv,np.array([0,0,185]),np.array([179,35,255]));bright[:y]=0;bright[y+h:]=0;bright[:,:x]=0;bright[:,x+w:]=0
    row_counts=(bright>0).sum(axis=1)
    rows=np.where(row_counts>w*.28)[0]
    if len(rows)<2:return None
    top=float(rows.min());bottom=float(max(a[3] for a in left+right))
    if bottom-top<h*.6:return None
    pixels=[[l[0]*top+l[1],top],[r[0]*top+r[1],top],[r[0]*bottom+r[1],bottom],[l[0]*bottom+l[1],bottom]]
    field=[[0,105],[68,105],[68,0],[0,0]]
    matrix=cv2.getPerspectiveTransform(np.array(pixels,np.float32),np.array(field,np.float32))
    return {'pixels':pixels,'field':field,'matrix':matrix.tolist(),'width':int(image.shape[1]),'height':int(image.shape[0]),'proposed':True}


def half_pitch_grid(image_path):
    import cv2
    import numpy as np
    image=cv2.imread(str(image_path));hsv=cv2.cvtColor(image,cv2.COLOR_BGR2HSV)
    grass=cv2.inRange(hsv,np.array([25,45,35]),np.array([95,255,255]))
    bounds=diagram_bounds(hsv)
    if not bounds:return None
    x,y,w,h=bounds
    white=cv2.inRange(hsv,np.array([0,0,175]),np.array([179,35,255]));white[:y]=0;white[y+h:]=0;white[:,:x]=0;white[:,x+w:]=0
    rows=np.where((white>0).sum(axis=1)>w*.6)[0]
    if len(rows)<2:return None
    top=int(rows.min());bottom=int(rows.max())
    columns=np.where(white[top:top+2].max(axis=0)>0)[0]
    if len(columns)<2 or bottom-top<h*.5:return None
    left=float(columns.min());right=float(columns.max())
    pixels=[[left,top],[right,top],[right,bottom],[left,bottom]];field=[[0,105],[68,105],[68,52.5],[0,52.5]]
    matrix=cv2.getPerspectiveTransform(np.array(pixels,np.float32),np.array(field,np.float32))
    return {'pixels':pixels,'field':field,'matrix':matrix.tolist(),'width':int(image.shape[1]),'height':int(image.shape[0]),'proposed':True}


def full_pitch_points(image_path,grid):
    import cv2
    import numpy as np
    if not grid:return []
    image=cv2.imread(str(image_path));hsv=cv2.cvtColor(image,cv2.COLOR_BGR2HSV)
    green=cv2.inRange(hsv,np.array([35,190,65]),np.array([85,255,255]))
    blue=cv2.inRange(hsv,np.array([85,170,80]),np.array([125,255,255]))
    mask=cv2.morphologyEx(green|blue,cv2.MORPH_CLOSE,np.ones((3,6),np.uint8))
    contours,_=cv2.findContours(mask,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
    points=[];matrix=np.array(grid['matrix'])
    for contour in contours:
        x,y,w,h=cv2.boundingRect(contour)
        if not 7<=w<=45 or not 10<=h<=45 or h/w<.6:continue
        field=core.project([x+w/2,y+h],matrix)
        if field and -8<=field[0]<=76 and -8<=field[1]<=113:
            points.append({'id':f'p{len(points)+1}','x':round(field[0],2),'y':round(field[1],2),'label':'','active':True,'origin':'icon_candidate','image_foot':[x+w/2,y+h]})
    return sorted(points,key=lambda p:(p['y'],p['x']))


def plan_context(title):
    clean=title.upper()
    kind=game_plan.page_kind(title)
    if kind in ('defensive_corner','defensive_free_kick'):
        return {'phase':'out_of_possession','zone':'unknown','scope':'defensive_set_piece','set_piece_type':kind,'side_scope':'as_drawn_only','opponent_shape':None}
    if kind=='set_piece_duties':return {'phase':'unknown','scope':'set_piece_duties'}
    formation=re.search(r'\b([1-5](?:\s*-\s*[1-5]){2,4})\b',title)
    if 'IN POSSESSO' in clean and 'NON POSSESSO' not in clean:
        zone='zone_1' if re.search(r'ZONA\s*1',clean) else 'zone_2' if re.search(r'ZONA\s*2',clean) else 'unknown'
        return {'phase':'in_possession','zone':zone,'opponent_shape':None,'formation':re.sub(r'\s','',formation[1]) if formation else None,'scope':'open_play'}
    if re.search(r'USCITE\s+V[.S]*\s*',clean):
        opponent=re.search(r'V[.S]*\s*(\d(?:[\d\s-]*\d))',clean)
        raw=re.sub(r'\s','',opponent[1]) if opponent else ''
        if raw.isdigit():raw='-'.join(raw)
        return {'phase':'out_of_possession','zone':'unknown','opponent_shape':raw or None,'formation':None,'scope':'pressing','phase_origin':'diagram_interpretation_proposal'}
    return None


def assets(match_id):
    from PIL import Image
    import pymupdf
    result=[];base=core.folder(match_id)
    for source in core.sources(match_id):
        if source['kind']!='pdf':continue
        if core.sha256(Path(source['local_path']))!=source['sha256']:raise ValueError('Il piano gara originale è cambiato: importalo come nuova fonte')
        with pymupdf.open(source['local_path']) as doc:
            for index,page in enumerate(doc):
                text=page.get_text();kind=game_plan.page_kind(text)
                title=text.splitlines()[0] if text.strip() else ''
                context={'phase':'unknown','scope':'match_context'} if kind=='match_context' else plan_context(title)
                if not context:continue
                key=f'{source["id"]}-{index+1}';image_path=base/f'plan-{key}.png'
                if not image_path.exists():
                    pix=page.get_pixmap(alpha=False);image=Image.frombytes('RGB',[pix.width,pix.height],pix.samples)
                    if kind!='match_context' and image.height>image.width:image=image.transpose(Image.Transpose.ROTATE_270)
                    image.save(image_path)
                if kind in ('match_context','set_piece_duties'):
                    grid=None;points=[]
                elif context['phase']=='in_possession':
                    grid=full_pitch_grid(image_path);points=full_pitch_points(image_path,grid)
                else:
                    grid=half_pitch_grid(image_path)
                    if context['scope']=='defensive_set_piece':grid=game_plan.defensive_grid(grid)
                    points=full_pitch_points(image_path,grid)
                plan={'id':key,'kind':kind if kind!='open_play' else 'open_play','title':'Informazioni partita · modulo e convocati' if kind=='match_context' else title,'context':context,'points':points,'diagram_grid':grid,'coordinate_system':'own_goal_origin',
                      'pdf_source_id':source['id'],'pdf_sha256':source['sha256'],'pdf_page':index+1,'image':image_path.name,'reviewed':False,'notes':'Disposizione proposta dal disegno; fase, ruoli e frecce richiedono revisione.'}
                profile=core.read(base/f'open-meaning-{source["sha256"]}.json',{})
                annotations=profile.get('pages',{}).get(str(index+1)) if profile.get('pdf_sha256')==source['sha256'] else None
                if kind=='match_context':plan['brief']=game_plan.match_brief(text)
                if kind in ('defensive_corner','defensive_free_kick') and not annotations:
                    points.clear();plan['requires_role_interpretation']=True
                    plan['interpretation_note']='Pagina disponibile come riferimento visivo. Ruoli e riquadri del disegno non sono ancora interpretati: il confronto geometrico resta sospeso per non contare elenchi o riquadri come giocatori aggiuntivi.'
                if annotations:
                    # Insets such as generic wall slots do not describe extra players.
                    excluded=annotations.get('exclude_image_rects',[])
                    points[:]=[p for p in points if not any(r[0]<=p['image_foot'][0]<=r[2] and r[1]<=p['image_foot'][1]<=r[3] for r in excluded)]
                    remaining=list(annotations.get('icons',[]))
                    for point in points:
                        options=[(math.dist([point['x'],point['y']],[a['x'],a['y']]),i,a) for i,a in enumerate(remaining)]
                        near=min(options,key=lambda item:item[0]) if options else None
                        if near and near[0]<2:
                            _,i,a=near;remaining.pop(i);point['label']=a['label'];point['role_key']=a['label'].casefold();point['label_origin']='pdf_visual_transcription'
                            if a.get('movement'):point['movement']=a['movement']
                            if a.get('comparison_mode'):point['comparison_mode']=a['comparison_mode']
                            if a.get('role_group'):point['role_group']=a['role_group']
                    for name in ('duties','role_groups','wall','interpretation_note'):
                        if name in annotations:plan[name]=copy.deepcopy(annotations[name])
                    plan['annotation_revision']=hashlib.sha256(json.dumps(annotations,sort_keys=True).encode()).hexdigest()
                saved=core.read(base/f'play-plan-{key}.json')
                if saved and saved.get('pdf_sha256')==source['sha256'] and saved.get('annotation_revision')==plan.get('annotation_revision') and saved.get('kind')==plan['kind']:plan=saved
                result.append(plan)
    return result


def inventory(match_id,plans,corners):
    import pymupdf
    known={p['id']:p for p in plans+corners};pages=[]
    for source in core.sources(match_id):
        if source['kind']!='pdf':continue
        with pymupdf.open(source['local_path']) as doc:
            for index,page in enumerate(doc):
                text=page.get_text();kind=game_plan.page_kind(text);key=f'{source["id"]}-{index+1}';plan=known.get(key)
                pages.append({'id':key,'pdf_source_id':source['id'],'pdf_sha256':source['sha256'],'pdf_page':index+1,
                              'title':plan['title'] if plan else text.splitlines()[0] if text.strip() else 'Pagina senza testo leggibile',
                              'kind':kind,'available':plan is not None,'reviewed':bool(plan and plan.get('reviewed')),
                              'needs_interpretation':bool(plan and plan.get('requires_role_interpretation')) or kind=='set_piece_duties' and not bool(plan and plan.get('duties'))})
    return pages


def save_plan(match_id,payload):
    plan=next((p for p in assets(match_id) if p['id']==payload.get('id')),None)
    if not plan:raise ValueError('Principio di gioco non trovato')
    if plan['kind']=='match_context':raise ValueError('Modulo e convocati sono riferimenti del PDF: correggi i dati ufficiali in Analytics.')
    points=payload.get('points',[])
    if not isinstance(points,list) or len(points)>30:raise ValueError('Posizioni non valide')
    ids=set()
    for p in points:
        if not p.get('id') or p['id'] in ids:raise ValueError('Posizione duplicata')
        ids.add(p['id'])
        for xy in ([p.get('x'),p.get('y')],(p.get('movement') or {}).get('to')):
            if xy is None:continue
            if not isinstance(xy,list) or len(xy)!=2 or not all(isinstance(v,(int,float)) and math.isfinite(v) for v in xy) or not -10<=xy[0]<=78 or not -10<=xy[1]<=115:raise ValueError('Coordinate non valide')
    if plan['kind']=='set_piece_duties':
        game_plan.validate_duties(payload.get('duties'))
        plan['duties']=copy.deepcopy(payload['duties'])
    elif payload.get('reviewed') and not any(p.get('active',True) for p in points):raise ValueError('Nessuna posizione da confrontare')
    path=core.folder(match_id)/f'play-plan-{plan["id"]}.json'
    previous=core.read(path)
    if previous:core.atomic(path.with_name(f'play-plan-history-{plan["id"]}-{time.time_ns()}.json'),previous)
    if plan.get('role_groups'):
        plan['role_groups']=[{**group,'members':[p.get('label') or p['id'] for p in points if p.get('active',True) and p.get('role_group')==group['id']]} for group in plan['role_groups']]
    plan.update(points=points,reviewed=bool(payload.get('reviewed')),reviewed_at=time.time() if payload.get('reviewed') else None,reviewed_by=payload.get('reviewed_by'),notes=str(payload.get('notes',''))[:4000])
    core.atomic(path,plan);return plan


def verify_context(plan,context):
    expected=plan.get('context',{})
    if not context.get('verified'):return 'Fase e condizioni dell’episodio non verificate.'
    if context.get('phase') not in ('in_possession','out_of_possession'):return 'Fase di gioco non determinata.'
    if context['phase']!=expected.get('phase'):return 'Lo schema appartiene a una fase diversa.'
    if expected.get('zone') not in (None,'unknown') and context.get('zone')!=expected['zone']:return 'Zona dell’episodio diversa o non verificata.'
    if expected.get('opponent_shape') and context.get('opponent_shape')!=expected['opponent_shape']:return 'Struttura avversaria diversa o non verificata per queste uscite.'
    if expected.get('set_piece_type') and context.get('set_piece_type')!=expected['set_piece_type']:return 'Tipo di palla inattiva diverso o non verificato.'
    if expected.get('side_scope')=='as_drawn_only' and not context.get('side_as_drawn_verified'):return 'Lato dell’episodio non verificato rispetto al disegno: non viene applicata una specchiatura automatica.'
    if context.get('attack_direction')!='field_y_positive':return 'Direzione d’attacco non verificata nell’allineamento del campo.'
    return None


def trajectory(frames,anchor,track_id,h):
    import numpy as np
    values=[]
    base=anchor.get('base_to_frame')
    if base is None:return []
    for frame in frames:
        transform=frame.get('base_to_frame')
        d=next((d for d in frame['detections'] if d.get('track_id')==track_id),None)
        if transform is None or d is None:continue
        try:current_h=h@np.array(base)@np.linalg.inv(np.array(transform))
        except np.linalg.LinAlgError:continue
        point=core.project(d['foot'],current_h)
        if point is not None:values.append({'video_ms':frame['video_ms'],'field':point})
    return values


def measure_motion(plan,event,payload):
    context=payload.get('context') or {};context_error=verify_context(plan,context);errors=[]
    if not plan.get('reviewed'):errors.append('Conferma una volta la lettura di questo schema prima del giudizio.')
    if context_error:errors.append(context_error)
    calibration=payload.get('calibration')
    if not calibration or calibration.get('coordinate_system')!='own_goal_origin':errors.append('Allineamento e direzione del campo non verificati.')
    h=core.homography(calibration) if calibration and calibration.get('verified') else None
    if h is None:errors.append('Servono riferimenti visibili e verificati del campo.')
    if errors:return {'verdict':'non_valutabile','reason':' '.join(errors),'missing_evidence':errors,'observations':[],'movements':[],'context':context}
    links=payload.get('links',[])
    confirmed=[l for l in links if l.get('verified')]
    if len({l['target_id'] for l in confirmed})!=len(confirmed) or len({l['track_id'] for l in confirmed})!=len(confirmed):raise ValueError('Una traccia può corrispondere a un solo riferimento del piano')
    frames=event.get('frames',[]);anchor=next((f for f in frames if f['video_ms']==payload.get('frame_ms')),None)
    end_ms=payload.get('end_frame_ms')
    if not anchor or not isinstance(end_ms,int) or end_ms<=anchor['video_ms']:raise ValueError('Seleziona inizio e fine del movimento')
    selected=[f for f in frames if anchor['video_ms']<=f['video_ms']<=end_ms]
    if len(selected)<2 or selected[-1]['video_ms']!=end_ms:raise ValueError('Servono due fotogrammi esistenti con fine successiva all’inizio')
    points=[p for p in plan['points'] if p.get('active',True)]
    geometric_plan={**plan,'points':[p for p in plan['points'] if p.get('comparison_mode')!='role_only']}
    geometry=core.evaluate(geometric_plan,anchor['detections'],calibration,payload.get('links',[]),payload.get('tolerance_m',3),payload.get('team_kit'))
    linked_tracks={l['track_id']:l['target_id'] for l in confirmed}
    geometry['checks']=[c for c in geometry.get('checks',[]) if c['identity_verified'] or c['track_id'] not in linked_tracks or linked_tracks[c['track_id']]==c['target_id']]
    geometry['denominator']=len(geometry['checks']);geometry['within_tolerance']=sum(c['within_tolerance'] for c in geometry['checks'])
    observations=[];movements=[];unknown=[]
    for point in points:
        link=next((l for l in payload.get('links',[]) if l.get('target_id')==point['id'] and l.get('verified')),None)
        if not link:unknown.append({'role':point.get('label') or point['id'],'reason':'Identità/traccia non verificata'});continue
        samples=trajectory(selected,anchor,link['track_id'],h)
        duration=(end_ms-anchor['video_ms'])/1000
        coverage=len(samples)/len(selected)
        if len(samples)<2 or samples[0]['video_ms']!=anchor['video_ms'] or samples[-1]['video_ms']!=end_ms or coverage<1:
            unknown.append({'role':point.get('label') or point['id'],'reason':'Traccia o compensazione della camera interrotta; movimento non valutabile','coverage':coverage});continue
        a,b=samples[0]['field'],samples[-1]['field'];actual=[b[0]-a[0],b[1]-a[1]]
        distance=sum(math.dist(x['field'],y['field']) for x,y in zip(samples,samples[1:]))
        observation={'claim_type':'osservazione','target_id':point['id'],'role':point.get('label') or point['id'],'track_id':link['track_id'],'start':a,'end':b,'forward_m':round(actual[1],2),'lateral_m':round(actual[0],2),'path_m':round(distance,2),'duration_s':duration,'samples':samples,'coverage':coverage,'source':'video_track_with_proposed_camera_compensation'}
        observations.append(observation)
        if not point.get('movement'):continue
        expected=[point['movement']['to'][0]-point['x'],point['movement']['to'][1]-point['y']]
        norm=math.hypot(*actual)*math.hypot(*expected)
        movements.append({'claim_type':'interpretazione','status':'proposta_da_revisionare','target_id':point['id'],'role':observation['role'],'expected_end':point['movement']['to'],'end_distance_m':round(math.dist(b,point['movement']['to']),2),'direction_cosine':round(sum(x*y for x,y in zip(actual,expected))/norm,3) if norm>.01 else None,'instruction':point['movement'].get('instruction','Movimento del piano'),'causality':'non_valutata'})
    reason='Confronto delle sole tracce continue e confermate, nella fase e nelle condizioni previste. Nessuna causa o conformità globale è dedotta.'
    if plan.get('role_groups'):reason+=' I ruoli di marcatura non sono posizioni fisse.'
    if plan.get('wall'):reason+=' Il riquadro della barriera non indica un numero obbligatorio di giocatori.'
    return {'verdict':'proposta_da_revisionare' if observations or geometry.get('checks') else 'non_valutabile','context':context,'geometry':geometry,'observations':observations,'movements':movements,'not_evaluable':unknown,'role_groups':plan.get('role_groups',[]),'wall':plan.get('wall'),'denominator':len(movements),'reason':reason}


def api(payload):
    match_id=str(payload['match_id']);op=payload['op']
    if op=='play_prepare':
        ready=core.api({'op':'prepare','match_id':match_id});corners=ready['plans'];ready['plans']=assets(match_id);ready['inventory']=inventory(match_id,ready['plans'],corners);ready['pipeline']=PIPELINE;ready['seasonal_model']=payload.get('seasonal_model');return ready
    if op=='play_save_plan':return save_plan(match_id,payload)
    if op=='play_review':
        event_id=payload['event_id']
        if not re.fullmatch(r'[a-f0-9-]{36}',event_id):raise ValueError('Episodio non valido')
        path=core.folder(match_id)/f'event-{event_id}'/'event.json';event=core.read(path)
        if not event:raise ValueError('Episodio non trovato')
        plan=next((p for p in assets(match_id) if p['id']==payload['plan_id']),None)
        if not plan:raise ValueError('Schema non trovato')
        if plan.get('kind')=='match_context':raise ValueError('La pagina informativa non è uno schema da valutare sul video')
        result=game_plan.review_duty(plan,event,payload) if plan.get('kind')=='set_piece_duties' else measure_motion(plan,event,payload)
        revision={'kind':'open_play','pipeline':PIPELINE,'created_at':time.time(),'reviewed_by':payload.get('reviewed_by'),'event_id':event_id,'source_id':event['source_id'],'source_sha256':event['source_sha256'],'plan_id':plan['id'],'plan_snapshot':copy.deepcopy(plan),'plan_snapshot_sha256':hashlib.sha256(json.dumps(plan,sort_keys=True).encode()).hexdigest(),'seasonal_model':payload.get('seasonal_model'),'frame_ms':payload.get('frame_ms'),'end_frame_ms':payload.get('end_frame_ms'),'context':payload.get('context'),'calibration':payload.get('calibration'),'team_kit':payload.get('team_kit'),'links':payload.get('links',[]),'staff_note':str(payload.get('note',''))[:4000],'result':result}
        revision['kind']=plan.get('kind','open_play')
        for name in ('duty_id','observed_taker','taker_reference','reference_verified'):
            if name in payload:revision[name]=copy.deepcopy(payload[name])
        core.atomic(path.parent/f'play-review-{time.time_ns()}.json',revision)
        previous=event.get('open_play_review')
        reviews=event.setdefault('open_play_reviews',{})
        if previous:reviews.setdefault(previous['plan_id'],previous)
        reviews[plan['id']]=revision;event['open_play_review']=revision
        core.atomic(path,event);return event
    raise ValueError('Operazione di gioco aperto non supportata')
