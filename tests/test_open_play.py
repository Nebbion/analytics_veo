import copy
import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from local_engine import open_play as play


class PlanContextTests(unittest.TestCase):
    def test_phase_zone_and_opponent_are_separate_conditions(self):
        attack=play.plan_context('3-4-3 SISTEMA DI GIOCO IN POSSESSO zona 2')
        self.assertEqual(attack['phase'],'in_possession')
        self.assertEqual(attack['zone'],'zone_2')
        self.assertEqual(attack['formation'],'3-4-3')
        defense=play.plan_context('USCITE VS 4312')
        self.assertEqual(defense['opponent_shape'],'4-3-1-2')
        self.assertEqual(play.plan_context('USCITE vs 4-2-3-1')['opponent_shape'],'4-2-3-1')
        self.assertIsNone(play.plan_context('CALCIO ANGOLO OFFENSIVO'))
        self.assertIsNone(play.plan_context('SISTEMA NON POSSESSO'))

    def test_context_does_not_approve_itself(self):
        plan={'context':play.plan_context('USCITE VS 4312')}
        context={'phase':'out_of_possession','opponent_shape':'4-3-1-2','attack_direction':'field_y_positive'}
        self.assertIsNotNone(play.verify_context(plan,context))
        context['verified']=True
        self.assertIsNone(play.verify_context(plan,context))
        for key,value in [('phase','in_possession'),('opponent_shape','4-2-3-1'),('attack_direction','unknown')]:
            self.assertIsNotNone(play.verify_context(plan,{**context,key:value}))


@unittest.skipUnless(importlib.util.find_spec('cv2') and importlib.util.find_spec('numpy'),'Optional CV dependencies absent')
class MotionTests(unittest.TestCase):
    def setUp(self):
        self.plan={'reviewed':True,'context':{'phase':'in_possession','zone':'zone_1'},'points':[{'id':'a','label':'Ruolo A','x':10,'y':10,'movement':{'to':[30,10]}}]}
        self.identity=[[1,0,0],[0,1,0],[0,0,1]]
        self.frames=[{'video_ms':i*500,'base_to_frame':[[1,0,i*100],[0,1,0],[0,0,1]],'detections':[{'track_id':1,'foot':[10+i*110,10]}]} for i in range(3)]
        self.event={'frames':self.frames}
        self.payload={'frame_ms':0,'end_frame_ms':1000,'context':{'verified':True,'phase':'in_possession','zone':'zone_1','attack_direction':'field_y_positive'},'links':[{'target_id':'a','track_id':1,'verified':True}],'calibration':{'verified':True,'coordinate_system':'own_goal_origin','pixels':[[0,0],[100,0],[100,100],[0,100]],'field':[[0,0],[100,0],[100,100],[0,100]]}}

    def test_camera_compensated_observation_and_interpretation_remain_distinct(self):
        result=play.measure_motion(self.plan,self.event,self.payload)
        self.assertEqual(result['verdict'],'proposta_da_revisionare')
        obs=result['observations'][0];proposal=result['movements'][0]
        self.assertEqual(obs['lateral_m'],20)
        self.assertEqual(obs['forward_m'],0)
        self.assertEqual(obs['path_m'],20)
        self.assertEqual(proposal['end_distance_m'],0)
        self.assertEqual(proposal['direction_cosine'],1)
        self.assertEqual(proposal['causality'],'non_valutata')
        self.assertNotIn('compliance',result)

    def test_static_formation_does_not_invent_expected_movement(self):
        del self.plan['points'][0]['movement']
        result=play.measure_motion(self.plan,self.event,self.payload)
        self.assertEqual(len(result['observations']),1)
        self.assertEqual(result['movements'],[])
        self.assertEqual(result['denominator'],0)

    def test_gaps_or_camera_failure_are_not_interpolated(self):
        for field,value in [('detections',[]),('base_to_frame',None)]:
            event=copy.deepcopy(self.event);event['frames'][1][field]=value
            result=play.measure_motion(self.plan,event,self.payload)
            self.assertEqual(result['observations'],[])
            self.assertEqual(result['movements'],[])
            self.assertLess(result['not_evaluable'][0]['coverage'],1)

    def test_unapproved_plan_unknown_phase_or_wrong_orientation_never_scored(self):
        for key,value in [('context',{**self.payload['context'],'verified':False}),('context',{**self.payload['context'],'zone':'zone_2'}),('calibration',{**self.payload['calibration'],'coordinate_system':'corner_origin'})]:
            result=play.measure_motion(self.plan,self.event,{**self.payload,key:value})
            self.assertEqual(result['verdict'],'non_valutabile')
            self.assertEqual(result['observations'],[])
        self.assertEqual(play.measure_motion({**self.plan,'reviewed':False},self.event,self.payload)['verdict'],'non_valutabile')

    def test_track_ids_are_not_identities_and_cannot_fill_two_roles(self):
        result=play.measure_motion(self.plan,self.event,{**self.payload,'links':[]})
        self.assertEqual(result['observations'],[])
        self.assertEqual(result['denominator'],0)
        with self.assertRaises(ValueError):play.measure_motion(self.plan,self.event,{**self.payload,'links':self.payload['links']+[{'target_id':'b','track_id':1,'verified':True}]})

    def test_invalid_end_frame_rejected(self):
        with self.assertRaises(ValueError):play.measure_motion(self.plan,self.event,{**self.payload,'end_frame_ms':750})

    def test_review_archives_sources_and_preserves_corner_review(self):
        with tempfile.TemporaryDirectory() as root:
            event_id='12345678-1234-1234-1234-123456789012';base=Path(root)
            (base/f'event-{event_id}').mkdir()
            event={**self.event,'source_id':'video-id','source_sha256':'a'*64,'review':{'kind':'corner'}}
            play.core.atomic(base/f'event-{event_id}'/'event.json',event)
            plan={**self.plan,'id':'plan-id','pdf_sha256':'b'*64}
            with patch.object(play.core,'folder',return_value=base),patch.object(play,'assets',return_value=[plan]):
                payload={**self.payload,'op':'play_review','match_id':'test','event_id':event_id,'plan_id':'plan-id','seasonal_model':{'id':'approved-model'},'note':'Correzione verificata'}
                first=play.api(payload);second=play.api(payload)
                self.assertEqual(first['review'],event['review'])
                self.assertEqual(second['open_play_review']['source_sha256'],'a'*64)
                self.assertEqual(second['open_play_review']['seasonal_model']['id'],'approved-model')
                self.assertEqual(len(list((base/f'event-{event_id}').glob('play-review-*.json'))),2)
                self.assertEqual(play.core.read(base/f'event-{event_id}'/'event.json')['open_play_review']['staff_note'],'Correzione verificata')
                plan['id']='another-plan'
                third=play.api({**payload,'plan_id':'another-plan'})
                self.assertEqual(set(third['open_play_reviews']),{'plan-id','another-plan'})
                self.assertEqual(third['open_play_reviews']['plan-id']['staff_note'],'Correzione verificata')


if __name__=='__main__':unittest.main()
