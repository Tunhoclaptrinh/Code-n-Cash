"""Event matrix, connection, recognition and layout rules on synthetic library-loan fragments."""
from pathlib import Path
import ast
import sys
import unittest
import xml.etree.ElementTree as ET

SKILL=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(SKILL/'scripts'))
from bpmn_builder import Diagram, document
from drawio_common import cells, style, canonical, tool_fingerprint
from colorize_drawio import colorize_tree
from audit_drawio import audit_page
from layout_rules import layout_issues
from notation_rules import EVENT_MATRIX


def page(root):return {'id':'p','name':'test','model':root.find('diagram/mxGraphModel')}
def mutate(root,key,**values):
    item=cells(page(root)['model'])[key];named,props=style(item['cell'].get('style',''));props.update(values)
    item['cell'].set('style',';'.join(named+[f'{k}={v}' for k,v in props.items()])+';')
def audit(root):return audit_page(page(root),None,None,'test')
def flow():
    d=Diagram('p','Mượn sách',1600,700);d.pool('LIB','Thư viện',40,100,1500,300);d.pool('EXT','Đối tác',40,480,1500,90,black=True)
    d.event('S','Nhận phiếu',120,230,'LIB');d.task('T1','Kiểm tra thẻ',220,208,'LIB',marker='user');d.event('E','Đã xử lý',1400,230,'LIB',outline='end')
    return d
def chain(d,*keys):
    for n,(a,b) in enumerate(zip(keys,keys[1:])):d.edge(f'F{n}',a,b)
def between(outline,symbol,message=None):
    d=flow();d.event('I','Sự kiện',500,230,'LIB',outline=outline,symbol=symbol);chain(d,'S','T1','I','E')
    if message=='in':d.edge('M','EXT','I',kind='messageFlow')
    if message=='out':d.edge('M','I','EXT',kind='messageFlow')
    return document([d])


class EventMatrix(unittest.TestCase):
    def errors(self,root):return audit(root)['errors']
    def test_matrix_matches_omg_tables(self):
        self.assertEqual(EVENT_MATRIX['throw'],{'general','message','escalation','compensation','link','signal','multiple'})
        self.assertNotIn('error',EVENT_MATRIX['boundary-nonint']);self.assertNotIn('link',EVENT_MATRIX['boundary'])
    def test_intermediate_triggers(self):
        for outline,symbol,ok in [('throwing','signal',True),('throwing','general',True),('throwing','compensation',True),('catching','conditional',True),
                                  ('throwing','timer',False),('throwing','conditional',False),('catching','escalation',False),('throwing','terminate',False)]:
            with self.subTest(outline=outline,symbol=symbol):self.assertEqual(not self.errors(between(outline,symbol)),ok,self.errors(between(outline,symbol)))
    def test_start_triggers(self):
        for symbol,ok in [('signal',True),('conditional',True),('parallelMultiple',True),('link',False),('terminate',False),('error',False)]:
            d=flow();chain(d,'S','T1','E');root=document([d]);mutate(root,'S',symbol=symbol)
            with self.subTest(symbol=symbol):self.assertEqual(not self.errors(root),ok)
    def test_boundary_triggers(self):
        for symbol,interrupt,ok in [('escalation',False,True),('parallelMultiple',False,True),('general',True,False),('link',True,False),('error',False,False)]:
            d=flow();chain(d,'S','T1','E');d.boundary('B','','T1',symbol=symbol,interrupt=interrupt)
            d.event('BE','',700,330,'LIB',outline='end');d.edge('BF','B','BE')
            with self.subTest(symbol=symbol,interrupt=interrupt):self.assertEqual(not self.errors(document([d])),ok)
    def test_unknown_symbol_is_unsupported_not_validated(self):
        d=flow();chain(d,'S','T1','E');root=document([d]);mutate(root,'E',symbol='terminate2')
        self.assertTrue(any(v['id']=='E' for v in audit(root)['unsupported_elements']))


