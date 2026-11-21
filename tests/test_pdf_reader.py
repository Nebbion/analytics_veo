import copy
import importlib.util
import tempfile
import io
import json
import unittest
from pathlib import Path
from unittest.mock import patch
from local_engine import pdf_reader as reader


def entity(key='p1',label='Rossi',anchor=None,kind='player'):
    return {'id':key,'kind':kind,'label':label,'bbox':[.1,.2,.3,.4],'anchor':anchor,'corner_side':'both'}


def reading():
    return {'title':'Costruzione bassa','kind':'open_play','phase':'in_possession','zone':'zone_1','opponent_shape':None,'own_goal':'bottom',
            'field':{'extent':'full','half':'unknown','corners':[[0,0],[1,0],[1,1],[0,1]]},'entities':[entity(anchor=[.2,.7])],'relations':[],'questions':[]}


def relation(key='r1',kind='movement',subjects=None,targets=None):
    return {'id':key,'kind':kind,'subjects':subjects or ['p1'],'targets':targets or [],'destination':[.3,.4] if kind=='movement' else None,
            'bbox':[.1,.2,.4,.8],'description':'Indicazione visibile nella pagina','event_type':'unknown'}


def saved_page(value=None):
    value=value or reading()
    return {'reading':value,'source_id':'12345678-1234-1234-1234-123456789012','source_sha256':'a'*64,'page':1,'image':'reader-source-1.png',
            'review':{'created_at':10,'reviewed_by':'staff','note':''},'revision':'revision','fingerprint':'extraction','needs_visual_reading':False,'engine':'local_vision','questions':value['questions']}


class ContractTests(unittest.TestCase):
    def test_model_cannot_supply_approval_or_extra_actions(self):
        reader.validate_reading(reading())
        with self.assertRaises(ValueError):reader.validate_reading({**reading(),'reviewed':True})
        with self.assertRaises(ValueError):reader.validate_reading({**reading(),'tool':'execute_command'})

    def test_invalid_boxes_coordinates_and_references_are_rejected(self):
        for point in ([float('nan'),.2],[2,.2],[True,.2]):
            value=reading();value['entities'][0]['anchor']=point
            with self.assertRaises(ValueError):reader.validate_reading(value)
        value=reading();value['entities'][0]['bbox']=[.3,.4,.1,.2]
        with self.assertRaises(ValueError):reader.validate_reading(value)
        value=reading();value['relations']=[relation(subjects=['missing'])]
        with self.assertRaises(ValueError):reader.validate_reading(value)
        value=reading();value['relations']=[relation()];value['relations'][0]['destination']=None
        with self.assertRaises(ValueError):reader.validate_reading(value)

    def test_alternative_symbols_never_turn_into_runs(self):
        value=reading();value['entities'].append(entity('p2',anchor=[.7,.7]));value['relations']=[relation(kind='alternatives',targets=['p2'])]
        reader.validate_reading(value)
        self.assertIsNone(value['relations'][0]['destination'])
        self.assertEqual(value['relations'][0]['kind'],'alternatives')

    def test_ocr_proposes_only_text_references_not_player_positions(self):
        roster=[{'player_id':'canonical','nome':'Rossi Luca'}]
        blocks=[{'text':'Piano settimanale','bbox':[0,.1,.2,.2]},{'text':'Rossi','bbox':[.1,.3,.2,.4]},
                {'text':'CORNER A SFAVORE','bbox':[.4,.1,.7,.2]}]
        result=reader.baseline(blocks,roster,'Un titolo diverso')
        self.assertEqual(result['kind'],'defensive_corner')
        self.assertEqual(result['entities'][0]['kind'],'player_reference')
        self.assertIsNone(result['entities'][0]['anchor'])
        self.assertIsNone(result['field']);self.assertFalse(result['relations'])
        self.assertNotIn('player_id',result['entities'][0])

    def test_duplicate_names_remain_ambiguous(self):
        roster=[{'player_id':'one','nome':'Rossi Luca'},{'player_id':'two','nome':'Rossi Marco'}]
        self.assertEqual(len(reader.roster_links('Rossi',roster)),2)
        value=reader.baseline([{'text':'Rossi','bbox':[.1,.2,.3,.4]}],roster,'Piano')
        self.assertFalse(value['entities'])

    def test_copyright_name_is_not_mistaken_for_a_player_reference(self):
        roster=[{'player_id':'one','nome':'Verdi Giovanni'}]
        result=reader.baseline([{'text':'Giovanni','line_text':'Copia concessa in licenza a Giovanni. Tutti i diritti riservati.','bbox':[.1,.9,.2,.95]}],roster,'Piano')
        self.assertEqual(result['entities'],[])

    def test_vision_transport_is_loopback_only_and_validates_model_output(self):
        class Opener:
            def open(self,request,timeout):
                if isinstance(request,str):return io.BytesIO(json.dumps({'models':[{'name':'local-model','size':2000000,'digest':'a'*64,'details':{'format':'gguf'}}]}).encode())
                self.request=request
                return io.BytesIO(json.dumps({'done':True,'response':json.dumps(reading())}).encode())
        opener=Opener()
        with tempfile.TemporaryDirectory() as root:
            image=Path(root)/'image.png';image.write_bytes(b'local-pixels')
            with patch.object(reader,'LOCAL_MODEL','local-model'),patch('urllib.request.build_opener',return_value=opener) as build:
                result=reader.vision_read(image,[],[])
                self.assertEqual(result['kind'],'open_play')
                self.assertEqual(opener.request.full_url,'http://127.0.0.1:11434/api/generate')
                self.assertEqual(build.call_args.args[0].proxies,{})
                self.assertIsInstance(build.call_args.args[1],reader.NoRedirect)
                request=json.loads(opener.request.data)
                self.assertEqual(request['format'],reader.SCHEMA)
                self.assertNotIn('reviewed',request)
        self.assertIsNone(reader.NoRedirect().redirect_request(None,None,302,'',{},'https://remote.invalid'))

    def test_cloud_model_cannot_receive_the_page(self):
        with patch.object(reader,'LOCAL_MODEL','vision:cloud'),patch('urllib.request.build_opener') as network:
            with self.assertRaises(RuntimeError):reader.vision_read(Path('not-read'),[],[])
            network.assert_not_called()


