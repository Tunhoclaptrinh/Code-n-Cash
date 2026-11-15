"""Run standalone unit tests and optional real draw.io rendering integration tests."""
from pathlib import Path
from copy import deepcopy
import argparse
import json
import subprocess
import sys
import unittest
import xml.etree.ElementTree as ET
from drawio_common import pages, cells, digest, tool_fingerprint
from audit_drawio import audit_page

SKILL=Path(__file__).resolve().parent.parent


def execute(*args):
    subprocess.run([sys.executable,'-B',*map(str,args)],check=True)


def integration(args):
    output=args.output_dir.resolve()
    output.mkdir(parents=True,exist_ok=True)
    execute(SKILL/'scripts/create_demo.py','--output-dir',output/'demo')
    jobs=[(output/'demo/Demo.drawio','demo-normal','monochrome',None),
          (output/'demo/Demo_Co_mau.drawio','demo-color','bizagi-inspired',output/'demo/Demo.drawio'),
          (SKILL/'assets/bpmn-patterns.drawio','patterns-normal',None,None),
          (SKILL/'assets/bpmn-patterns-color.drawio','patterns-color','tool-convention',SKILL/'assets/bpmn-patterns.drawio')]
    results=[]
    for source,name,palette,baseline in jobs:
        folder=output/name
        cmd=[SKILL/'scripts/render_drawio.py',source,'--drawio-root',args.drawio_root,'--output-dir',folder,'--text-mode','plain']
        if name.startswith('demo'):cmd.append('--pdf')
        if args.chrome:cmd+=['--chrome',args.chrome]
        if args.source_manifest:cmd+=['--source-manifest',args.source_manifest]
        execute(*cmd)
        command=[SKILL/'scripts/audit_drawio.py',source,'--render-dir',folder,'--report',folder/'audit.json','--require-supported']
        if palette:command+=['--palette',palette]
        if baseline:command+=['--compare',baseline]
        if name.startswith('demo'):command+=['--strict-layout']
        execute(*command)
        data=json.loads((folder/'audit.json').read_text())
        if not data['rendered_checks_completed']:raise AssertionError('Missing rendered checks')
        results.append({'case':name,'passed':True,'sourceSha256':digest(source),'pages':data['page_count'],
                        'layout_findings':len(data['layout_issues']),'manual_review_notes':sum(len(p['manual_review']) for p in data['pages'])})
    # Negative controls on independently injected evidence; no claim of real business simulation.
    source=output/'demo/Demo.drawio';folder=output/'demo-normal';render=next(folder.glob('*.render.json'))
    model=pages(source)[0];original=json.loads(render.read_text());original['stem_file']=render.name
    def reject(name,data,fragment):
        result=audit_page(model,data,folder,digest(source),'monochrome')
        if not any(fragment in v for v in result['errors']):raise AssertionError(name)
        results.append({'case':name,'passed':True,'expected_rejection':fragment})
    bad=deepcopy(original);bad['sourceSha256']='stale';reject('stale-source-evidence',bad,'stale')
    bad=deepcopy(original);bad['svgSha256']='wrong';reject('tampered-svg-evidence',bad,'artifact digest')
    # Real render: a dotted data association and a deliberately long-dashed one.
    from bpmn_builder import Diagram,document
    diagrams=[]
    for key,pattern in [('dotted','1 4'),('invalid-long-dash','8 5')]:
        d=Diagram(key,key,1000,600);d.pool('P','Pool',50,120,900,420)
        d.task('T','Ghi nhận dữ liệu',180,240,'P',marker='abstract')
        d.vertex('D','Thông tin',(600,245,45,65),'dataObject','P','shape=mxgraph.bpmn.data2;html=0;verticalLabelPosition=bottom;verticalAlign=top;labelWidth=150;spacingTop=8;')
        d.edge('A','T','D',kind='dataAssociation')
        edge=d.objects['A'].find('mxCell');edge.set('style',edge.get('style')+'dashPattern='+pattern+';')
        diagrams.append(d)
    fixture=output/'association-controls.drawio';ET.ElementTree(document(diagrams)).write(fixture,encoding='utf-8',xml_declaration=True)
    cmd=[SKILL/'scripts/render_drawio.py',fixture,'--drawio-root',args.drawio_root,'--output-dir',output/'association-controls']
    if args.chrome:cmd+=['--chrome',args.chrome]
    if args.source_manifest:cmd+=['--source-manifest',args.source_manifest]
    execute(*cmd)
    reports=sorted((output/'association-controls').glob('*.render.json'))
    for index,(p,r) in enumerate(zip(pages(fixture),reports)):
        data=json.loads(r.read_text());data['stem_file']=r.name;result=audit_page(p,data,r.parent,digest(fixture))
        if index==0 and result['errors']:raise AssertionError(result['errors'])
        if index==1 and not any('rendered association is not dotted' in e for e in result['errors']):raise AssertionError(result)
        results.append({'case':p['name'],'passed':True,'expected_rejection':index==1,'errors':result['errors']})
    results+=layout_controls(args,output,Diagram,document)
    results+=pdf_checks(output)
    return results


