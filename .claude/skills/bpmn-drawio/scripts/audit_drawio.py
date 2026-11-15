"""Check common BPMN constraints, fresh rendered geometry and color-only equivalence.

This is not a complete BPMN validator, execution simulator or business-logic proof.
"""
from pathlib import Path
from collections import Counter, defaultdict
import argparse
import json
import re
import xml.etree.ElementTree as ET
from drawio_common import ancestors, canonical, cells, digest, pages, tool_fingerprint
from themes import contrast, expected_fill, load_theme
from notation_rules import BPMN_SYMBOLS, MESSAGE_CATCH, additional_rules, boundary_geometry
from layout_rules import crosses, layout_issues

CONTAINERS = {"participant", "swimlane", "lane"}
EVENTS = {"startEvent", "endEvent", "intermediateEvent", "boundaryEvent"}
ACTIVITY_FAMILY = {"task": "task", "subProcess": "subProcess", "callActivity": "callActivity"}
HEX = re.compile(r"#[0-9a-fA-F]{6}")


def is_flow(data):
    kind=data["kind"]
    return kind in EVENTS or kind in ("task","subProcess","callActivity","gateway") or kind.endswith("Task") or kind.endswith("Gateway")


def family(kind):
    return "task" if kind == "task" or kind.endswith("Task") else ACTIVITY_FAMILY.get(kind, kind)