@unittest.skipUnless(importlib.util.find_spec('cv2') and importlib.util.find_spec('numpy'),'Optional CV dependencies absent')
class CompilationTests(unittest.TestCase):
    def test_verified_field_projects_anchors_and_arrows(self):
        value=reading();value['relations']=[relation()]
        plan,blocked=reader.compile_plan(saved_page(value))
        self.assertFalse(blocked);self.assertTrue(plan['reviewed'])
        self.assertAlmostEqual(plan['points'][0]['x'],13.6,places=3)
        self.assertAlmostEqual(plan['points'][0]['y'],31.5,places=3)
        self.assertAlmostEqual(plan['points'][0]['movement']['to'][1],63,places=3)
        self.assertEqual(plan['pdf_sha256'],'a'*64)

    def test_unknown_orientation_or_missing_anchor_blocks_metrics(self):
        value=reading();value['own_goal']='unknown'
        self.assertIsNone(reader.compile_plan(saved_page(value))[0])

    def test_unreadable_name_keeps_anonymous_geometry_without_creating_a_player(self):
        value=reading();value['entities'][0]['label']=''
        plan,blocked=reader.compile_plan(saved_page(value))
        self.assertFalse(blocked);self.assertEqual(len(plan['points']),1)
        self.assertEqual(plan['points'][0]['label'],'Riferimento p1')
        self.assertNotIn('player_id',plan['points'][0])
        value=reading();value['entities'][0]['anchor']=None
        self.assertIsNone(reader.compile_plan(saved_page(value))[0])

    def test_defensive_half_rotates_both_axes_and_role_group_is_not_a_line(self):
        value=reading();value.update(kind='defensive_corner',phase='out_of_possession',own_goal='top')
        value['field'].update(extent='half',half='own');value['entities'][0]['anchor']=[.25,.1]
        value['entities']+=[entity('p2','Verdi',kind='player_reference'),entity('group','Marcatori',kind='role_group')]
        value['relations']=[relation(kind='role_assignment',subjects=['p2'],targets=['group'])]
        plan,_=reader.compile_plan(saved_page(value));point=plan['points'][0]
        self.assertAlmostEqual(point['x'],51,places=3);self.assertAlmostEqual(point['y'],5.25,places=3)
        self.assertEqual(plan['points'][1]['comparison_mode'],'role_only')
        self.assertEqual(plan['role_groups'][0]['members'],['Verdi'])
        self.assertEqual(plan['context']['side_scope'],'as_drawn_only')

    def test_side_alternatives_are_mutually_exclusive(self):
        value=reading();value['kind']='offensive_corner';value['field'].update(extent='half',half='opponent')
        value['entities']+=[entity('p2',anchor=[.7,.7])]
        value['entities'][0]['corner_side']='left';value['entities'][1]['corner_side']='right'
        value['relations']=[relation(kind='alternatives',targets=['p2'])]
        plan,blocked=reader.compile_plan(saved_page(value));self.assertFalse(blocked)
        self.assertEqual([p['sides'] for p in plan['points']],[['left'],['right']])
        value['entities'][1]['corner_side']='unknown'
        self.assertIsNone(reader.compile_plan(saved_page(value))[0])

    def test_taker_list_excludes_group_heading_and_needs_no_field(self):
        value=reading();value['kind']='set_piece_duties';value['field']=None
        value['entities']=[entity(kind='player_reference'),entity('header','Rigoristi',kind='role_group')]
        r=relation(kind='taker_list',targets=['header']);r['event_type']='penalty';value['relations']=[r]
        plan,blocked=reader.compile_plan(saved_page(value))
        self.assertFalse(blocked);self.assertEqual(plan['points'],[])
        self.assertEqual(plan['duties'][0]['members'],['Rossi'])


