import copy
import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from types import SimpleNamespace
from local_engine import game_plan as game,open_play as play


class SourceTests(unittest.TestCase):
    def test_remaining_pages_have_distinct_meanings(self):
        self.assertEqual(game.page_kind("CALCIO D’ANGOLO DIFENSIVO"),'defensive_corner')
        self.assertEqual(game.page_kind('CALCIO DI PUNIZIONE DIFENSIVO + BARRIERA'),'defensive_free_kick')
        self.assertEqual(game.page_kind('PALLE INATTIVE\nFooter'),'set_piece_duties')
        self.assertEqual(game.page_kind('USCITE vs 4-2-3-1\nPalle Inattive'),'open_play')
        self.assertEqual(game.page_kind('Copertina generica'),'unsupported')

    def test_roster_does_not_infer_starters_from_shirt_number(self):
        text="Squadra\nModulo: 4-3-1-2\nConvocati\nRossi Luca (C)\nCentrocampista ('96)\n8\nVerdi Paolo\nPortiere ('01)\n12"
        brief=game.match_brief(text)
        self.assertEqual(brief['formation'],'4-3-1-2')
        self.assertEqual(len(brief['roster']),2)
        self.assertEqual(brief['roster'][0]['shirt_number'],8)
        self.assertTrue(all(p['is_starter'] is None for p in brief['roster']))
        self.assertNotIn('player_id',brief['roster'][0])

    def test_set_piece_context_requires_type_and_drawn_side_without_mirroring(self):
        plan={'context':play.plan_context("CALCIO D'ANGOLO DIFENSIVO")}
        context={**plan['context'],'verified':True,'attack_direction':'field_y_positive'}
        self.assertIsNotNone(play.verify_context(plan,context))
        context['side_as_drawn_verified']=True
        self.assertIsNone(play.verify_context(plan,context))
        self.assertIsNotNone(play.verify_context(plan,{**context,'set_piece_type':'defensive_free_kick'}))

    def test_role_correction_updates_the_reused_group_without_second_entry(self):
        plan={'id':'plan','kind':'defensive_corner','points':[],'role_groups':[{'id':'markers','members':['Old name']}],'reviewed':False}
        point={'id':'role','label':'Corrected reference','x':10,'y':20,'active':True,'role_group':'markers','comparison_mode':'role_only'}
        with tempfile.TemporaryDirectory() as root,patch.object(play.core,'folder',return_value=Path(root)),patch.object(play,'assets',return_value=[plan]):
            saved=play.save_plan('test',{'id':'plan','points':[point],'reviewed':True})
            self.assertEqual(saved['role_groups'][0]['members'],['Corrected reference'])
            self.assertEqual(play.core.read(Path(root)/'play-plan-plan.json')['role_groups'],saved['role_groups'])

    @unittest.skipUnless(importlib.util.find_spec('pymupdf'),'Optional PDF dependency absent')
    def test_unknown_pages_stay_in_inventory_without_becoming_supported_analysis(self):
        pages=[SimpleNamespace(get_text=lambda:'PALLE INATTIVE'),SimpleNamespace(get_text=lambda:'Diagramma non interpretabile')]
        with patch.object(play.core,'sources',return_value=[{'id':'source','kind':'pdf','local_path':'unused','sha256':'a'*64}]),patch('pymupdf.open') as pdf:
            pdf.return_value.__enter__.return_value=pages
            inventory=play.inventory('test',[{'id':'source-1','title':'Battitori','kind':'set_piece_duties','duties':[]}],[])
        self.assertTrue(inventory[0]['available']);self.assertTrue(inventory[0]['needs_interpretation'])
        self.assertFalse(inventory[1]['available']);self.assertEqual(inventory[1]['kind'],'unsupported')


