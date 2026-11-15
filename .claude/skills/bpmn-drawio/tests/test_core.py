"""Observable invariants, failure cases and portability; no browser required."""
from pathlib import Path
from copy import deepcopy
import base64
import json
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET
import zlib
from urllib.parse import quote

SKILL=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(SKILL/'scripts'))
from bpmn_builder import Diagram, document
from create_demo import build
from drawio_common import pages, cells, style, canonical, digest
from colorize_drawio import colorize_tree
from themes import load_theme, contrast
from audit_drawio import audit_page
from layout_rules import layout_issues
from doctor import viewer_info, chrome_path
from render_drawio import plain_labels, portable_svg


def page(root):return {'id':'p','name':'test','model':root.find('diagram/mxGraphModel')}
def mutate(root,key,**values):
    item=cells(page(root)['model'])[key];named,props=style(item['cell'].get('style',''));props.update(values)
    item['cell'].set('style',';'.join(named+[f'{k}={v}' for k,v in props.items()])+';')
def audit(root,palette=None):return audit_page(page(root),None,None,'test',palette)


class Themes(unittest.TestCase):
    def test_profiles_preserve_entire_non_color_model(self):
        source=build()
        for profile in ('tool-convention','monochrome','bizagi-inspired'):
            with self.subTest(profile=profile):
                result=colorize_tree(source,profile)
                self.assertEqual(canonical(page(source)['model']),canonical(page(result)['model']))
                self.assertFalse(audit(result,profile)['palette_errors'])
    def test_theme_source_is_unchanged(self):
        source=build();before=ET.tostring(source);colorize_tree(source,'monochrome');self.assertEqual(before,ET.tostring(source))
    def test_success_end_is_red(self):
        data=cells(page(colorize_tree(build(),'bizagi-inspired'))['model']);self.assertEqual(data['E_OK']['style']['fillColor'],'#fecaca')
    def test_monochrome_all_fills_white(self):
        data=cells(page(colorize_tree(build(),'monochrome'))['model'])
        self.assertTrue(all(d['style'].get('fillColor') in ('none','#ffffff',None) for d in data.values()))
    def test_keyword_does_not_control_task_color(self):
        root=build();cells(page(root)['model'])['CHECK']['obj'].set('label','Hủy / từ chối / hoàn thành')
        self.assertEqual(cells(page(colorize_tree(root))['model'])['CHECK']['style']['fillColor'],'#dbeafe')
    def test_reject_non_color_configuration(self):
        data=deepcopy(load_theme());data['endArrow']='none'
        with self.assertRaises(ValueError):load_theme(data)
    def test_reject_bad_hex(self):
        data=deepcopy(load_theme());data['text']='white'
        with self.assertRaises(ValueError):load_theme(data)
    def test_reject_bad_contrast(self):
        data=deepcopy(load_theme());data['text']='#ffffff'
        with self.assertRaises(ValueError):load_theme(data)
    def test_custom_theme_roundtrip(self):
        data=deepcopy(load_theme());data['id']='custom'
        with tempfile.TemporaryDirectory() as temp:
            p=Path(temp)/'custom.json';p.write_text(json.dumps(data));self.assertEqual(load_theme(str(p))['id'],'custom')
    def test_uppercase_hex_audits_its_own_output(self):
        data=deepcopy(load_theme());data['fills']={k:v.upper() for k,v in data['fills'].items()}
        self.assertEqual(audit(colorize_tree(build(),data),data)['palette_errors'],[])
    def test_wrong_container_body_rejected_by_theme(self):
        root=colorize_tree(build(),'bizagi-inspired');mutate(root,'ORG',swimlaneFillColor='#ff0000')
        self.assertTrue(audit(root,'bizagi-inspired')['palette_errors'])
    def test_wrong_label_background_rejected_by_theme(self):
        root=colorize_tree(build(),'bizagi-inspired');mutate(root,'F1',labelBackgroundColor='#ff0000')
        self.assertTrue(audit(root,'bizagi-inspired')['palette_errors'])
    def test_monochrome_whitens_data_object(self):
        root=build();model=page(root)['model'];obj=ET.SubElement(model.find('root'),'object',id='DATA',bpmnType='dataObject')
        ET.SubElement(obj,'mxCell',vertex='1',parent='FRONT',style='shape=mxgraph.bpmn.data2;fillColor=#ff0000;')
        result=colorize_tree(root,'monochrome');self.assertEqual(cells(page(result)['model'])['DATA']['style']['fillColor'],'#ffffff')
    def test_contrast_known_bounds(self):
        self.assertEqual(contrast('#ffffff','#ffffff'),1);self.assertAlmostEqual(contrast('#000000','#ffffff'),21)
    def test_color_canonical_detects_geometry(self):
        root=build();changed=colorize_tree(root);cells(page(changed)['model'])['CHECK']['cell'].find('mxGeometry').set('x','99')
        self.assertNotEqual(canonical(page(root)['model']),canonical(page(changed)['model']))
    def test_color_canonical_detects_arrow(self):
        root=build();changed=colorize_tree(root);mutate(changed,'F1',endFill='0')
        self.assertNotEqual(canonical(page(root)['model']),canonical(page(changed)['model']))