class Connections(unittest.TestCase):
    def assert_reject(self,root,fragment):self.assertTrue(any(fragment in e for e in audit(root)['errors']),audit(root)['errors'])
    def test_message_catch_and_throw_directions(self):
        self.assertEqual(audit(between('catching','message','in'))['errors'],[])
        self.assertEqual(audit(between('throwing','message','out'))['errors'],[])
        self.assert_reject(between('catching','message','out'),'catching event cannot be a message flow source')
        self.assert_reject(between('throwing','message','in'),'throwing event cannot receive')
        self.assert_reject(between('catching','timer','in'),'needs a Message/Multiple catch marker')
    def test_multiple_start_may_receive_message(self):
        d=flow();chain(d,'S','T1','E');d.edge('M','EXT','S',kind='messageFlow');root=document([d]);mutate(root,'S',symbol='multiple')
        self.assertEqual(audit(root)['errors'],[])
    def test_boundary_needs_outgoing_sequence(self):
        d=flow();chain(d,'S','T1','E');d.boundary('B','2 ngày','T1');self.assert_reject(document([d]),'boundary event needs an outgoing')
    def test_intermediate_needs_incoming_sequence(self):
        d=flow();chain(d,'S','T1','E');d.event('I','',500,330,'LIB',outline='catching',symbol='message');d.edge('X','I','E')
        self.assert_reject(document([d]),'needs an incoming sequence')
    def test_gateway_must_split_or_merge(self):
        d=flow();d.gateway('G','',500,222,'LIB');chain(d,'S','T1','G','E');self.assert_reject(document([d]),'gateway must split or merge')
    def link(self,catch_name='Sang A',catch_level='LIB',extra=None):
        d=flow();d.event('L1','Sang A',500,230,'LIB',outline='throwing',symbol='link');chain(d,'S','T1','L1')
        if catch_level!='LIB':d.subprocess('SUB','Bước',(600,120,300,250),'LIB');d.event('SS','',620,220,'SUB');d.event('SE','',850,220,'SUB',outline='end')
        d.event('L2',catch_name,700,330,catch_level,outline='catching',symbol='link');d.edge('FL','L2','SE' if catch_level!='LIB' else 'E')
        if catch_level!='LIB':d.edge('FS','SS','SE')
        if extra:extra(d)
        return document([d])
    def test_link_pair_accepted_and_reachable(self):
        result=audit(self.link());self.assertEqual(result['errors'],[]);self.assertFalse(any('L2: not reachable' in v for v in result['manual_review']))
    def test_link_name_and_level_must_match(self):
        self.assert_reject(self.link('Sang B'),'no matching Link catch')
        self.assert_reject(self.link(catch_level='SUB'),'another process level')
    def test_link_catch_has_no_incoming(self):
        self.assert_reject(self.link(extra=lambda d:d.edge('BAD','T1','L2')),'Link catch must not have incoming')
    def test_single_link_target_per_name(self):
        def more(d):d.event('L3','sang  a',900,330,'LIB',outline='catching',symbol='link');d.event('E3','',1000,330,'LIB',outline='end');d.edge('F3x','L3','E3')
        self.assert_reject(self.link(extra=more),'multiple Link targets')


class Recognition(unittest.TestCase):
    def test_call_activity_is_not_a_plain_task(self):
        d=flow();d.task('C','Thu phí',500,208,'LIB',marker='abstract',extra='bpmnShapeType=call;');chain(d,'S','T1','C','E');root=document([d])
        cells(page(root)['model'])['C']['obj'].attrib.pop('bpmnType')
        self.assertEqual(cells(page(root)['model'])['C']['kind'],'callActivity');result=audit(root)
        self.assertEqual(result['errors'],[]);self.assertTrue(any('Call Activity' in v for v in result['manual_review']))
    def test_task_metadata_on_call_border_rejected(self):
        d=flow();d.task('C','Thu phí',500,208,'LIB',marker='abstract',extra='bpmnShapeType=call;');chain(d,'S','T1','C','E')
        self.assertTrue(any('contradicts the drawn callActivity' in e for e in audit(document([d]))['errors']))
    def test_native_bpmn_swimlane_lane_is_container(self):
        d=flow();chain(d,'S','T1','E');root=document([d]);lane=ET.SubElement(page(root)['model'].find('root'),'mxCell',id='LANE',vertex='1',parent='LIB',
            style='shape=mxgraph.bpmn.swimlane;html=1;startSize=20;horizontal=0;')
        ET.SubElement(lane,'mxGeometry',width='100',height='100',**{'as':'geometry'})
        self.assertEqual(cells(page(root)['model'])['LANE']['kind'],'swimlane');self.assertEqual(audit(root)['unsupported_elements'],[])
    def test_hidden_stroke_and_text_are_not_color_changes(self):
        d=flow();chain(d,'S','T1','E');normal=colorize_tree(document([d]),'monochrome');color=colorize_tree(normal,'bizagi-inspired')
        self.assertEqual(canonical(page(normal)['model']),canonical(page(color)['model']))
        mutate(color,'F0',strokeColor='none');self.assertNotEqual(canonical(page(normal)['model']),canonical(page(color)['model']))
        self.assertTrue(any('stroke is hidden' in e for e in audit(color)['errors']))
    def test_marker_contrast_required(self):
        root=between('catching','message','in');mutate(root,'I',fillColor='#334155',strokeColor='#334155')
        self.assertTrue(any('catch/throw marker' in e for e in audit(root)['errors']))
    def test_report_tool_fingerprint_covers_runtime(self):
        tool=tool_fingerprint();self.assertEqual(tool['version'],(SKILL/'VERSION').read_text().strip());self.assertGreaterEqual(tool['files'],10)
    def test_scripts_parse_as_python_310(self):
        for path in sorted([*SKILL.glob('scripts/*.py'),*SKILL.glob('tests/*.py')]):
            with self.subTest(path=path.name):ast.parse(path.read_text(encoding='utf-8'),filename=str(path),feature_version=(3,10))