def audit_page(page, rendered, folder, expected_hash, palette=None):
    records=cells(page["model"]); errors=[]; manual=[]; palette_errors=[]; unsupported=[]
    selected=load_theme(palette) if palette else None
    supported={'participant','swimlane','lane','startEvent','endEvent','intermediateEvent','boundaryEvent','task','subProcess','callActivity','serviceTask','userTask','manualTask','sendTask','receiveTask','businessRuleTask','scriptTask','exclusiveGateway','parallelGateway','inclusiveGateway','eventBasedGateway','complexGateway','gateway','sequenceFlow','messageFlow','association','dataAssociation','dataObject','dataStore','dataInput','dataOutput','text','artifact'}
    incoming,outgoing=defaultdict(list),defaultdict(list)
    for key,data in records.items():
        if data['kind'] not in supported or data['kind']=='gateway':
            unsupported.append({'id':key,'kind':data['kind'],'reason':'No complete rule set for this type/variant'})
        if data['kind']=='artifact' and data['cell'].get('vertex')=='1' and 'bpmn' in data['style'].get('shape',''):
            unsupported.append({'id':key,'kind':data['kind'],'reason':'Unrecognized BPMN shape'})
        if data['style'].get('shape')=='mxgraph.bpmn.event' and data['style'].get('symbol','general') not in BPMN_SYMBOLS:
            unsupported.append({'id':key,'kind':data['kind'],'reason':f"Event symbol {data['style'].get('symbol')!r} is not a BPMN marker drawn by the pinned renderer; choose the trigger/result deliberately"})
        if data['kind']=='eventBasedGateway' and not (data['style'].get('outline')=='catching' and data['style'].get('symbol')=='multiple' and data['style'].get('gwType','event')=='event'):
            unsupported.append({'id':key,'kind':data['kind'],'reason':'Unsupported event gateway glyph/variant; verify metadata against rendering'})
        if data["parent"] and data["parent"] not in records:
            errors.append(f"{key}: parent container is missing")
    def pool(key):
        candidates=[k for k in [key]+ancestors(key,records) if k in records and records[k]["kind"] in ("participant","swimlane")]
        return candidates[-1] if candidates else None
    def scope(key):
        if key in records and records[key]["kind"]=="boundaryEvent":
            attached=records[key]["obj"].get("attachedToRef") or records[key]["parent"]
            if attached in records:key=attached
        return next((k for k in ancestors(key,records) if k in records and records[k]["kind"]=="subProcess"),pool(key))
    edges=[d for d in records.values() if d["cell"].get("edge")=="1"]
    for data in edges:
        key,c,s,kind=data["id"],data["cell"],data["style"],data["kind"]
        source,target=c.get("source"),c.get("target")
        if source not in records or target not in records:
            errors.append(f"{key}: edge endpoint missing or unattached");continue
        incoming[target].append(data);outgoing[source].append(data)
        if kind=="sequenceFlow":
            if not is_flow(records[source]) or not is_flow(records[target]):errors.append(f"{key}: sequence endpoint is not a recognized flow object")
            if pool(source)!=pool(target):errors.append(f"{key}: sequence crosses participant pools")
            if scope(source)!=scope(target):errors.append(f"{key}: sequence crosses subprocess scope (advanced boundary-end exceptions require separate review)")
            if records[source]["kind"]=="endEvent" or records[target]["kind"]=="startEvent":errors.append(f"{key}: sequence exits an end or enters a start")
            if s.get("dashed","0")!="0" or s.get("endFill","1")!="1" or s.get("endArrow") not in ("blockThin","block","classic","classicThin"):errors.append(f"{key}: sequence needs solid stroke and filled arrowhead")
        elif kind=="messageFlow":
            if pool(source) is None or pool(target) is None or pool(source)==pool(target):errors.append(f"{key}: message must connect separate explicit participants")
            default_fill="0" if s.get("endArrow") in ("open","openThin") else "1"
            if s.get("dashed")!="1" or s.get("startArrow")!="oval" or s.get("startFill","1")!="0" or s.get("endFill",default_fill)!="0" or s.get("endArrow") not in ("blockThin","block","open","openThin"):errors.append(f"{key}: message needs dashed stroke, open circle and unfilled arrowhead")
            for endpoint in [source,target]:
                kind_at=records[endpoint]["kind"]
                if kind_at.endswith("Gateway") or kind_at in ("gateway","lane","artifact","text","dataObject","dataStore"):errors.append(f"{key}: message attached to {kind_at}")
            if records[source]["kind"]=="startEvent" or records[target]["kind"]=="endEvent":errors.append(f"{key}: message leaves a start or targets an end")
        else:
            manual.append(f"{key}: association/custom edge; verify the inferred relationship and endpoint semantics")
    for key,data in records.items():
        kind,s=data["kind"],data["style"]
        sin=[e for e in incoming[key] if e["kind"]=="sequenceFlow"]
        sout=[e for e in outgoing[key] if e["kind"]=="sequenceFlow"]
        min_=[e for e in incoming[key] if e["kind"]=="messageFlow"]
        mout=[e for e in outgoing[key] if e["kind"]=="messageFlow"]
        if is_flow(data) and data["cell"].get("vertex")!="1":errors.append(f"{key}: flow object is not a vertex")
        if kind in EVENTS:
            if s.get("shape")!="mxgraph.bpmn.event":manual.append(f"{key}: noncanonical event shape; review rendering against OMG")
            if kind=="startEvent":
                if s.get("outline", "standard") not in ("standard", "eventInt", "eventNonint"):errors.append(f"{key}: start metadata contradicts event outline")
                if sin or mout:errors.append(f"{key}: invalid start direction")
                if min_ and s.get("symbol") not in MESSAGE_CATCH:errors.append(f"{key}: incoming message without a Message/Multiple start marker")
                if scope(key) in records and records[scope(key)]["kind"]=="subProcess" and s.get("symbol","general")!="general":manual.append(f"{key}: triggered subprocess start; verify that its parent is an event subprocess")
            if kind=="endEvent":
                if sout or min_:errors.append(f"{key}: invalid end direction")
                if s.get("outline")!="end":errors.append(f"{key}: end needs a thick end outline")
                if mout and s.get("symbol") not in ("message","multiple"):errors.append(f"{key}: end sends messages without a Message/Multiple result")
            if kind=="boundaryEvent":
                attached=data["obj"].get("attachedToRef") or data["parent"]
                if attached not in records or not (records[attached]["kind"].endswith("Task") or records[attached]["kind"] in ("task","subProcess","callActivity")):errors.append(f"{key}: boundary event has no recognized attached activity")
                if sin:errors.append(f"{key}: boundary event has incoming sequence flow")
                declared=data["obj"].get("cancelActivity")
                if s.get("symbol")!="compensation" and (declared=="true" and s.get("outline")!="boundInt" or declared=="false" and s.get("outline")!="boundNonint"):errors.append(f"{key}: cancellation metadata contradicts boundary ring type")
        if data["obj"].get("bpmnType") and kind in ("intermediateEvent","boundaryEvent") and s.get("shape")=="mxgraph.bpmn.event" and data["visual_kind"]!=kind:
            errors.append(f"{key}: {kind} metadata contradicts its {s.get('outline','standard')} event outline")
        if data["obj"].get("bpmnType") and s.get("shape")=="mxgraph.bpmn.task2" and family(kind) in ("task","subProcess","callActivity") and family(data["visual_kind"])!=family(kind) and not (kind=="subProcess" and data["visual_kind"]=="task"):
            errors.append(f"{key}: {kind} metadata contradicts the drawn {data['visual_kind']} border/marker")
        if is_flow(data) or data["cell"].get("edge")=="1":
            if s.get("strokeColor")=="none":errors.append(f"{key}: stroke is hidden, so the BPMN shape/connector is not visible")
            if s.get("fontColor")=="none" and str(data["label"]).strip():errors.append(f"{key}: label text is hidden")
        markers=(s.get("shape")=="mxgraph.bpmn.event" and s.get("symbol","general")!="general") or kind in ("sendTask","receiveTask")
        fill,ink=s.get("fillColor","#ffffff"),s.get("strokeColor","#000000")
        if markers and HEX.fullmatch(fill) and HEX.fullmatch(ink) and contrast(fill,ink)<3:
            errors.append(f"{key}: fill/stroke contrast below 3:1 hides the catch/throw marker distinction")
        if kind.endswith("Task"):
            expected=kind.removesuffix("Task")
            if s.get("shape")=="mxgraph.bpmn.task2" and s.get("taskMarker")!=expected:errors.append(f"{key}: task metadata contradicts visual task marker")
        unmarked_xor=s.get("gwType","event")=="event" and s.get("outline","none")=="none" and s.get("symbol","none")=="none"
        if kind=="exclusiveGateway" and s.get("gwType")!="exclusive" and not unmarked_xor:errors.append(f"{key}: XOR metadata contradicts gateway marker")
        if kind in ("inclusiveGateway","complexGateway","eventBasedGateway","gateway"):
            manual.append(f"{key}: review gateway conditions/triggers and active-branch synchronization against OMG")
        if kind=="parallelGateway" or len(sout)>1 and not (kind.endswith("Gateway") or kind=="gateway"):
            manual.append(f"{key}: trace concurrent tokens and joins for each scenario")
        event_sub=kind=="subProcess" and (data["obj"].get("triggeredByEvent")=="true" or s.get("bpmnShapeType")=="subprocess")
        if is_flow(data) and kind not in ("startEvent","endEvent","boundaryEvent","intermediateEvent") and not event_sub and data["obj"].get("isForCompensation")!="true" and (not sin or not sout):
            manual.append(f"{key}: implicit start/end or incomplete branch; check the intended business outcome")
        if "bpmn" in s.get("shape","") and not is_flow(data):manual.append(f"{key}: advanced/legacy BPMN shape needs targeted review")
        if selected and expected_fill(data,selected) is not None and s.get("fillColor", "").lower()!=expected_fill(data,selected).lower():
            palette_errors.append(f"{key}: local palette requires {expected_fill(data,selected)} for {kind}; found {s.get('fillColor')}")
        if selected and selected['apply_ink'] and data['cell'].get('vertex',data['cell'].get('edge'))=='1':
            for prop,value in [('fontColor',selected['text']),('strokeColor',selected['stroke'])]:
                if s.get(prop)!='none' and s.get(prop,'').lower()!=value.lower():palette_errors.append(f'{key}: theme requires {prop}={value}')
        if selected and kind in CONTAINERS and s.get('swimlaneFillColor','#ffffff').lower()!=selected['fills']['body'].lower():
            palette_errors.append(f'{key}: theme requires container body {selected["fills"]["body"]}')
        if selected and 'labelBackgroundColor' in s and s['labelBackgroundColor'].lower()!=selected['label_background'].lower():
            palette_errors.append(f'{key}: theme requires label background {selected["label_background"]}')
    extra_errors,extra_manual=additional_rules(records,incoming,outgoing,scope)
    errors.extend(extra_errors);manual.extend(extra_manual)
    if rendered is not None:
        if rendered.get("sourceSha256")!=expected_hash:errors.append("Rendered evidence is stale for this input digest")
        if rendered.get("tool",{}).get("sha256")!=tool_fingerprint()["sha256"]:manual.append("Render evidence was produced by a different skill tool version; re-render before claiming current visual checks")
        if rendered.get("missingShapes"):errors.append(f"Renderer has unknown shapes: {rendered['missingShapes']}")
        if rendered.get("cells")!=len(records):errors.append("Source/renderer cell counts differ")
        boxes={b["id"]:b for b in rendered["vertices"]}
        errors.extend(boundary_geometry(records,boxes))
        for edge in rendered["edges"]:
            if edge["id"] not in records:errors.append(f"Unknown rendered edge {edge['id']}");continue
            c=records[edge["id"]]["cell"]; source,target=c.get("source"),c.get("target")
            if source not in records or target not in records:continue
            excluded={source,target,*ancestors(source,records),*ancestors(target,records)}
            # Lanes partition responsibility, not sequence-flow scope. A route
            # may traverse an intermediate lane of either endpoint participant.
            endpoint_pools={pool(source),pool(target)}-{None}
            excluded.update(k for k,d in records.items()
                            if d["kind"]=="lane" and pool(k) in endpoint_pools)
            points=[p for p in edge["points"] if p]
            for key,box in boxes.items():
                if key not in excluded and key in records and (is_flow(records[key]) or records[key]["kind"] in CONTAINERS) and any(crosses(a,b,box) for a,b in zip(points,points[1:])):
                    errors.append(f"{edge['id']}: route crosses unrelated element {key}")
        flow_boxes=[k for k in boxes if k in records and is_flow(records[k])]
        for n,left in enumerate(flow_boxes):
            for right in flow_boxes[n+1:]:
                if left in ancestors(right,records) or right in ancestors(left,records):continue
                a,b=boxes[left],boxes[right]
                if min(a["x"]+a["width"],b["x"]+b["width"])-max(a["x"],b["x"])>2 and min(a["y"]+a["height"],b["y"]+b["height"])-max(a["y"],b["y"])>2:errors.append(f"Overlapping flow objects {left}/{right}")
        svg_file=folder/rendered["stem_file"].replace(".render.json",".svg")
        if rendered.get('svgSha256') and digest(svg_file)!=rendered['svgSha256']:errors.append('SVG artifact digest differs from render evidence')
        svg=ET.parse(svg_file).getroot()
        groups={g.get("data-cell-id"):g for g in svg.iter() if g.get("data-cell-id")}
        for key,data in records.items():
            if not is_flow(data) and data["cell"].get("edge")!="1":continue
            if key not in groups:errors.append(f"{key}: visual SVG group missing");continue
            shape_nodes=list(groups[key][0]); ellipses=[x for x in shape_nodes if x.tag.endswith("}ellipse")]
            kind,s=data["kind"],data["style"]
            base=float(s.get("strokeWidth","1"))
            if selected and expected_fill(data,selected) is not None and not any(x.get("fill", "").lower()==expected_fill(data,selected).lower() for x in shape_nodes):
                palette_errors.append(f"{key}: rendered fill does not match local palette")
            if s.get("shape")=="mxgraph.bpmn.event":
                if kind=="startEvent" and s.get("outline")=="standard" and (not ellipses or float(ellipses[0].get("stroke-width","1"))!=base):errors.append(f"{key}: rendered start ring is not thin")
                if kind=="endEvent" and (not ellipses or float(ellipses[0].get("stroke-width","1"))<base*2):errors.append(f"{key}: rendered end ring is not thick")
                if kind=="boundaryEvent":
                    if len(ellipses)<2:errors.append(f"{key}: rendered boundary rings missing")
                    else:
                        expected_dash=s.get("outline")=="boundNonint"
                        if any((e.get("stroke-dasharray","none") not in ("none","","0"))!=expected_dash for e in ellipses[:2]):errors.append(f"{key}: rendered boundary dash contradicts interrupting status")
                if kind=="startEvent" and s.get("symbol")=="message":
                    rects=[x for x in shape_nodes if x.tag.endswith("}rect")]
                    if not rects or rects[0].get("fill") not in ("none",s.get("fillColor","#ffffff")):
                        errors.append(f"{key}: rendered catching Message start envelope is not unfilled relative to its background")
            if kind in ("sendTask", "receiveTask") and s.get("shape")=="mxgraph.bpmn.task2":
                envelopes=[x for x in shape_nodes if x.tag.endswith("}rect") and x.get("width")=="18" and x.get("height")=="13"]
                if not envelopes or (kind=="sendTask" and envelopes[0].get("fill")!=s.get("strokeColor","#000000")) or (kind=="receiveTask" and envelopes[0].get("fill")!="none"):
                    errors.append(f"{key}: rendered send/receive envelope fill is incorrect")
            if kind in ("sequenceFlow","messageFlow"):
                paths=[x for x in shape_nodes if x.tag.endswith("}path")]
                if not paths:errors.append(f"{key}: rendered connector path missing");continue
                dashed=paths[0].get("stroke-dasharray","none") not in ("none","","0")
                if dashed!=(kind=="messageFlow"):errors.append(f"{key}: rendered dash does not match flow kind")
                if kind=="messageFlow" and (not ellipses or ellipses[0].get("fill")!="none"):errors.append(f"{key}: rendered sender circle is not open")
                if kind=="sequenceFlow" and not any(p.get("fill") not in (None,"none","#ffffff") and p.get("d","").endswith("Z") for p in paths):errors.append(f"{key}: rendered sequence arrowhead is not filled")
                if kind=="messageFlow" and s.get("endArrow") in ("blockThin","block") and not any(p.get("fill")=="none" and p.get("d","").endswith("Z") for p in paths):errors.append(f"{key}: rendered message arrowhead is not unfilled")
            if kind in ('association','dataAssociation'):
                paths=[x for x in shape_nodes if x.tag.endswith('}path') and x.get('stroke-dasharray')]
                if not paths:errors.append(f'{key}: rendered dotted association missing')
                else:
                    pattern=[float(v) for v in re.split(r'[, ]+',paths[0].get('stroke-dasharray').strip())]
                    if len(pattern)%2 or any(pattern[n]>=pattern[n+1] for n in range(0,len(pattern),2)):
                        errors.append(f'{key}: rendered association is not dotted')
    return {"name":page["name"],"element_counts":dict(Counter(d["kind"] for d in records.values())),"rendered":rendered is not None,"errors":errors,"palette_errors":palette_errors,"manual_review":list(dict.fromkeys(manual)),"unsupported_elements":unsupported,"layout_issues":layout_issues(records,rendered) if rendered else [],"label_checks_completed":bool(rendered is not None and 'labels' in rendered)}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("drawing",type=Path)
    parser.add_argument("--render-dir",type=Path)
    parser.add_argument("--compare",type=Path)
    parser.add_argument("--palette",help="Optional built-in theme or JSON profile, not an OMG color rule")
    parser.add_argument('--strict-layout',action='store_true',help='Fail on targeted rendered label/containment findings')
    parser.add_argument('--require-supported',action='store_true',help='Fail when unrecognized types/variants are present')
    parser.add_argument("--report",required=True,type=Path)
    args=parser.parse_args(); source=args.drawing.resolve(); loaded=pages(source)
    rendered={}
    if args.render_dir:
        for path in args.render_dir.glob("*.render.json"):
            data=json.loads(path.read_text());data["stem_file"]=path.name
            if data["pageIndex"] in rendered:raise ValueError("Multiple render reports for the same page; choose a clean per-variant render directory")
            rendered[data["pageIndex"]]=data
    report={"source":str(source),"sourceSha256":digest(source),"tool":tool_fingerprint(),"page_count":len(loaded),"pages":[],"errors":[],"palette":args.palette,"palette_errors":[],"limits":["Business scenarios and requirement coverage require a human/model review","Not an exhaustive BPMN validator or execution-soundness proof","Label collisions and visual readability require inspecting every image","Palette checks enforce a selected local presentation convention, not BPMN standard colors"]}
    for index,page in enumerate(loaded,1):
        result=audit_page(page,rendered.get(index),args.render_dir,report["sourceSha256"],args.palette)
        if args.render_dir and index not in rendered:result["errors"].append("Rendered page evidence missing")
        report["pages"].append(result)
        report["errors"].extend(f"Page {index}: {e}" for e in result["errors"])
        report["palette_errors"].extend(f"Page {index}: {e}" for e in result["palette_errors"])
    if args.compare:
        baseline=pages(args.compare)
        same=len(baseline)==len(loaded) and all(a["id"]==b["id"] and a["name"]==b["name"] and canonical(a["model"])==canonical(b["model"]) for a,b in zip(baseline,loaded))
        report["only_color_differs"]=same
        if not same:report["errors"].append("Compared diagrams differ in content, markers, hierarchy, geometry or connections")
    report['unsupported_elements']=[dict(page=n,**v) for n,p in enumerate(report['pages'],1) for v in p['unsupported_elements']]
    report['layout_issues']=[f'Page {n}: {v}' for n,p in enumerate(report['pages'],1) for v in p['layout_issues']]
    if args.strict_layout and not args.render_dir:report['errors'].append('Strict layout requires rendered evidence')
    if args.strict_layout and any(not p['label_checks_completed'] for p in report['pages']):report['errors'].append('Strict layout requires fresh renderer label metrics')
    if args.strict_layout:report['errors'].extend(report['layout_issues'])
    if args.require_supported and report['unsupported_elements']:report['errors'].append('Unsupported BPMN elements/variants require targeted review')
    report["passed_structural_checks"]=not report["errors"]
    report["passed_palette_checks"]=not report["palette_errors"] if args.palette else None
    report["passed_all_requested_checks"]=not report["errors"] and not report["palette_errors"]
    report["rendered_checks_completed"]=len(rendered)==len(loaded)
    args.report.parent.mkdir(parents=True,exist_ok=True)
    args.report.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
    print(json.dumps({k:report[k] for k in ("page_count", "passed_structural_checks", "passed_palette_checks", "rendered_checks_completed", "errors", "palette_errors")},ensure_ascii=False))
    if not report["passed_all_requested_checks"]:raise SystemExit(1)


if __name__=="__main__":main()