class ReviewTests(unittest.TestCase):
    def test_text_only_cannot_be_promoted_even_if_request_claims_vision(self):
        saved=saved_page();saved['needs_visual_reading']=True
        with patch.object(reader,'get_page',return_value=saved):
            with self.assertRaisesRegex(ValueError,'parte testuale'):reader.review_page('test',{'source_id':saved['source_id'],'page':1,'fingerprint':'extraction','revision':'revision','action':'approve','needs_visual_reading':False})

    def test_stale_review_is_rejected_without_writing(self):
        with patch.object(reader,'get_page',return_value=saved_page()),patch.object(reader.core,'atomic') as write:
            with self.assertRaisesRegex(ValueError,'recente'):reader.review_page('test',{'fingerprint':'extraction','revision':'old','action':'correct'})
            write.assert_not_called()

    def test_corrections_survive_and_do_not_silently_approve_the_page(self):
        saved=saved_page();saved['needs_visual_reading']=True
        with tempfile.TemporaryDirectory() as root,patch.object(reader,'get_page',return_value=saved),patch.object(reader.core,'folder',return_value=Path(root)):
            result=reader.review_page('test',{'fingerprint':'extraction','revision':'revision','action':'correct','labels':{'p1':'Verdi'},'note':'Nome corretto','reader_roster':[{'nome':'Verdi Paolo','player_id':'v'}]})
            self.assertEqual(result['reading']['entities'][0]['label'],'Verdi')
            self.assertEqual(result['status'],'corrected');self.assertFalse(result['ready_for_comparison'])
            self.assertEqual(result['entity_links']['p1'][0]['player_id'],'v')
            self.assertNotEqual(result['revision'],'revision')
            self.assertEqual(len(list(Path(root).glob('reader-review-*.json'))),1)
            self.assertFalse(reader.core.read(Path(root)/f'reader-approved-{saved["source_id"]}-1.json')['active'])

    def test_unanswered_questions_can_be_deferred_but_not_approved(self):
        saved=saved_page();saved['reading']['questions']=[{'id':'q','field':'own_goal','relation_id':None,'entity_id':None,'prompt':'Quale porta?'}]
        with tempfile.TemporaryDirectory() as root,patch.object(reader,'get_page',return_value=saved),patch.object(reader.core,'folder',return_value=Path(root)):
            with self.assertRaisesRegex(ValueError,'ambigui'):reader.review_page('test',{'fingerprint':'extraction','revision':'revision','action':'approve'})
            result=reader.review_page('test',{'fingerprint':'extraction','revision':'revision','action':'correct'})
            self.assertEqual(result['status'],'corrected')

    @unittest.skipUnless(importlib.util.find_spec('cv2'),'Optional CV dependency absent')
    def test_only_approved_compiled_reading_reaches_video_and_source_changes_invalidate_it(self):
        saved=saved_page()
        with tempfile.TemporaryDirectory() as root:
            base=Path(root);original=base/'source.pdf';original.write_bytes(b'isolated source fixture')
            saved['source_sha256']=reader.core.sha256(original)
            source={'id':saved['source_id'],'sha256':saved['source_sha256'],'kind':'pdf','local_path':str(original)}
            with patch.object(reader,'get_page',return_value=saved),patch.object(reader.core,'folder',return_value=base),patch.object(reader.core,'sources',return_value=[source]):
                result=reader.review_page('test',{'fingerprint':'extraction','revision':'revision','action':'approve','reviewed_by':'staff'})
                self.assertTrue(result['ready_for_comparison'])
                self.assertEqual(reader.approved_plans('test')[0]['reader_revision'],result['revision'])
                original.write_bytes(b'changed fixture')
                self.assertEqual(reader.approved_plans('test'),[])