class Layout(unittest.TestCase):
    def records(self):
        d=flow();chain(d,'S','T1','E');d.task('T2','Ghi sổ',600,208,'LIB');d.event('E2','',900,230,'LIB',outline='end');d.edge('X','T2','E2')
        return cells(page(document([d]))['model'])
    def box(self,key,x,y,w,h,text='x'):return {'id':key,'text':text,'x':x,'y':y,'width':w,'height':h}
    def test_activity_label_overflow(self):
        data={'vertices':[self.box('T1',220,208,185,82)],'labels':[self.box('T1',225,190,170,120,'Kiểm tra')]}
        self.assertTrue(any('overflows its own shape' in v for v in layout_issues(self.records(),data)))
    def test_label_crossed_by_unrelated_connector(self):
        data={'vertices':[],'labels':[self.box('E',1380,390,80,20)],'edges':[{'id':'F0','points':[{'x':1300,'y':400},{'x':1500,'y':400}]}]}
        self.assertTrue(any('crossed by connector F0' in v for v in layout_issues(self.records(),data)))
    def test_own_connector_does_not_count(self):
        data={'vertices':[],'labels':[self.box('E',1380,390,80,20)],'edges':[{'id':'F1','points':[{'x':1300,'y':400},{'x':1500,'y':400}]}]}
        self.assertFalse(any('crossed' in v for v in layout_issues(self.records(),data)))
    def test_connector_label_inside_endpoint_subprocess_is_allowed(self):
        d=flow();d.subprocess('SUB','Chuẩn bị',(400,120,500,250),'LIB');d.event('SS','',420,220,'SUB');d.task('ST','Gửi thông báo',520,200,'SUB',marker='send')
        d.event('SE','',800,220,'SUB',outline='end');d.edge('S1','SS','ST');d.edge('S2','ST','SE');d.edge('M','ST','EXT','Thông báo',kind='messageFlow')
        records=cells(page(document([d]))['model'])
        data={'vertices':[self.box('SUB',400,120,500,250)],'labels':[self.box('M',560,140,90,16,'Thông báo')],'edges':[]}
        self.assertFalse(any('overlaps unrelated shape' in v for v in layout_issues(records,data)))
    def test_label_straddles_container_border(self):
        data={'vertices':[self.box('LIB',40,100,1500,300)],'labels':[self.box('F0',60,140,120,20,'Có')],'edges':[]}
        self.assertTrue(any('straddles the border of LIB' in v for v in layout_issues(self.records(),data)))
    def test_collinear_connectors_look_joined(self):
        data={'vertices':[],'labels':[],'edges':[{'id':'X','points':[{'x':100,'y':400},{'x':500,'y':400}]},{'id':'F0','points':[{'x':300,'y':401},{'x':700,'y':401}]}]}
        self.assertTrue(any('runs on top of' in v for v in layout_issues(self.records(),data)))
        data['edges'][0]['id']='F1'  # Shared endpoint T1: a drawn merge/split, not a false junction.
        self.assertFalse(any('runs on top of' in v for v in layout_issues(self.records(),data)))



class Packaging(unittest.TestCase):
    def test_smoke_refuses_unsafe_entries(self):
        import tempfile,zipfile
        from smoke_package import extract
        with tempfile.TemporaryDirectory() as tmp:
            for name in ('../evil.py','/abs.py','other/x.py'):
                archive=Path(tmp)/'bad.zip'
                with zipfile.ZipFile(archive,'w') as z:z.writestr(name,'x')
                with self.subTest(name=name),self.assertRaises(ValueError):extract(archive,Path(tmp)/'out')


if __name__=='__main__':unittest.main()
