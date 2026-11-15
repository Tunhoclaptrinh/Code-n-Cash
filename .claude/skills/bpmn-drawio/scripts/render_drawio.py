"""Render any page count with the viewer from a local official draw.io checkout."""
from pathlib import Path
from html.parser import HTMLParser
import argparse
import json
import math
import shutil
import subprocess
import tempfile
import xml.etree.ElementTree as ET
from drawio_common import digest, pages, slug, tool_fingerprint
from doctor import chrome_path, viewer_info

HTML = '''<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;background:white}#graph{width:12000px;height:12000px}#artifact-data{display:none}
</style></head><body><div id="graph"></div><div id="artifact-data">
<textarea id="error"></textarea><textarea id="svg"></textarea><textarea id="roundtrip"></textarea><textarea id="stats"></textarea></div>
<script>window.onerror=(m,s,l)=>{document.getElementById('error').textContent+=m+' @'+l;};</script>
<script src="__VIEWER__"></script><script>
try{
 const doc=mxUtils.parseXml(__MODEL__);
 const graph=new Graph(document.getElementById('graph'));
 graph.setEnabled(false);graph.foldingEnabled=false;graph.setGridEnabled(false);
 new mxCodec(doc).decode(doc.documentElement,graph.getModel());graph.view.validate();
 const stats={sourceSha256:__DIGEST__,cells:Object.keys(graph.getModel().cells).length,bounds:graph.getGraphBounds(),missingShapes:[],vertices:[],edges:[],labels:[]};
 graph.view.states.visit((id,state)=>{
  if(state.cell.vertex){
   const shape=state.style.shape||'rectangle';
   if(!mxCellRenderer.defaultShapes[shape]&&!mxStencilRegistry.getStencil(shape))stats.missingShapes.push({id:state.cell.id,shape:shape});
   stats.vertices.push({id:state.cell.id,x:state.x,y:state.y,width:state.width,height:state.height});
  }
  if(state.cell.edge)stats.edges.push({id:state.cell.id,points:state.absolutePoints});
  if(state.text&&state.text.boundingBox){const b=state.text.boundingBox;stats.labels.push({id:state.cell.id,text:graph.convertValueToString(state.cell),x:b.x,y:b.y,width:b.width,height:b.height});}
 });
 if(stats.bounds.width<=0||stats.bounds.height<=0)throw new Error('Empty diagram after decoding');
 document.getElementById('svg').textContent=new XMLSerializer().serializeToString(graph.getSvg('#ffffff',1,20));
 document.getElementById('roundtrip').textContent=new XMLSerializer().serializeToString(new mxCodec().encode(graph.getModel()));
 document.getElementById('stats').textContent=JSON.stringify(stats);
}catch(e){document.getElementById('error').textContent+=e.stack;}
</script></body></html>'''


class Fields(HTMLParser):
    def __init__(self):
        super().__init__(); self.key=None; self.values={}

    def handle_starttag(self, tag, attrs):
        if tag == "textarea":
            self.key=dict(attrs).get("id"); self.values[self.key]=""

    def handle_endtag(self, tag):
        if tag == "textarea": self.key=None

    def handle_data(self, value):
        if self.key: self.values[self.key]+=value


class PlainLabel(HTMLParser):
    def __init__(self): super().__init__(); self.parts=[]
    def handle_starttag(self, tag, attrs):
        if tag in ('br', 'div', 'p', 'tr') and self.parts and not self.parts[-1].endswith('\n'): self.parts.append('\n')
    def handle_data(self, data): self.parts.append(data)


def plain_labels(model):
    """Flatten only HTML-styled labels in a rendering copy; source stays unchanged."""
    from drawio_common import cells, style
    changed=[]
    for data in cells(model).values():
        if data['style'].get('html') != '1': continue
        parser=PlainLabel(); parser.feed(data['label'])
        owner=data['obj'] if 'label' in data['obj'].attrib else data['cell']
        owner.set('label' if owner is data['obj'] and owner is not data['cell'] else 'value', ''.join(parser.parts).strip())
        named, props=style(data['cell'].get('style',''));props['html']='0'
        data['cell'].set('style',';'.join(named+[f'{k}={v}' for k,v in props.items()])+';')
        changed.append(data['id'])
    return changed