class DutiesTests(unittest.TestCase):
    def setUp(self):
        self.group={'id':'direct-left','event_type':'direct_free_kick','members':['Rossi','Verdi']}
        self.plan={'id':'plan-id','kind':'set_piece_duties','reviewed':True,'duties':[self.group],'points':[]}
        self.event={'frames':[{'video_ms':1000}]}
        self.payload={'duty_id':'direct-left','frame_ms':1000,'context':{'verified':True,'duty_id':'direct-left','event_type':'direct_free_kick'},'observed_taker':{'name':'Rossi Luca','player_id':'canonical-player','verified':True},'taker_reference':'Rossi','reference_verified':True}

    def test_assignments_need_no_field_calibration_and_never_infer_priority(self):
        result=game.review_duty(self.plan,self.event,self.payload)
        self.assertEqual(result['verdict'],'proposta_da_revisionare')
        self.assertEqual(result['observations'][0]['source'],'staff_video_verification')
        self.assertTrue(result['interpretations'][0]['listed'])
        self.assertEqual(result['interpretations'][0]['priority'],'not_inferred')
        self.assertNotIn('geometry',result)

    def test_unapproved_or_unverified_taker_is_not_a_video_fact(self):
        cases=[{**self.payload,'observed_taker':{**self.payload['observed_taker'],'verified':False}},
               {**self.payload,'context':{**self.payload['context'],'event_type':'penalty'}},
               {**self.payload,'frame_ms':999},
               {**self.payload,'reference_verified':False}]
        for payload in cases:
            result=game.review_duty(self.plan,self.event,payload)
            self.assertEqual(result['verdict'],'non_valutabile');self.assertFalse(result['observations'])
        self.assertEqual(game.review_duty({**self.plan,'reviewed':False},self.event,self.payload)['verdict'],'non_valutabile')

    def test_alternative_is_not_ranked_and_unlisted_is_not_automatically_an_error(self):
        other=game.review_duty(self.plan,self.event,{**self.payload,'taker_reference':'Verdi'})
        self.assertTrue(other['interpretations'][0]['listed'])
        missing=game.review_duty(self.plan,self.event,{**self.payload,'taker_reference':'not_listed'})
        self.assertFalse(missing['interpretations'][0]['listed'])
        self.assertEqual(missing['verdict'],'proposta_da_revisionare')
        with self.assertRaises(ValueError):game.review_duty(self.plan,self.event,{**self.payload,'taker_reference':'Other group'})

    def test_invalid_or_duplicated_groups_are_rejected(self):
        game.validate_duties([self.group])
        for groups in [[],[self.group,self.group],[{**self.group,'members':['Rossi','rossi']}],[{**self.group,'event_type':'goal'}]]:
            with self.assertRaises(ValueError):game.validate_duties(groups)

    def test_correction_is_reused_and_duty_review_archives_video_and_plan(self):
        with tempfile.TemporaryDirectory() as root:
            base=Path(root);event_id='12345678-1234-1234-1234-123456789012'
            (base/f'event-{event_id}').mkdir()
            event={**self.event,'source_id':'video','source_sha256':'a'*64,'review':{'kind':'corner'},'open_play_reviews':{'other-plan':{'staff_note':'kept'}}}
            play.core.atomic(base/f'event-{event_id}'/'event.json',event)
            plan={**self.plan,'pdf_sha256':'b'*64,'pdf_page':9}
            with patch.object(play.core,'folder',return_value=base),patch.object(play,'assets',return_value=[plan]):
                saved=play.save_plan('test',{'id':plan['id'],'points':[],'duties':[self.group],'reviewed':True,'notes':'Alternatives confirmed','reviewed_by':'staff'})
                self.assertTrue(saved['reviewed'])
                result=play.api({**self.payload,'op':'play_review','match_id':'test','event_id':event_id,'plan_id':plan['id']})
                self.assertEqual(result['review']['kind'],'corner')
                self.assertEqual(result['open_play_reviews']['other-plan']['staff_note'],'kept')
                review=result['open_play_reviews']['plan-id']
                self.assertEqual(review['source_sha256'],'a'*64)
                self.assertEqual(review['plan_snapshot']['duties'][0]['members'],['Rossi','Verdi'])
                self.assertTrue(review['reference_verified'])
                self.assertEqual(len(list((base/f'event-{event_id}').glob('play-review-*.json'))),1)


@unittest.skipUnless(importlib.util.find_spec('numpy') and importlib.util.find_spec('cv2'),'Optional CV dependencies absent')
class DefensiveGeometryTests(unittest.TestCase):
    def test_own_goal_rotates_both_axes_not_only_the_goal_line(self):
        from local_engine.corner_engine import project
        import numpy as np
        grid={'field':[[0,105],[68,105],[68,52.5],[0,52.5]],'matrix':np.eye(3).tolist()}
        rotated=game.defensive_grid(grid)
        self.assertEqual(project([10,100],np.array(rotated['matrix'])),[58,5])
        self.assertEqual(rotated['field'],[[68,0],[0,0],[0,52.5],[68,52.5]])

    def test_markers_are_roles_not_fixed_positions_and_wall_does_not_add_players(self):
        identity=[[1,0,0],[0,1,0],[0,0,1]]
        plan={'reviewed':True,'context':{'phase':'out_of_possession'},'points':[{'id':'marker','label':'Rossi','x':10,'y':10,'comparison_mode':'role_only'}],
              'role_groups':[{'id':'markers','members':['Rossi']}],'wall':{'illustrated_slots':5,'expected_count':None}}
        event={'frames':[{'video_ms':i*500,'base_to_frame':identity,'detections':[{'track_id':1,'foot':[30+i,20]}]} for i in range(2)]}
        payload={'context':{'phase':'out_of_possession','verified':True,'attack_direction':'field_y_positive'},'frame_ms':0,'end_frame_ms':500,'links':[{'target_id':'marker','track_id':1,'verified':True}],
                 'calibration':{'verified':True,'coordinate_system':'own_goal_origin','pixels':[[0,0],[100,0],[100,100],[0,100]],'field':[[0,0],[100,0],[100,100],[0,100]]}}
        result=play.measure_motion(plan,event,payload)
        self.assertEqual(result['geometry']['checks'],[])
        self.assertEqual(len(result['observations']),1)
        self.assertEqual(result['movements'],[])
        self.assertIsNone(result['wall']['expected_count'])
        self.assertEqual(len(plan['points']),1)


if __name__=='__main__':unittest.main()
