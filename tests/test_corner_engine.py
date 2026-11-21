import importlib.util
import unittest
from local_engine.corner_engine import merge_windows,validate_points

class CandidateTests(unittest.TestCase):
    def test_candidates_are_stable_unverified_not_corner_facts(self):
        frames=[{'video_ms':t,'concentration':.8,'image':f'{t}.jpg','people':15} for t in [10000,25000,100000]]
        a=merge_windows(frames);b=merge_windows(frames)
        self.assertEqual(len(a),2)
        self.assertEqual(a[0]['id'],b[0]['id'])
        self.assertEqual(a[0]['status'],'candidate_unverified')
        self.assertNotIn('player_id',a[0])
        self.assertGreaterEqual(a[0]['start_ms'],0)

    def test_nonfinite_plan_coordinates_and_invalid_movement_are_rejected(self):
        with self.assertRaises(ValueError):validate_points([{'x':float('nan'),'y':3}])
        with self.assertRaises(ValueError):validate_points([{'x':1,'y':3,'movement':{'to':[None,2]}}])

@unittest.skipUnless(importlib.util.find_spec('cv2') and importlib.util.find_spec('numpy'),'Optional CV dependencies absent')
class GeometryTests(unittest.TestCase):
    def setUp(self):
        self.cal={'verified':True,'pixels':[[0,0],[100,0],[100,100],[0,100]],'field':[[0,0],[100,0],[100,100],[0,100]]}
        self.plan={'reviewed':True,'points':[{'id':'P1','label':'Ruolo atteso','x':10,'y':10,'movement':{'to':[30,10]}}]}
        self.positions=[{'track_id':1,'foot':[10,10],'kit_suggestion':'green','player_id':None}]
        self.links=[{'target_id':'P1','track_id':1,'verified':True}]

    def test_without_approved_plan_or_calibration_no_compliance_claim(self):
        from local_engine.corner_engine import evaluate
        self.assertEqual(evaluate({**self.plan,'reviewed':False},self.positions,self.cal,self.links)['verdict'],'non_valutabile')
        self.assertEqual(evaluate(self.plan,self.positions,None,self.links)['verdict'],'non_valutabile')
        self.assertEqual(evaluate(self.plan,self.positions,self.cal,[])['verdict'],'non_valutabile')

    def test_confirmed_position_has_distance_and_denominator_but_remains_proposal(self):
        from local_engine.corner_engine import evaluate
        result=evaluate(self.plan,self.positions,self.cal,self.links)
        self.assertEqual(result['verdict'],'proposta_da_revisionare')
        self.assertEqual(result['checks'][0]['distance_m'],0)
        self.assertEqual(result['denominator'],1)
        self.assertTrue(result['checks'][0]['identity_verified'])

    def test_kit_geometry_never_identifies_a_player(self):
        from local_engine.corner_engine import evaluate
        result=evaluate(self.plan,self.positions,self.cal,[],kit='green')
        self.assertEqual(result['denominator'],1)
        self.assertFalse(result['checks'][0]['identity_verified'])
        self.assertNotIn('player_id',result['checks'][0])
        self.assertEqual(evaluate(self.plan,self.positions,self.cal,[],kit='red')['verdict'],'non_valutabile')

    def test_movement_compensates_camera_translation(self):
        from local_engine.corner_engine import evaluate_movement
        a={'detections':self.positions,'base_to_frame':[[1,0,0],[0,1,0],[0,0,1]]}
        b={'detections':[{'track_id':1,'foot':[130,10]}],'base_to_frame':[[1,0,100],[0,1,0],[0,0,1]]}
        result=evaluate_movement(self.plan,a,b,self.cal,self.links)
        self.assertEqual(result['checks'][0]['end_distance_m'],0)
        self.assertEqual(result['checks'][0]['direction_cosine'],1)
        b['base_to_frame']=None
        self.assertEqual(evaluate_movement(self.plan,a,b,self.cal,self.links)['verdict'],'non_valutabile')

    def test_collinear_camera_points_rejected(self):
        from local_engine.corner_engine import homography
        with self.assertRaises(ValueError):homography({**self.cal,'pixels':[[0,0],[1,1],[2,2],[3,3]]})