def portable_svg(raw):
    """Use draw.io's own SVG text alternatives; never discard a label without one."""
    root=ET.fromstring(raw)
    ns='{http://www.w3.org/2000/svg}'
    for parent in root.iter():
        for node in list(parent):
            if node.tag==ns+'switch':
                # Viewer compatibility warning is obsolete after replacing every
                # HTML label; identify its documented link, not business wording.
                warning=any(c.tag==ns+'a' and c.get('{http://www.w3.org/1999/xlink}href')=='https://www.drawio.com/doc/faq/svg-export-text-problems' for c in node)
                if warning:
                    parent.remove(node)
                    continue
                alternatives=[c for c in node if c.tag==ns+'text' and ''.join(c.itertext()).strip()]
                foreign=[c for c in node if c.tag==ns+'foreignObject']
                if foreign and not alternatives:raise ValueError('draw.io supplied no SVG text alternative for a label')
                if foreign:
                    for child in foreign:node.remove(child)
                    node.tag=ns+'g'
    if any(n.tag==ns+'foreignObject' for n in root.iter()):raise ValueError('Unconverted HTML label remains')
    ET.register_namespace('',ns[1:-1])
    return ET.tostring(root,encoding='unicode')


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("drawing", type=Path)
    parser.add_argument("--drawio-root", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument('--chrome', help='Explicit browser executable')
    parser.add_argument('--source-manifest', type=Path, help='Pinned commit/viewer_sha256; required for source archives')
    parser.add_argument('--text-mode', choices=('preserve','plain'), default='preserve', help='Plain converts HTML labels in the rendering copy for portable SVG')
    parser.add_argument('--pdf', action='store_true', help='Also export one vector PDF per page through Chrome')
    args=parser.parse_args()
    source=args.drawing.resolve(); output=args.output_dir.resolve(); checkout=args.drawio_root.resolve()
    info=viewer_info(checkout, args.source_manifest)
    viewer=Path(info['viewer']);chrome=chrome_path(args.chrome);commit=info['drawioCommit']
    source_hash=digest(source)
    output.mkdir(parents=True,exist_ok=True)
    runtime=output/".bpmn-runtime"; runtime.mkdir(exist_ok=True)
    tool=tool_fingerprint()
    manifest={"source":str(source),"sourceSha256":source_hash,"tool":tool,"drawioCommit":commit,"viewerSha256":digest(viewer),"textMode":args.text_mode,"pages":[]}
    for index,page in enumerate(pages(source),1):
        stem=f"{index:02d}-{slug(page['name'])}"
        converted=plain_labels(page['model']) if args.text_mode=='plain' else []
        model=ET.tostring(page["model"],encoding="unicode")
        # Insert model text last so literal placeholder-like business labels stay literal.
        html=HTML.replace("__DIGEST__",json.dumps(source_hash)).replace("__VIEWER__",viewer.as_uri()).replace("__MODEL__",json.dumps(model).replace("</","<\\/"))
        html_file=runtime/f"{stem}.html"; html_file.write_text(html,encoding="utf-8")
        with tempfile.TemporaryDirectory(prefix="chrome-",dir=runtime) as profile:
            common=[chrome,"--headless","--no-sandbox","--disable-gpu","--disable-dev-shm-usage","--allow-file-access-from-files",f"--user-data-dir={profile}","--no-first-run","--no-default-browser-check","--disable-background-networking","--hide-scrollbars","--force-color-profile=srgb"]
            rendered=subprocess.run(common+["--dump-dom","--virtual-time-budget=1500",html_file.as_uri()],capture_output=True,text=True,check=True,timeout=60)
            fields=Fields(); fields.feed(rendered.stdout)
            if fields.values.get("error") or not fields.values.get("svg"):
                raise RuntimeError(fields.values.get("error") or "Renderer did not export SVG")
            if args.text_mode=='plain':fields.values['svg']=portable_svg(fields.values['svg'])
            svg_file=output/f"{stem}.svg"; svg_file.write_text(fields.values["svg"],encoding="utf-8")
            stats=json.loads(fields.values["stats"])
            stats.update(pageIndex=index,pageId=page["id"],pageName=page["name"],tool=tool,drawioCommit=commit,viewerSha256=info['viewerSha256'],textMode=args.text_mode,flattenedLabels=converted,svgSha256=digest(svg_file))
            (output/f"{stem}.render.json").write_text(json.dumps(stats,ensure_ascii=False,indent=2),encoding="utf-8")
            (output/f"{stem}.roundtrip.xml").write_text(fields.values["roundtrip"],encoding="utf-8")
            svg=ET.fromstring(fields.values["svg"])
            width,height=(math.ceil(float(svg.get(k).removesuffix("px"))) for k in ["width","height"])
            png_file=output/f"{stem}.png"
            subprocess.run(common+[f"--screenshot={png_file}",f"--window-size={width},{height}","--virtual-time-budget=1000",svg_file.as_uri()],capture_output=True,text=True,check=True,timeout=60)
            if not png_file.is_file() or not png_file.stat().st_size: raise RuntimeError("PNG export missing")
            if args.pdf:
                if any(n.tag.endswith('}foreignObject') or n.tag=='foreignObject' for n in svg.iter()):
                    raise ValueError('PDF export requires portable SVG; rerun with --text-mode plain')
                pdf_html=runtime/f'{stem}-pdf.html'
                pdf_html.write_text(f'<html><meta charset="utf-8"><style>@page{{size:{width}px {height}px;margin:0}}body{{margin:0}}svg{{display:block}}</style>'+fields.values['svg']+'</html>',encoding='utf-8')
                pdf_file=output/f'{stem}.pdf'
                subprocess.run(common+['--no-pdf-header-footer',f'--print-to-pdf={pdf_file}',pdf_html.as_uri()],capture_output=True,text=True,check=True,timeout=60)
                if not pdf_file.is_file() or not pdf_file.stat().st_size: raise RuntimeError('PDF export missing')
        manifest["pages"].append({"index":index,"id":page["id"],"name":page["name"],"stem":stem,"svg":svg_file.name,"png":png_file.name})
        print(f"Rendered {index}: {page['name']} -> {stem}.svg/.png",flush=True)
    (output/"render-manifest.json").write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding="utf-8")
    print(f"Rendered {len(manifest['pages'])} page(s), draw.io commit {commit}")


if __name__ == "__main__": main()
