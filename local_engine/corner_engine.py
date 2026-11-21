#!/usr/bin/env python3
"""Local corner research prototype. Proposals are never asserted as tactical facts."""
import argparse
import hashlib
import json
import math
import os
import re
import sys
import time
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from viceallenatore import database, match_dir, make_clip, sha256

ROOT = Path(__file__).resolve().parents[1]
MODEL = ROOT / 'data/local/models/torch/hub/checkpoints/fasterrcnn_mobilenet_v3_large_fpn-fb6a3cc7.pth'
PIPELINE = 'corner-cv-0.1'


def folder(match_id):
    p = match_dir(match_id) / 'corners'
    p.mkdir(parents=True, exist_ok=True)
    return p


def atomic(path, value):
    temp = path.with_suffix('.partial.json')
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2))
    temp.replace(path)


def read(path, default=None):
    return json.loads(path.read_text()) if path.exists() else default


def sources(match_id):
    db = database(match_id)
    rows = [dict(r) for r in db.execute('select * from sources where match_id=?', (match_id,))]
    db.close()
    return rows


def diagram_points(image_path):
    """Propose icon anchors from a half-pitch drawing, never infer arrow meaning."""
    import cv2
    import numpy as np
    image=cv2.imread(str(image_path));hsv=cv2.cvtColor(image,cv2.COLOR_BGR2HSV)
    grass=cv2.inRange(hsv,np.array([25,45,35]),np.array([95,255,255]))
    contours,_=cv2.findContours(grass,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
    if not contours:return [],None
    x,y,w,h=cv2.boundingRect(max(contours,key=cv2.contourArea))
    white=cv2.inRange(hsv,np.array([0,0,185]),np.array([179,70,255]))
    white[:y,:]=0;white[y+h:,:]=0;white[:,:x]=0;white[:,x+w:]=0
    vertical=cv2.morphologyEx(cv2.morphologyEx(white,cv2.MORPH_CLOSE,np.ones((40,1),np.uint8)),cv2.MORPH_OPEN,np.ones((max(30,int(h*.5)),1),np.uint8))
    horizontal=cv2.morphologyEx(cv2.morphologyEx(white,cv2.MORPH_CLOSE,np.ones((1,65),np.uint8)),cv2.MORPH_OPEN,np.ones((1,max(30,int(w*.65))),np.uint8))
    xs=np.where((vertical>0).sum(axis=0)>h*.5)[0];ys=np.where((horizontal>0).sum(axis=1)>w*.6)[0]
    if len(xs)<2 or len(ys)<2:return [],None
    x0,x1=float(xs.min()),float(xs.max());y0,y1=float(ys.min()),float(ys.max())
    if x1-x0<w*.5 or y1-y0<h*.5:return [],None
    green=cv2.inRange(hsv,np.array([35,190,65]),np.array([85,255,255]))
    green=cv2.morphologyEx(green,cv2.MORPH_CLOSE,np.ones((3,6),np.uint8))
    contours,_=cv2.findContours(green,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
    points=[]
    for c in contours:
        a,b,cw,ch=cv2.boundingRect(c)
        if 7<=cw<=w*.07 and 10<=ch<=h*.12 and ch/cw>.6 and y-10<=b<y+h:
            px=a+cw/2;py=b+ch
            fx=(px-x0)/(x1-x0)*68;fy=(py-y0)/(y1-y0)*52.5
            if -10<=fx<=78 and -10<=fy<=62.5:points.append({'id':f'p{len(points)+1}','label':'','x':round(fx,2),'y':round(fy,2),'active':True,'origin':'icon_candidate'})
    points.sort(key=lambda p:(p['y'],p['x']))
    return points,{'x0':x0,'x1':x1,'y0':y0,'y1':y1,'width':int(image.shape[1]),'height':int(image.shape[0])}


def apply_side_rule(plan, interpretation):
    """Use a source-bound coach clarification; never infer extra players or runs."""
    if not interpretation or interpretation.get('pdf_sha256')!=plan.get('pdf_sha256') or interpretation.get('meaning')!='circled_positions_are_alternatives_by_corner_side':
        return plan
    reference_side=interpretation.get('reference_side')
    if reference_side not in ('left','right'):return plan
    alternative_side='right' if reference_side=='left' else 'left'
    page=interpretation.get('pages',{}).get(str(plan['pdf_page']))
    if not page:return plan
    revision=hashlib.sha256(json.dumps(interpretation,sort_keys=True).encode()).hexdigest()
    if plan.get('side_rule',{}).get('revision')==revision:return plan
    assignments=page.get('icons',[])
    circled_roles={a['label'].casefold() for a in assignments if a.get('circled')}
    used=set();points=[];complete=True
    for point in plan['points']:
        options=[(math.dist([point['x'],point['y']],[a['x'],a['y']]),j,a) for j,a in enumerate(assignments) if j not in used]
        match=min(options,key=lambda item:item[0]) if options else None
        point=dict(point)
        if not match or match[0]>1.5:
            point['sides']=[];complete=False
        else:
            _,j,assignment=match;used.add(j)
            point['label']=point.get('label') or assignment['label']
            point['role_key']=assignment['label'].casefold()
            point['label_origin']='pdf_visual_transcription'
            point['is_side_alternative']=assignment['label'].casefold() in circled_roles
            point['circled']=bool(assignment.get('circled'))
            point['sides']=[alternative_side] if point['circled'] else [reference_side] if point['is_side_alternative'] else ['left','right']
        points.append(point)
    # Applying a clarification cannot silently approve the whole diagram.
    return {**plan,'points':points,'reviewed':False,'reviewed_at':None,
            'side_rule':{'kind':'alternatives_by_corner_side','reference_side':reference_side,'revision':revision,
                         'confirmed_meaning':True,'assignment_complete':complete and len(used)==len(assignments),
                         'source':'coach_clarification','note':'Le icone cerchiate sono alternative per il lato opposto di battuta, non giocatori aggiuntivi o destinazioni di movimento.'}}


def applicable_points(plan, corner_side=None):
    points=[p for p in plan.get('points',[]) if p.get('active',True)]
    if not plan.get('side_rule'):return points
    if corner_side not in ('left','right') or not plan['side_rule'].get('assignment_complete'):return None
    if any(not p.get('sides') or not set(p['sides']).issubset({'left','right'}) for p in points):return None
    selected=[p for p in points if corner_side in p['sides']]
    roles=[p.get('role_key') for p in selected if p.get('role_key')]
    if len(roles)!=len(set(roles)):return None
    return selected


def assets(match_id):
    from PIL import Image
    import pymupdf
    base = folder(match_id)
    result = []
    for source in sources(match_id):
        if source['kind'] != 'pdf':
            continue
        doc = pymupdf.open(source['local_path'])
        for index, page in enumerate(doc):
            heading = page.get_text()
            if not re.search(r'ANGOLO\s+OFFENSIVO', heading, re.I):
                continue
            variant = 'hand_on_head' if 'TESTA' in heading else 'two_arms' if '2 BRACCIA' in heading else 'one_arm' if '1 BRACCIO' in heading else None
            if not variant:
                continue
            key = f'{source["id"]}-{index+1}'
            image_path = base / f'plan-{key}.png'
            if not image_path.exists():
                pix = page.get_pixmap(alpha=False)
                image = Image.frombytes('RGB', [pix.width, pix.height], pix.samples)
                if image.height > image.width:
                    image = image.transpose(Image.Transpose.ROTATE_270)
                image.save(image_path)
            proposed, grid = diagram_points(image_path)
            entry = {'id':key,'variant':variant,'title':{'one_arm':'Un braccio alto','two_arms':'Due braccia alte','hand_on_head':'Mano in testa'}[variant], 'pdf_source_id':source['id'],'pdf_sha256':source['sha256'],'pdf_page':index+1,'image':image_path.name,
                     'points':proposed, 'diagram_grid':grid, 'reviewed':False,'notes':'Posizioni e significato delle frecce richiedono una conferma prima del confronto.'}
            saved = read(base / f'plan-{key}.json')
            if saved and saved.get('pdf_sha256') == source['sha256']:
                entry = saved
            interpretation=read(base/f'side-meaning-{source["sha256"]}.json')
            entry=apply_side_rule(entry,interpretation)
            result.append(entry)
    try:from .pdf_reader import approved_plans
    except ImportError:from pdf_reader import approved_plans
    merged={p['id']:p for p in result}
    for plan in approved_plans(match_id):
        if plan['kind']!='offensive_corner':continue
        saved=read(base/f'plan-{plan["id"]}.json')
        merged[plan['id']]=saved if saved and saved.get('reader_revision')==plan['reader_revision'] and saved.get('pdf_sha256')==plan['pdf_sha256'] else plan
    return list(merged.values())


def validate_points(points):
    if not isinstance(points,list) or len(points)>30:
        raise ValueError('Posizioni non valide')
    for p in points:
        if not all(isinstance(p.get(k),(int,float)) and math.isfinite(p[k]) for k in ('x','y')):
            raise ValueError('Coordinate non valide')
        if not (-10 <= p['x'] <= 78 and -10 <= p['y'] <= 62.5):
            raise ValueError('Posizione fuori dal mezzo campo')
        movement=p.get('movement')
        if movement is not None:
            if not isinstance(movement,dict) or not isinstance(movement.get('to'),list) or len(movement['to'])!=2 or not all(isinstance(v,(int,float)) and math.isfinite(v) for v in movement['to']):raise ValueError('Movimento non valido')


def prepare(match_id):
    rows = sources(match_id)
    videos = [s for s in rows if s['kind']=='video']
    state = read(folder(match_id)/'state.json', {})
    runs = []
    for p in folder(match_id).glob('run-*/state.json'):
        item=read(p)
        if item:runs.append(item)
    runs.sort(key=lambda r:(r['status'] in ('running','starting'),r.get('end_ms',0)-r.get('start_ms',0),r['created_at']), reverse=True)
    return {'match_id':match_id,'pipeline':PIPELINE,'plans':assets(match_id),'videos':[{'id':s['id'],'filename':s['filename'],'sha256':s['sha256'],'metadata':json.loads(s['metadata'])} for s in videos], 'latest_run':runs[0] if runs else None,'model_installed':MODEL.exists(),'state':state}


def save_plan(match_id, payload):
    plan = next((p for p in assets(match_id) if p['id']==payload.get('id')),None)
    if not plan:raise ValueError('Schema non trovato')
    points=payload.get('points',[]);validate_points(points)
    if payload.get('reviewed') and not points:raise ValueError('Conferma almeno una posizione osservabile dello schema')
    previous=read(folder(match_id)/f'plan-{plan["id"]}.json')
    if previous:
        atomic(folder(match_id)/f'plan-history-{plan["id"]}-{time.time_ns()}.json',previous)
    if plan.get('side_rule'):
        candidate={**plan,'points':points}
        if payload.get('reviewed') and any(applicable_points(candidate,side) is None for side in ('left','right')):raise ValueError('Chiarisci le alternative di lato prima di confermare lo schema')
    plan.update(points=points,reviewed=bool(payload.get('reviewed')),notes=str(payload.get('notes',''))[:4000],reviewed_at=time.time() if payload.get('reviewed') else None,reviewed_by=payload.get('reviewed_by'))
    atomic(folder(match_id)/f'plan-{plan["id"]}.json',plan)
    return plan


class Detector:
    def __init__(self):
        import torch
        from torchvision.models.detection import fasterrcnn_mobilenet_v3_large_fpn
        if not MODEL.exists():raise ValueError('Installa i pesi Torchvision del prototipo prima di avviare il video')
        self.digest=sha256(MODEL)
        if not self.digest.startswith('fb6a3cc7'):raise ValueError('Checksum dei pesi non valido')
        self.torch=torch
        torch.set_num_threads(4)
        # Measured CPU baseline; MPS support is recorded, never assumed.
        self.model=fasterrcnn_mobilenet_v3_large_fpn(weights=None,weights_backbone=None).eval()
        self.model.load_state_dict(torch.load(MODEL,map_location='cpu',weights_only=True))
        self.info={'model':'Faster R-CNN MobileNetV3 Large FPN COCO_V1','sha256':self.digest,'torch':torch.__version__,'device':'cpu','mps_available':torch.backends.mps.is_available(),'pipeline':PIPELINE}

    def detect(self, frame):
        import cv2
        import numpy as np
        from torchvision.transforms.functional import to_tensor
        from torchvision.ops import nms
        # Exclude most sky; retain full pitch resolution, no artificial upscaling.
        h,w=frame.shape[:2];top=int(h*.15)
        crop=cv2.cvtColor(frame[top:,:],cv2.COLOR_BGR2RGB)
        with self.torch.inference_mode():out=self.model([to_tensor(crop)])[0]
        use=(out['labels']==1)&(out['scores']>=.35)
        boxes=out['boxes'][use];scores=out['scores'][use]
        keep=nms(boxes,scores,.35)
        result=[]
        hsv=cv2.cvtColor(frame,cv2.COLOR_BGR2HSV)
        for b,score in zip(boxes[keep].tolist(),scores[keep].tolist()):
            x0,y0,x1,y1=b;y0+=top;y1+=top
            if y1-y0 < 12 or x1-x0 < 4:continue
            # A patch around the feet should be grass: removes most spectators/bench.
            px=int((x0+x1)/2);py=int(y1)
            patch=hsv[max(0,py-3):min(h,py+8),max(0,px-12):min(w,px+12)]
            if patch.size==0:continue
            grass=((patch[:,:,0]>25)&(patch[:,:,0]<95)&(patch[:,:,1]>35)&(patch[:,:,2]>25)).mean()
            if grass<.35:continue
            shirt=frame[max(0,int(y0+(y1-y0)*.2)):min(h,int(y0+(y1-y0)*.55)),max(0,int(x0)):min(w,int(x1))]
            color=np.median(shirt.reshape(-1,3),axis=0).tolist() if shirt.size else [0,0,0]
            jersey=cv2.cvtColor(shirt,cv2.COLOR_BGR2HSV) if shirt.size else np.zeros((1,1,3),dtype=np.uint8)
            saturated=jersey[:,:,1]>80
            green_score=float(((jersey[:,:,0]>=35)&(jersey[:,:,0]<=95)&saturated).mean())
            red_score=float((((jersey[:,:,0]<=12)|(jersey[:,:,0]>=165))&saturated).mean())
            kit='green' if green_score>.25 and green_score>red_score*1.5 else 'red' if red_score>.25 and red_score>green_score*1.5 else 'unknown'
            result.append({'box':[round(x0,1),round(y0,1),round(x1,1),round(y1,1)],'foot':[round((x0+x1)/2,1),round(y1,1)],'score':round(score,4),'shirt_bgr':color,'kit_suggestion':kit,'player_id':None})
        return result


def concentration(detections,width):
    if len(detections)<8:return 0
    xs=sorted(d['foot'][0]/width for d in detections)
    central=xs[math.floor(len(xs)*.8)]-xs[math.floor(len(xs)*.2)]
    return round(max(0,1-central)*min(1,len(xs)/16),4)


def merge_windows(frames, threshold=.55, gap_ms=30000):
    groups=[]
    for frame in frames:
        if frame['concentration']<threshold:continue
        if groups and frame['video_ms']-groups[-1][-1]['video_ms']<=gap_ms:groups[-1].append(frame)
        else:groups.append([frame])
    result=[]
    for group in groups:
        best=max(group,key=lambda f:f['concentration'])
        result.append({'id':str(uuid.uuid5(uuid.NAMESPACE_URL, f"corner-frame-{group[0]['video_ms']}")),'video_ms':best['video_ms'],'start_ms':max(0,group[0]['video_ms']-15000),'end_ms':group[-1]['video_ms']+20000,'score':best['concentration'],'image':best['image'],'visible_detections':best['people'], 'status':'candidate_unverified','reason':'Raggruppamento di persone: può essere un piazzato, una fase di gioco o un falso positivo. Corner e squadra richiedono verifica.'})
    return sorted(result,key=lambda c:c['video_ms'])


def get_video(match_id,source_id):
    source=next((s for s in sources(match_id) if s['id']==source_id and s['kind']=='video'),None)
    if not source:raise ValueError('Video non trovato per questa partita')
    original=Path(source['local_path'])
    if not original.is_file() or original.stat().st_size!=source['size_bytes']:raise ValueError('Originale spostato o cambiato: ricollega la fonte verificando il checksum')
    proxy=match_dir(match_id)/f'proxy-{source_id}.mp4'
    return source,proxy if proxy.exists() else Path(source['local_path'])


def run_scan(match_id,source_id,run_id,start_ms=0,end_ms=None,step_ms=15000):
    import cv2
    if not re.fullmatch(r'[a-f0-9-]{36}',run_id):raise ValueError('Job non valido')
    source,path=get_video(match_id,source_id)
    duration=json.loads(source['metadata'])['duration_ms']
    end_ms=min(duration,int(end_ms or duration));start_ms=int(start_ms);step_ms=max(5000,int(step_ms))
    if not 0<=start_ms<end_ms:raise ValueError('Intervallo non valido')
    out=folder(match_id)/f'run-{run_id}';out.mkdir(exist_ok=True)
    state_path=out/'state.json';previous=read(state_path,{});code_sha=sha256(Path(__file__))
    previous_frames=previous.get('frames',[]) if previous.get('source_sha256')==source['sha256'] and previous.get('engine_sha256')==code_sha else []
    state={'id':run_id,'created_at':previous.get('created_at',time.time()),'status':'running','match_id':match_id,'source_id':source_id,'source_sha256':source['sha256'],'engine_sha256':code_sha,'start_ms':start_ms,'end_ms':end_ms,'step_ms':step_ms,'frames':previous_frames,'candidates':[],'error':None}
    atomic(state_path,state);begin=time.monotonic()
    cap=None
    try:
        detector=Detector();state['detector']=detector.info
        cap=cv2.VideoCapture(str(path))
        done={f['video_ms'] for f in state['frames']}
        for ms in range(start_ms,end_ms,step_ms):
            if (out/'cancel').exists():state['status']='cancelled';break
            if ms in done:continue
            cap.set(cv2.CAP_PROP_POS_MSEC,ms);ok,frame=cap.read()
            if not ok:raise ValueError(f'Fotogramma non leggibile a {ms} ms')
            detections=detector.detect(frame);name=f'frame-{ms}.jpg'
            cv2.imwrite(str(out/name),cv2.resize(frame,(960,540)))
            state['frames'].append({'video_ms':ms,'image':name,'people':len(detections),'concentration':concentration(detections,frame.shape[1]),'detections':detections,'width':frame.shape[1],'height':frame.shape[0]})
            state['progress']=(ms-start_ms+step_ms)/(end_ms-start_ms)
            state['candidates']=merge_windows(state['frames'])
            state['wall_seconds']=round(time.monotonic()-begin,3)
            atomic(state_path,state)
        else:state['status']='complete'
        state['progress']=min(1,state.get('progress',0));state['candidates']=merge_windows(state['frames'])
    except Exception as exc:
        state['status']='error';state['error']=str(exc)
    finally:
        if cap:cap.release()
        state['wall_seconds']=round(time.monotonic()-begin,3);atomic(state_path,state)
    return state


def homography(calibration):
    import numpy as np
    import cv2
    if not calibration or not calibration.get('verified'):return None
    pixels=calibration.get('pixels',[]);field=calibration.get('field',[])
    if len(pixels)!=4 or len(field)!=4:raise ValueError('Servono quattro riferimenti del campo')
    a=np.array(pixels,dtype=np.float32);b=np.array(field,dtype=np.float32)
    if not np.isfinite(a).all() or not np.isfinite(b).all():raise ValueError('Riferimenti non validi')
    if abs(cv2.contourArea(cv2.convexHull(a)))<100:raise ValueError('Riferimenti allineati o troppo vicini')
    return cv2.getPerspectiveTransform(a,b)


def project(point,matrix):
    import numpy as np
    v=matrix@np.array([point[0],point[1],1.0])
    return [float(v[0]/v[2]),float(v[1]/v[2])] if abs(v[2])>1e-8 else None


def evaluate(plan,positions,calibration,links,tolerance=3.0,kit=None,corner_side=None):
    h=homography(calibration)
    if not plan.get('reviewed') or h is None:
        return {'verdict':'non_valutabile','reason':'Schema e prospettiva del campo devono essere confermati.','checks':[]}
    if not isinstance(tolerance,(int,float)) or not .25<=tolerance<=15:raise ValueError('Tolleranza non valida')
    targets=applicable_points(plan,corner_side)
    if targets is None:return {'verdict':'non_valutabile','reason':'Indica il lato della battuta: le posizioni alternative non si sommano.','checks':[]}
    checks=[]
    if kit in ('green','red'):
        pending=[]
        for target in targets:
            if not target.get('active',True):continue
            for observed in positions:
                if observed.get('kit_suggestion')!=kit:continue
                field=project(observed['foot'],h)
                if field is not None:pending.append((math.dist(field,[target['x'],target['y']]),target,observed,field))
        targets_used=set();tracks_used=set()
        for distance,target,observed,field in sorted(pending,key=lambda p:p[0]):
            if target['id'] in targets_used or observed['track_id'] in tracks_used:continue
            targets_used.add(target['id']);tracks_used.add(observed['track_id'])
            checks.append({'target_id':target['id'],'role':target.get('label') or target['id'],'track_id':observed['track_id'],'observed':field,'expected':[target['x'],target['y']],'distance_m':round(distance,2),'within_tolerance':distance<=tolerance,'identity_verified':False,'matching':'nearest_geometry_proposal'})
    for target in targets:
        if not target.get('active',True):continue
        link=next((l for l in links if l.get('target_id')==target['id'] and l.get('verified')),None)
        observed=next((p for p in positions if link and str(p['track_id'])==str(link.get('track_id'))),None)
        if not observed:continue
        field=project(observed['foot'],h)
        if field is None:continue
        distance=math.dist(field,[target['x'],target['y']])
        checks=[c for c in checks if c['target_id']!=target['id']]
        checks.append({'target_id':target['id'],'role':target.get('label') or target['id'],'track_id':observed['track_id'],'observed':field,'expected':[target['x'],target['y']],'distance_m':round(distance,2),'within_tolerance':distance<=tolerance,'identity_verified':True})
    return {'verdict':'proposta_da_revisionare' if checks else 'non_valutabile','reason':'Confronto geometrico parziale. Gli abbinamenti proposti per vicinanza e colore non identificano i giocatori. Non dimostra conformità dell’intero schema.','corner_side':corner_side,'expected_positions':len(targets),'tolerance_m':tolerance,'checks':checks,'denominator':len(checks),'within_tolerance':sum(c['within_tolerance'] for c in checks)}


def camera_step(previous,current,excluded):
    import cv2
    import numpy as np
    h,w=previous.shape[:2]
    a=cv2.cvtColor(cv2.resize(previous,(w//2,h//2)),cv2.COLOR_BGR2GRAY)
    b=cv2.cvtColor(cv2.resize(current,(w//2,h//2)),cv2.COLOR_BGR2GRAY)
    hsv=cv2.cvtColor(cv2.resize(previous,(w//2,h//2)),cv2.COLOR_BGR2HSV)
    mask=cv2.inRange(hsv,np.array([20,10,25]),np.array([100,255,255]))
    mask[:h//8]=0
    for d in excluded:
        x0,y0,x1,y1=[int(v/2) for v in d['box']];mask[max(0,y0-8):y1+8,max(0,x0-8):x1+8]=0
    points=cv2.goodFeaturesToTrack(a,300,.01,10,mask=mask)
    if points is None or len(points)<12:return None
    following,status,_=cv2.calcOpticalFlowPyrLK(a,b,points,None)
    if following is None:return None
    good=status.reshape(-1)>0;first=points[good].reshape(-1,2)*2;second=following[good].reshape(-1,2)*2
    if len(first)<12:return None
    transform,inliers=cv2.findHomography(first,second,cv2.RANSAC,3)
    if transform is None or inliers.mean()<.65 or not np.isfinite(transform).all():return None
    corners=np.float32([[0,0],[w,0],[w,h],[0,h]]).reshape(1,-1,2)
    warped=cv2.perspectiveTransform(corners,transform)[0]
    if np.max(np.abs(warped-corners[0]))>w*.25:return None
    return transform


def evaluate_movement(plan,anchor,end,calibration,links,corner_side=None):
    import numpy as np
    h=homography(calibration)
    if h is None or not plan.get('reviewed') or anchor.get('base_to_frame') is None or end.get('base_to_frame') is None:
        return {'verdict':'non_valutabile','checks':[],'reason':'Movimento camera o prospettiva non verificabile.'}
    end_h=h@np.array(anchor['base_to_frame'])@np.linalg.inv(np.array(end['base_to_frame']))
    targets=applicable_points(plan,corner_side)
    if targets is None:return {'verdict':'non_valutabile','checks':[],'reason':'Lato della battuta non verificato.'}
    checks=[]
    for target in targets:
        movement=target.get('movement')
        link=next((l for l in links if l.get('target_id')==target['id'] and l.get('verified')),None)
        a=next((d for d in anchor['detections'] if link and str(d['track_id'])==str(link.get('track_id'))),None)
        b=next((d for d in end['detections'] if a and d['track_id']==a['track_id']),None)
        if not movement or not target.get('active',True) or not a or not b:continue
        observed_start=project(a['foot'],h);observed_end=project(b['foot'],end_h)
        if observed_start is None or observed_end is None:continue
        intended=np.array(movement['to'])-np.array([target['x'],target['y']]);actual=np.array(observed_end)-np.array(observed_start)
        length=float(np.linalg.norm(intended)*np.linalg.norm(actual))
        checks.append({'target_id':target['id'],'role':target.get('label') or target['id'],'track_id':a['track_id'],'observed_start':observed_start,'observed_end':observed_end,'expected_end':movement['to'],'end_distance_m':round(math.dist(observed_end,movement['to']),2),'direction_cosine':round(float(np.dot(intended,actual)/length),3) if length>.01 else None})
    return {'verdict':'proposta_da_revisionare' if checks else 'non_valutabile','checks':checks,'reason':'Confronto inizio-fine con compensazione proposta della camera; richiede verifica delle tracce e del piano. Non valuta sincronismi, blocchi o causalità.'}


def analyze_clip(match_id,payload):
    import cv2
    import numpy as np
    source,path=get_video(match_id,payload['source_id'])
    if sha256(Path(source['local_path']))!=source['sha256']:raise ValueError('Il video originale è cambiato: importalo come nuova fonte')
    start=int(payload['start_ms']);end=int(payload['end_ms'])
    if not 0<=start<end<=json.loads(source['metadata'])['duration_ms'] or end-start>120000:raise ValueError('Seleziona un episodio di massimo due minuti')
    import inspect
    code_sha=hashlib.sha256((PIPELINE+inspect.getsource(Detector)+inspect.getsource(camera_step)+inspect.getsource(analyze_clip)).encode()).hexdigest()
    event_id=str(uuid.uuid5(uuid.NAMESPACE_URL,f'{match_id}:{source["sha256"]}:{start}:{end}:{code_sha}'))
    out=folder(match_id)/f'event-{event_id}'
    cached=read(out/'event.json')
    if cached:return cached
    out.mkdir(exist_ok=True)
    detector=Detector();cap=cv2.VideoCapture(str(path));frames=[];next_id=1;last=None;cumulative=np.eye(3)
    try:
        for ms in range(start,end,500):
            cap.set(cv2.CAP_PROP_POS_MSEC,ms);ok,frame=cap.read()
            if not ok:break
            detections=detector.detect(frame)
            transform=camera_step(last,frame,frames[-1]['detections']) if last is not None else np.eye(3)
            cumulative=transform@cumulative if transform is not None and cumulative is not None else None
            last=frame.copy()
            # Short-lived image tracks; IDs reset after cuts/large camera changes.
            previous=frames[-1]['detections'] if frames else []
            used=set()
            for d in detections:
                candidates=[(math.dist(d['foot'],project(p['foot'],transform) or p['foot']),p) for p in previous if p['track_id'] not in used] if transform is not None else []
                near=min(candidates,key=lambda x:x[0]) if candidates else None
                if near and near[0]<max(20,(d['box'][3]-d['box'][1])*.8):d['track_id']=near[1]['track_id'];used.add(d['track_id'])
                else:d['track_id']=next_id;next_id+=1
                color=(80,230,120)
                b=list(map(int,d['box']));cv2.rectangle(frame,(b[0],b[1]),(b[2],b[3]),color,2);cv2.putText(frame,str(d['track_id']),(b[0],b[1]-4),cv2.FONT_HERSHEY_SIMPLEX,.6,color,2)
            name=f'frame-{ms}.jpg';cv2.imwrite(str(out/name),frame)
            frames.append({'video_ms':ms,'image':name,'detections':detections,'width':int(frame.shape[1]),'height':int(frame.shape[0]),'base_to_frame':cumulative.tolist() if cumulative is not None else None})
    finally:cap.release()
    clip=make_clip(match_id,source['id'],start,end)
    # Keep the clip in the registered original-derived media directory, referenced by ID.
    result={'id':event_id,'match_id':match_id,'source_id':source['id'],'source_sha256':source['sha256'],'engine_sha256':code_sha,'start_ms':start,'end_ms':end,'clip_filename':Path(clip).name,'detector':detector.info,'frames':frames,'review':None,'limitations':['ID di traccia provvisori: non sono nomi o numeri di maglia.','Il tracciamento in pixel può interrompersi con movimenti della camera e occlusioni.','Nessuna traiettoria in metri o giudizio sui movimenti è dedotto senza calibrazione temporale.']}
    atomic(out/'event.json',result)
    return result


def api(payload):
    match_id=str(payload['match_id']);op=payload['op'];base=folder(match_id)
    if op.startswith('reader_'):
        try:from .pdf_reader import api as reader_api
        except ImportError:from pdf_reader import api as reader_api
        return reader_api(payload)
    if op.startswith('play_'):
        try:from .open_play import api as play_api
        except ImportError:from open_play import api as play_api
        return play_api(payload)
    if op=='prepare':
        state=prepare(match_id)
        unique={}
        for p in sorted(base.glob('event-*/event.json'),key=lambda p:p.stat().st_mtime):
            event=read(p);unique[(event['source_id'],event['start_ms'],event['end_ms'])]=event
        state['events']=list(unique.values())
        return state
    if op=='save_plan':return save_plan(match_id,payload)
    if op=='event':return analyze_clip(match_id,payload)
    if op=='review':
        event_id=payload['event_id']
        if not re.fullmatch(r'[a-f0-9-]{36}',event_id):raise ValueError('Episodio non valido')
        path=base/f'event-{event_id}'/'event.json';event=read(path)
        if not event:raise ValueError('Episodio non trovato')
        plan=next((p for p in assets(match_id) if p['id']==payload['plan_id']),None)
        if not plan:raise ValueError('Schema non trovato')
        frame=next((f for f in event['frames'] if f['video_ms']==payload['frame_ms']),None)
        if not frame:raise ValueError('Fotogramma non trovato')
        result=evaluate(plan,frame['detections'],payload.get('calibration'),payload.get('links',[]),payload.get('tolerance_m',3),payload.get('team_kit'),payload.get('corner_side'))
        end_frame=next((f for f in event['frames'] if f['video_ms']==payload.get('movement_end_frame_ms')),None)
        if end_frame and end_frame['video_ms']>frame['video_ms']:result['movement']=evaluate_movement(plan,frame,end_frame,payload.get('calibration'),payload.get('links',[]),payload.get('corner_side'))
        revision={'created_at':time.time(),'reviewed_by':payload.get('reviewed_by'),'plan_id':plan['id'],'plan_snapshot':plan,'plan_snapshot_sha256':hashlib.sha256(json.dumps(plan,sort_keys=True).encode()).hexdigest(),'pdf_sha256':plan['pdf_sha256'],'pdf_page':plan['pdf_page'],'frame_ms':frame['video_ms'],'movement_end_frame_ms':payload.get('movement_end_frame_ms'),'corner_side':payload.get('corner_side'),'calibration':payload.get('calibration'),'team_kit':payload.get('team_kit'),'links':payload.get('links',[]),'result':result,'staff_note':str(payload.get('note',''))[:4000]}
        atomic(path.parent/f'review-{time.time_ns()}.json',revision);event['review']=revision;atomic(path,event)
        return event
    raise ValueError('Operazione non supportata')


def main():
    p=argparse.ArgumentParser();p.add_argument('command',choices=['api','scan']);p.add_argument('--match-id');p.add_argument('--source-id');p.add_argument('--run-id');p.add_argument('--start-ms',type=int,default=0);p.add_argument('--end-ms',type=int);args=p.parse_args()
    try:
        if args.command=='api':result=api(json.loads(sys.stdin.read()))
        else:result=run_scan(args.match_id,args.source_id,args.run_id,args.start_ms,args.end_ms)
        print(json.dumps(result,ensure_ascii=False))
        return 0
    except Exception as exc:
        print(json.dumps({'error':str(exc)},ensure_ascii=False));return 1

if __name__=='__main__':raise SystemExit(main())