class Notation(unittest.TestCase):
    def assert_reject(self,root,fragment):self.assertTrue(any(fragment in e for e in audit(root)['errors']),audit(root))
    def test_demo_valid(self):self.assertEqual(audit(build())['errors'],[])
    def test_sequence_dash_rejected(self):
        root=build();mutate(root,'F1',dashed='1');self.assert_reject(root,'solid stroke')
    def test_end_ring_rejected(self):
        root=build();mutate(root,'E_OK',outline='standard');self.assert_reject(root,'thick end')
    def test_start_incoming_rejected(self):
        root=build();cells(page(root)['model'])['F2']['cell'].set('target','S');self.assert_reject(root,'start')
    def test_cross_pool_sequence_rejected(self):
        root=build();cells(page(root)['model'])['F1']['cell'].set('source','CUSTOMER');self.assert_reject(root,'crosses participant')
    def test_same_pool_message_rejected(self):
        root=build();cells(page(root)['model'])['M']['cell'].set('source','CHECK');self.assert_reject(root,'separate explicit participants')
    def test_default_with_condition_rejected(self):
        root=build();cells(page(root)['model'])['F3']['obj'].set('isDefault','true');mutate(root,'F3',startArrow='dash');self.assert_reject(root,'must not carry a condition')
    def test_missing_parent_rejected(self):
        root=build();cells(page(root)['model'])['CHECK']['cell'].set('parent','MISSING');self.assert_reject(root,'parent container')
    def test_xor_marker_mismatch_rejected(self):
        root=build();mutate(root,'G',gwType='parallel');self.assert_reject(root,'XOR metadata')
    def test_unknown_type_is_reported(self):
        root=build();cells(page(root)['model'])['CHECK']['obj'].set('bpmnType','choreographyTask');self.assertTrue(audit(root)['unsupported_elements'])
    def test_timer_end_is_invalid(self):
        root=build();mutate(root,'E_OK',symbol='timer');self.assert_reject(root,'End Event result')
    def test_event_gateway_wrong_glyph_is_unsupported(self):
        root=build();cells(page(root)['model'])['G']['obj'].set('bpmnType','eventBasedGateway')
        self.assertTrue(any(v['id']=='G' for v in audit(root)['unsupported_elements']))
    def test_native_shape_without_metadata(self):
        root=build();cells(page(root)['model'])['CHECK']['obj'].attrib.pop('bpmnType');self.assertEqual(audit(root)['errors'],[])
    def test_unmarked_xor_is_allowed(self):
        root=build();mutate(root,'G',gwType='event');self.assertEqual(audit(root)['errors'],[])
    def test_cross_lane_sequence_is_valid(self):
        root=build();self.assertEqual(audit(root)['errors'],[])
    def association(self,pattern):
        d=Diagram('a','Association');d.pool('P','Pool',0,100,1000,500)
        d.task('T','Work',150,200,'P');d.vertex('D','Data',(500,200,40,60),'dataObject','P','shape=mxgraph.bpmn.data2;')
        d.edge('A','T','D',kind='dataAssociation');root=document([d]);mutate(root,'A',dashPattern=pattern);return root
    def test_association_dotted_allowed(self):self.assertEqual(audit(self.association('1 4'))['errors'],[])
    def test_association_long_dash_rejected(self):self.assert_reject(self.association('8 5'),'not dotted')
    def test_association_filled_arrow_rejected(self):
        root=self.association('1 4');mutate(root,'A',endArrow='block');self.assert_reject(root,'open arrowheads')