@unittest.skipUnless(importlib.util.find_spec('pymupdf'),'Optional PDF dependency absent')
class PDFTests(unittest.TestCase):
    def test_text_direction_controls_rendering_instead_of_page_number_or_shape(self):
        import pymupdf
        with tempfile.TemporaryDirectory() as root:
            for rotate,expected in [(0,0),(90,90),(180,180),(270,270)]:
                with pymupdf.open() as document:
                    page=document.new_page(width=600,height=600);page.insert_text((300,300),'SCHEMA DI GIOCO',rotate=rotate)
                    value=reader.render_page(page,Path(root)/f'page-{rotate}.png')
                    self.assertEqual(value['rotation'],expected)
                    self.assertTrue(value['blocks'])
                    self.assertTrue(all(0<=v<=1 for b in value['blocks'] for v in b['bbox']))

    def test_cache_reuses_corrected_reading_without_another_ocr_pass(self):
        import pymupdf
        open_document=pymupdf.open
        def fake_pdf(*args,**kwargs):
            document=open_document();page=document.new_page();page.insert_text((50,50),'Rossi costruzione bassa');return document
        source={'id':'12345678-1234-1234-1234-123456789012','sha256':'a'*64,'local_path':'unused'}
        payload={'source_id':source['id'],'page':1,'reader_roster':[{'nome':'Rossi Luca','player_id':'one'}]}
        with tempfile.TemporaryDirectory() as root,patch.object(reader,'source_pdf',return_value=source),patch.object(reader.core,'folder',return_value=Path(root)),patch.object(reader,'LOCAL_MODEL',''),patch('pymupdf.open',side_effect=fake_pdf),patch.object(reader,'native_ocr',return_value=[]) as ocr:
            first=reader.read_page('test',payload)
            reader.review_page('test',{**payload,'fingerprint':first['fingerprint'],'revision':first['revision'],'action':'correct','labels':{'e1':'Rossi Luca'}})
            second=reader.read_page('test',payload)
            self.assertEqual(second['reading']['entities'][0]['label'],'Rossi Luca')
            self.assertEqual(second['status'],'corrected');self.assertEqual(ocr.call_count,1)


if __name__=='__main__':unittest.main()