class CornerSideTests(unittest.TestCase):
    def setUp(self):
        self.plan={'pdf_sha256':'a'*64,'pdf_page':6,'reviewed':True,'points':[
            {'id':'left','x':1,'y':1,'active':True},
            {'id':'right','x':67,'y':1,'active':True},
            {'id':'common','x':34,'y':12,'active':True}]}
        self.interpretation={'pdf_sha256':'a'*64,'meaning':'circled_positions_are_alternatives_by_corner_side','reference_side':'left','pages':{'6':{'icons':[
            {'label':'Stesso ruolo','x':1,'y':1,'circled':False},
            {'label':'Stesso ruolo','x':67,'y':1,'circled':True},
            {'label':'Ruolo comune','x':34,'y':12,'circled':False}]}}}

    def test_alternatives_are_one_role_per_side_not_an_extra_player(self):
        from local_engine.corner_engine import apply_side_rule,applicable_points
        plan=apply_side_rule(self.plan,self.interpretation)
        self.assertFalse(plan['reviewed'])
        self.assertTrue(plan['side_rule']['confirmed_meaning'])
        self.assertEqual([p['id'] for p in applicable_points(plan,'left')],['left','common'])
        self.assertEqual([p['id'] for p in applicable_points(plan,'right')],['right','common'])
        self.assertIsNone(applicable_points(plan,None))
        self.assertFalse(any('movement' in p for p in plan['points']))

    def test_clarification_is_scoped_to_source_and_reapplication_preserves_edits(self):
        from local_engine.corner_engine import apply_side_rule
        self.assertEqual(apply_side_rule(self.plan,{**self.interpretation,'pdf_sha256':'b'*64}),self.plan)
        plan=apply_side_rule(self.plan,self.interpretation)
        plan['points'][0]['x']=2;plan['reviewed']=True
        self.assertEqual(apply_side_rule(plan,self.interpretation),plan)

    def test_ambiguous_or_duplicate_assignments_cannot_be_evaluated(self):
        from local_engine.corner_engine import apply_side_rule,applicable_points
        plan=apply_side_rule(self.plan,self.interpretation)
        plan['points'][1]['sides']=['left','right']
        self.assertIsNone(applicable_points(plan,'left'))
        self.assertEqual(len(applicable_points(plan,'right')),2)
        plan['points'][0]['sides']=[]
        self.assertIsNone(applicable_points(plan,'right'))

    @unittest.skipUnless(importlib.util.find_spec('cv2') and importlib.util.find_spec('numpy'),'Optional CV dependencies absent')
    def test_geometry_never_uses_the_other_side_even_if_it_is_closer(self):
        from local_engine.corner_engine import apply_side_rule,evaluate
        plan=apply_side_rule(self.plan,self.interpretation);plan['reviewed']=True
        cal={'verified':True,'pixels':[[0,0],[100,0],[100,100],[0,100]],'field':[[0,0],[100,0],[100,100],[0,100]]}
        positions=[{'track_id':1,'foot':[67,1],'kit_suggestion':'green'}]
        self.assertEqual(evaluate(plan,positions,cal,[],kit='green')['verdict'],'non_valutabile')
        left=evaluate(plan,positions,cal,[],kit='green',corner_side='left')
        right=evaluate(plan,positions,cal,[],kit='green',corner_side='right')
        self.assertTrue(all(c['target_id']!='right' for c in left['checks']))
        self.assertEqual(left['within_tolerance'],0)
        self.assertEqual(right['within_tolerance'],1)
        self.assertEqual(right['expected_positions'],2)

if __name__=='__main__':unittest.main()