def layout_controls(args,output,Diagram,document):
    """Real renders: one tidy fragment and three deliberate readability defects."""
    def narrow(d,key):
        cell=d.objects[key].find('mxCell');cell.set('style',cell.get('style')+'labelWidth=100;')
    def base(key):
        d=Diagram(key,key,1000,520);d.pool('P','Thư viện',40,100,900,360)
        d.lane('L1','QUẦY',(88,100,852,180),'P');d.lane('L2','KHO',(88,280,852,180),'P')
        d.event('S','Nhận phiếu',170,171,'L1');narrow(d,'S');return d
    pages_=[]
    d=base('layout-ok');d.task('T','Kiểm tra thẻ',260,148,'L1',w=180,h=84);d.event('E','Đã kiểm tra',520,171,'L1',outline='end')
    d.edge('F1','S','T');d.edge('F2','T','E');pages_.append((d,None))
    d=base('label-overflow');d.task('T','Kiểm tra thẻ, hạn mức, tài liệu yêu cầu, lịch sử vi phạm và xác nhận chữ ký bạn đọc',260,170,'L1',w=120,h=40)
    d.event('E','Đã kiểm tra',520,171,'L1',outline='end');d.edge('F1','S','T');d.edge('F2','T','E');pages_.append((d,'T: label overflows its own shape'))
    d=base('joined-connectors');d.task('T','Ghi phiếu',260,148,'L1',w=160,h=84);d.event('E','Xong',820,171,'L1',outline='end')
    d.task('T2','Lấy sách',260,330,'L2',w=160,h=84);d.event('E2','Đã lấy',820,351,'L2',outline='end')
    d.edge('F1','S','T');d.edge('F2','T','E',exit=(1,.5),entry=(0,.5),points=((450,190),(450,250),(780,250),(780,190)))
    d.event('S2','Yêu cầu kho',170,351,'L2');narrow(d,'S2');d.edge('F3','S2','T2');d.edge('F4','T2','E2',points=((470,372),(470,250),(760,250),(760,370)))
    pages_.append((d,'connector runs on top of'))
    d=base('label-outside-lane');d.task('T','Kiểm tra thẻ',260,148,'L1',w=180,h=84);d.event('E','Đã kiểm tra xong toàn bộ hồ sơ',520,240,'L1',outline='end')
    d.edge('F1','S','T');d.edge('F2','T','E',points=((480,190),(480,259)));pages_.append((d,'E: label'))
    fixture=output/'layout-controls.drawio';ET.ElementTree(document([d for d,_ in pages_])).write(fixture,encoding='utf-8',xml_declaration=True)
    cmd=[SKILL/'scripts/render_drawio.py',fixture,'--drawio-root',args.drawio_root,'--output-dir',output/'layout-controls','--text-mode','plain']
    if args.chrome:cmd+=['--chrome',args.chrome]
    if args.source_manifest:cmd+=['--source-manifest',args.source_manifest]
    execute(*cmd)
    results=[]
    for p,r,(_,expected) in zip(pages(fixture),sorted((output/'layout-controls').glob('*.render.json')),pages_):
        data=json.loads(r.read_text());data['stem_file']=r.name;result=audit_page(p,data,r.parent,digest(fixture))
        found=result['layout_issues']
        if result['errors']:raise AssertionError((p['name'],result['errors']))
        if expected is None and found:raise AssertionError((p['name'],found))
        if expected and not any(expected in v for v in found):raise AssertionError((p['name'],found))
        results.append({'case':'layout-'+p['name'],'passed':True,'expected_layout_finding':expected,'layout_issues':found})
    return results


def pdf_checks(output):
    """Vector/text checks of the demo PDFs when poppler tools exist; otherwise an explicit skip."""
    import shutil
    tools={name:shutil.which(name) for name in ('pdfimages','pdftotext')}
    files=sorted(output.glob('demo-*/*.pdf'))
    if not all(tools.values()):
        return [{'case':'pdf-content','status':'skipped','reason':'pdfimages/pdftotext not installed; PDFs were created but not inspected'}]
    results=[]
    for pdf in files:
        images=subprocess.run([tools['pdfimages'],'-list',str(pdf)],capture_output=True,text=True,check=True).stdout.splitlines()[2:]
        text=subprocess.run([tools['pdftotext'],str(pdf),'-'],capture_output=True,text=True,check=True).stdout
        ok=not images and 'Đặt trước thiết bị' in text and 'Text is not SVG' not in text
        if not ok:raise AssertionError((pdf.name,len(images),text[:200]))
        results.append({'case':'pdf-'+pdf.parent.name,'passed':True,'raster_images':0,'vietnamese_text_extracted':True})
    return results


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--render',action='store_true')
    parser.add_argument('--drawio-root',type=Path)
    parser.add_argument('--source-manifest',type=Path)
    parser.add_argument('--chrome')
    parser.add_argument('--output-dir',type=Path)
    parser.add_argument('--report',type=Path)
    args=parser.parse_args()
    suite=unittest.defaultTestLoader.discover(str(SKILL/'tests'))
    def names(tests):
        for test in tests:
            if isinstance(test,unittest.TestSuite):yield from names(test)
            else:yield test.id()
    case_names=list(names(suite))
    result=unittest.TextTestRunner(verbosity=1).run(suite)
    report={'tool':tool_fingerprint(),'python':sys.version.split()[0],'unit_tests':result.testsRun,'unit_failures':len(result.failures),'unit_errors':len(result.errors),'skipped':len(result.skipped),'render_requested':args.render,'integration':[],'passed':result.wasSuccessful(),
            'limits':['Targeted tests, not complete OMG conformance or execution soundness','Manual review notes are not automated business validation']}
    failures={test.id() for test,_ in result.failures+result.errors}
    skipped={test.id() for test,_ in result.skipped}
    report['unit_cases']=[{'case':name,'status':'failed' if name in failures else 'skipped' if name in skipped else 'passed'} for name in case_names]
    if report['passed'] and args.render:
        if not args.drawio_root or not args.output_dir:parser.error('--render requires --drawio-root and --output-dir')
        try:report['integration']=integration(args)
        except Exception as error:report['passed']=False;report['integration_error']=str(error)
    if args.report:
        args.report.parent.mkdir(parents=True,exist_ok=True)
        args.report.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False))
    if not report['passed']:raise SystemExit(1)


if __name__=='__main__':main()