class Portability(unittest.TestCase):
    def test_compressed_input(self):
        root=build();model=page(root)['model'];payload=quote(ET.tostring(model,encoding='unicode'),safe='').encode();compress=zlib.compressobj(wbits=-15)
        text=base64.b64encode(compress.compress(payload)+compress.flush()).decode()
        diagram=root.find('diagram');diagram.remove(model);diagram.text=text
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/'compressed.drawio';ET.ElementTree(root).write(p);self.assertEqual(canonical(pages(p)[0]['model']),canonical(model))
    def test_duplicate_ids_rejected(self):
        root=build();model=page(root)['model'];model.find('root').append(deepcopy(model.find('root')[0]))
        with self.assertRaises(ValueError):cells(model)
    def test_browser_explicit_path_missing(self):
        with self.assertRaises(ValueError):chrome_path('/nonexistent/bpmn-test-chrome')
    def test_viewer_archive_hash_required(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);viewer=root/'src/main/webapp/js/viewer-static.min.js';viewer.parent.mkdir(parents=True);viewer.write_text('test viewer')
            manifest=root/'source.json';manifest.write_text(json.dumps({'commit':'abc','viewer_sha256':digest(viewer)}))
            self.assertEqual(viewer_info(root,manifest)['provenance'],'manifest')
            manifest.write_text(json.dumps({'commit':'abc','viewer_sha256':'bad'}))
            with self.assertRaises(ValueError):viewer_info(root,manifest)
    def test_plain_labels_preserve_vietnamese_and_special_text(self):
        root=build();data=cells(page(root)['model'])['CHECK'];data['obj'].set('label','<b>Kiểm tra</b><br>A &amp; B &lt; C');mutate(root,'CHECK',html='1')
        self.assertIn('CHECK',plain_labels(page(root)['model']));self.assertEqual(cells(page(root)['model'])['CHECK']['label'],'Kiểm tra\nA & B < C')
    def test_portable_svg_uses_native_text_alternative(self):
        svg='<svg xmlns="http://www.w3.org/2000/svg"><switch><foreignObject/><text>Tiếng Việt</text></switch></svg>'
        result=portable_svg(svg);self.assertNotIn('foreignObject',result);self.assertIn('Tiếng Việt',result)
        self.assertTrue(result.startswith('<svg '),'Inline SVG must have an unprefixed root for HTML/PDF parsing')
    def test_portable_svg_refuses_to_drop_label(self):
        with self.assertRaises(ValueError):portable_svg('<svg xmlns="http://www.w3.org/2000/svg"><switch><foreignObject/></switch></svg>')
    def test_portable_svg_removes_only_viewer_compatibility_warning(self):
        svg='<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><text>Text is not SVG - business label</text><switch><g/><a xlink:href="https://www.drawio.com/doc/faq/svg-export-text-problems"><text>Text is not SVG - cannot display</text></a></switch></svg>'
        result=portable_svg(svg);self.assertNotIn('cannot display',result);self.assertIn('business label',result)
    def test_all_bundled_patterns_audit(self):
        normal=pages(SKILL/'assets/bpmn-patterns.drawio');color=pages(SKILL/'assets/bpmn-patterns-color.drawio')
        self.assertEqual(len(normal),10)
        for n,c in zip(normal,color):
            self.assertEqual(audit_page(n,None,None,'test')['errors'],[])
            self.assertEqual(audit_page(c,None,None,'test','tool-convention')['palette_errors'],[])
            self.assertEqual(canonical(n['model']),canonical(c['model']))


class Layout(unittest.TestCase):
    def records(self):return cells(page(build())['model'])
    def test_outside_lane_detected(self):
        data={'vertices':[{'id':'FRONT','x':0,'y':0,'width':400,'height':200},{'id':'CHECK','x':500,'y':0,'width':100,'height':80}]}
        self.assertTrue(any('escapes' in v for v in layout_issues(self.records(),data)))
    def test_label_collision_detected(self):
        data={'vertices':[],'labels':[{'id':key,'text':'x','x':1,'y':1,'width':100,'height':20} for key in ('CHECK','REJECT')]}
        self.assertTrue(any('label overlaps label' in v for v in layout_issues(self.records(),data)))
    def test_label_shape_collision_detected(self):
        data={'vertices':[{'id':'CHECK','x':1,'y':1,'width':100,'height':80}], 'labels':[{'id':'E_NO','text':'x','x':1,'y':1,'width':100,'height':20}]}
        self.assertTrue(any('unrelated shape' in v for v in layout_issues(self.records(),data)))
    def test_own_label_inside_activity_is_allowed(self):
        data={'vertices':[{'id':'CHECK','x':1,'y':1,'width':100,'height':80}], 'labels':[{'id':'CHECK','text':'x','x':1,'y':1,'width':90,'height':20}]}
        self.assertEqual(layout_issues(self.records(),data),[])


if __name__=='__main__':unittest.main()
