"""Targeted BPMN 2.0.2 constraints beyond the basic drawing checks.

No expression evaluation, inclusive-join proof or full execution engine is implied.
"""
from collections import defaultdict
from drawio_common import plain_text

# Permitted draw.io `symbol` values per event position: OMG BPMN 2.0.2 Tables
# 10.84-10.90 and 10.93, §10.5.2-10.5.4 (printed pp.239-259). `general` is None.
EVENT_MATRIX = {
    'start': {'general', 'message', 'timer', 'conditional', 'signal', 'multiple', 'parallelMultiple'},
    'start-sub': {'general'},
    'start-event-sub': {'message', 'timer', 'escalation', 'error', 'compensation', 'conditional', 'signal', 'multiple', 'parallelMultiple'},
    'start-event-sub-nonint': {'message', 'timer', 'escalation', 'conditional', 'signal', 'multiple', 'parallelMultiple'},
    'catch': {'message', 'timer', 'conditional', 'link', 'signal', 'multiple', 'parallelMultiple'},
    'throw': {'general', 'message', 'escalation', 'compensation', 'link', 'signal', 'multiple'},
    'boundary': {'message', 'timer', 'escalation', 'conditional', 'error', 'cancel', 'compensation', 'signal', 'multiple', 'parallelMultiple'},
    'boundary-nonint': {'message', 'timer', 'escalation', 'conditional', 'signal', 'multiple', 'parallelMultiple'},
    'end': {'general', 'message', 'escalation', 'error', 'cancel', 'compensation', 'signal', 'terminate', 'multiple'},
}
POSITION = {'start': 'a top-level Start', 'start-sub': 'an embedded subprocess Start', 'start-event-sub': 'an interrupting event-subprocess Start',
            'start-event-sub-nonint': 'a non-interrupting event-subprocess Start', 'catch': 'an intermediate catch in normal flow',
            'throw': 'an intermediate throw in normal flow', 'boundary': 'an interrupting boundary', 'boundary-nonint': 'a non-interrupting boundary', 'end': 'an End'}
# BPMN markers the pinned mxgraph.bpmn.event renderer draws; draw.io also offers
# 'star' and draws nothing for unknown names such as the palette's 'terminate2'.
BPMN_SYMBOLS = set().union(*EVENT_MATRIX.values())
MESSAGE_CATCH = {'message', 'multiple', 'parallelMultiple'}
MESSAGE_THROW = {'message', 'multiple'}


def is_activity(d):
    return d["kind"] in ("task", "subProcess", "callActivity") or d["kind"].endswith("Task")


def is_event_sub(d):
    return d["kind"] == "subProcess" and (d["obj"].get("triggeredByEvent") == "true" or d["style"].get("bpmnShapeType") == "subprocess")


def event_position(key, records, scope):
    d = records[key]; kind, outline = d["kind"], d["style"].get("outline", "standard")
    if kind == "startEvent":
        parent = records.get(scope(key))
        if parent and is_event_sub(parent): return "start-event-sub-nonint" if outline == "eventNonint" else "start-event-sub"
        return "start-sub" if parent and parent["kind"] == "subProcess" else "start"
    if kind == "intermediateEvent":
        return {"throwing": "throw", "catching": "catch"}.get(outline)
    if kind == "boundaryEvent": return "boundary-nonint" if outline == "boundNonint" else "boundary"
    return "end" if kind == "endEvent" else None


def event_rules(records, incoming, outgoing, scope):
    """Trigger/result by position, catch/throw message direction, sequence presence and Link pairing."""
    errors, manual = [], []
    links = defaultdict(lambda: {"throw": [], "catch": []})
    for key, d in records.items():
        pos = event_position(key, records, scope)
        if d["style"].get("shape") != "mxgraph.bpmn.event" or pos is None:
            if d["kind"] == "intermediateEvent": manual.append(f"{key}: intermediate outline is neither catching nor throwing; review the event direction")
            continue
        symbol = d["style"].get("symbol", "general"); s = d["style"]
        ins = [e for e in incoming[key] if e["kind"] == "sequenceFlow"]; outs = [e for e in outgoing[key] if e["kind"] == "sequenceFlow"]
        min_ = [e for e in incoming[key] if e["kind"] == "messageFlow"]; mout = [e for e in outgoing[key] if e["kind"] == "messageFlow"]
        if symbol in BPMN_SYMBOLS and symbol not in EVENT_MATRIX[pos]:
            if pos == "end": errors.append(f"{key}: trigger is not a permitted End Event result")
            elif pos == "start-sub": errors.append(f"{key}: ordinary embedded subprocess requires a None Start")
            elif pos == "start" and symbol in ("error", "escalation", "compensation", "cancel"): errors.append(f"{key}: start trigger/interrupting variant requires an appropriate event subprocess")
            elif pos.startswith("start-event-sub"):
                if symbol != "general": errors.append(f"{key}: invalid event-subprocess start trigger/interrupting variant")
            elif pos == "catch" and symbol in ("error", "cancel", "compensation"): errors.append(f"{key}: Error/Cancel/Compensation catch must be on an activity boundary")
            elif pos == "boundary-nonint" and symbol in ("error", "cancel", "compensation"): errors.append(f"{key}: Error/Cancel/Compensation boundary must have solid rings")
            else: errors.append(f"{key}: {symbol} is not a permitted trigger/result for {POSITION[pos]} (OMG Tables 10.84-10.90)")
        if pos == "catch" and symbol == "general":
            manual.append(f"{key}: a None intermediate event is a throw event (Table 10.89); prefer outline=throwing")
        if pos in ("catch", "boundary", "boundary-nonint") and mout:
            errors.append(f"{key}: a catching event cannot be a message flow source")
        if pos == "throw" and mout and symbol not in MESSAGE_THROW:
            errors.append(f"{key}: message flow source needs a Message/Multiple throw marker")
        if pos == "throw" and min_:
            errors.append(f"{key}: a throwing event cannot receive a message flow")
        if pos in ("catch", "boundary", "boundary-nonint") and min_ and symbol not in MESSAGE_CATCH:
            errors.append(f"{key}: message flow target needs a Message/Multiple catch marker")
        if pos in ("catch", "throw") and min_ and mout:
            errors.append(f"{key}: an intermediate event cannot both receive and send message flows")
        if pos == "catch" and len(min_) > 1:
            manual.append(f"{key}: several message flows target one intermediate catch; confirm the message/correlation")
        if pos.startswith("boundary") and symbol != "compensation" and not outs:
            errors.append(f"{key}: boundary event needs an outgoing sequence flow (OMG 10.5.4)")
        if pos in ("catch", "throw"):
            link = symbol == "link"
            if link: links[(scope(key), plain_text(d["label"]))][pos].append(key)
            if link and pos == "catch":
                if ins: errors.append(f"{key}: Link catch must not have incoming sequence flow")
            elif not ins: errors.append(f"{key}: intermediate event in normal flow needs an incoming sequence flow (OMG 10.5.4)")
            if link and pos == "throw" and outs: errors.append(f"{key}: Link throw must not have outgoing sequence flow")
            elif not outs and not (link and pos == "throw"): errors.append(f"{key}: intermediate event in normal flow needs an outgoing sequence flow (OMG 10.5.4)")
    names = defaultdict(set)
    for (level, name), group in links.items(): names[name].add(level)
    for (level, name), group in links.items():
        if not name:
            manual.extend(f"{key}: unnamed Link event; label paired source/target Links with the same name" for key in group["throw"] + group["catch"])
            continue
        if len(group["catch"]) > 1: errors.append(f"{group['catch'][0]}: multiple Link targets share the name '{name}' in one process level")
        for key in group["throw"]:
            if not group["catch"]:
                where = " (a matching target is in another process level)" if len(names[name]) > 1 else ""
                errors.append(f"{key}: Link throw has no matching Link catch with the same name in this process level{where}")
        if group["catch"] and not group["throw"]: manual.append(f"{group['catch'][0]}: Link catch has no source Link with the same name")
    return errors, manual, links


def additional_rules(records, incoming, outgoing, scope):
    errors, manual = [], []
    def seq(edges): return [e for e in edges if e["kind"]=="sequenceFlow"]
    activity, event_sub = is_activity, is_event_sub
    extra_errors, extra_manual, links = event_rules(records, incoming, outgoing, scope)
    errors.extend(extra_errors); manual.extend(extra_manual)
    for key,d in records.items():
        kind,s,obj=d["kind"],d["style"],d["obj"]
        ins,outs=seq(incoming[key]),seq(outgoing[key])
        if kind=="messageFlow": continue
        if kind in ("association","dataAssociation"):
            if s.get("dashed")!="1" or s.get("startArrow","none") not in ("none","open","openThin") or s.get("endArrow","none") not in ("none","open","openThin"):
                errors.append(f"{key}: association needs dotted stroke and optional open arrowheads")
            pattern=s.get('dashPattern')
            if pattern:
                try:
                    parts=[float(v) for v in pattern.split()]
                    if len(parts)%2 or not parts or any(v<=0 for v in parts) or any(parts[n]>=parts[n+1] for n in range(0,len(parts),2)):
                        errors.append(f'{key}: association dash pattern is not dotted')
                except ValueError: errors.append(f'{key}: invalid association dash pattern')
            else:
                manual.append(f'{key}: no explicit dotted pattern; inspect rendered association')
            if kind=='dataAssociation' and s.get('endArrow') not in ('open','openThin'):
                errors.append(f'{key}: data association needs an open target arrowhead')
            if kind=="dataAssociation":
                endpoints=[records.get(d["cell"].get(v),{}) for v in ("source","target")]
                if not any(e.get("kind") in ("dataObject","dataStore","dataInput","dataOutput") for e in endpoints):manual.append(f"{key}: verify data inputs/outputs and data-association endpoints")
        if kind=="sequenceFlow":
            source=d["cell"].get("source")
            if source not in records: continue
            src=records[source]; conditional=obj.get("conditionExpression") is not None
            default=obj.get("isDefault")=="true"; start=s.get("startArrow","none")
            if default:
                if start!="dash":errors.append(f"{key}: default sequence needs a slash marker")
                if conditional:errors.append(f"{key}: default flow must not carry a condition")
                if src["kind"] not in ("exclusiveGateway","inclusiveGateway","complexGateway") and not activity(src):errors.append(f"{key}: default flow has an invalid source")
            elif start=="dash":manual.append(f"{key}: slash marker implies default; confirm the default relationship")
            if conditional and not default:
                if src["kind"] in ("parallelGateway","eventBasedGateway"):errors.append(f"{key}: conditions are not allowed from AND/event-based gateways")
                elif activity(src) and (start!="diamondThin" or s.get("startFill","1")!="0"):errors.append(f"{key}: conditional flow from an activity needs an unfilled diamond")
                elif src["kind"].endswith("Gateway") and start in ("diamond","diamondThin"):errors.append(f"{key}: a gateway condition must not use an activity diamond marker")
                if activity(src) and len(seq(outgoing[source]))<2:errors.append(f"{key}: conditional activity flow requires another outgoing sequence")
        if (kind.endswith("Gateway") or kind=="gateway") and len(ins)<2 and len(outs)<2:
            errors.append(f"{key}: gateway must split or merge: multiple incoming or outgoing sequence flows (OMG 10.6)")
        if kind=="parallelGateway" and s.get("gwType")!="parallel":errors.append(f"{key}: AND metadata contradicts its marker")
        if kind=="inclusiveGateway" and not (s.get("gwType","event")=="event" and s.get("outline")=="end" and s.get("symbol")=="general"):errors.append(f"{key}: inclusive metadata contradicts its circle marker")
        if len([e for e in outs if e["obj"].get("isDefault")=="true" or e["style"].get("startArrow")=="dash"])>1:errors.append(f"{key}: multiple default outgoing sequences")
        if kind=="eventBasedGateway":
            if not (s.get("outline")=="catching" and s.get("symbol")=="multiple"):
                manual.append(f"{key}: review instantiating/parallel event-gateway variant against OMG")
            if len(outs)<2:errors.append(f"{key}: event-based gateway needs at least two event alternatives")
            receive=False; message=False
            for edge in outs:
                target=records.get(edge["cell"].get("target"))
                if not target: continue
                t=target["id"]; tk=target["kind"]; ts=target["style"]
                if tk=="receiveTask":
                    receive=True
                    if any(r["kind"]=="boundaryEvent" and (r["obj"].get("attachedToRef") or r["parent"])==t for r in records.values()):errors.append(f"{t}: receive after an event gateway must not have boundary events")
                elif tk=="intermediateEvent" and ts.get("outline")=="catching" and ts.get("symbol") in ("message","signal","timer","conditional","multiple"):
                    message |= ts.get("symbol")=="message"
                else:errors.append(f"{key}: invalid event-gateway successor {t}")
                if len(seq(incoming[t]))!=1:errors.append(f"{t}: event-gateway successor has an additional incoming sequence")
                if edge["obj"].get("conditionExpression") is not None or edge["style"].get("startArrow")=="dash":errors.append(f"{edge['id']}: event race must not use conditions/default branches")
            if receive and message:errors.append(f"{key}: do not mix Receive Tasks with Message catches in one event-gateway configuration")
        if event_sub(d):
            if ins or outs:errors.append(f"{key}: event subprocess cannot have incoming/outgoing sequence flows")
            starts=[r for r in records.values() if r["kind"]=="startEvent" and scope(r["id"])==key]
            if len(starts)!=1 or starts[0]["style"].get("symbol","general")=="general":errors.append(f"{key}: event subprocess needs exactly one triggered start")
        if kind=="startEvent":
            in_event=scope(key) in records and event_sub(records[scope(key)])
            if not in_event and s.get("outline")=="eventNonint":errors.append(f"{key}: start trigger/interrupting variant requires an appropriate event subprocess")
        if kind=="boundaryEvent":
            symbol=s.get("symbol"); attached=obj.get("attachedToRef") or d["parent"]
            if symbol in ("error","cancel","compensation") and s.get("outline") not in ("boundInt","boundNonint"):errors.append(f"{key}: Error/Cancel/Compensation boundary must have solid rings")
            if symbol=="cancel" and attached in records and records[attached]["style"].get("bpmnShapeType")!="transaction":errors.append(f"{key}: Cancel boundary requires a Transaction Sub-Process")
            if symbol=="compensation":
                if outs:errors.append(f"{key}: compensation handler uses association, not sequence")
                links_out=[e for e in outgoing[key] if e["kind"]=="association"]
                if len(links_out)!=1:errors.append(f"{key}: compensation boundary needs one handler association")
                for e in links_out:
                    target=records.get(e["cell"].get("target"),{})
                    if not target or not activity(target) or target["obj"].get("isForCompensation")!="true" or target["style"].get("isLoopComp")!="1":errors.append(f"{key}: associated handler lacks compensation activity semantics/marker")
        if kind=="endEvent" and s.get("symbol")=="cancel":
            parent=scope(key)
            if parent not in records or records[parent]["style"].get("bpmnShapeType")!="transaction":errors.append(f"{key}: Cancel End requires a Transaction Sub-Process")
        if obj.get("isForCompensation")=="true" and (ins or outs):errors.append(f"{key}: compensation activity must be outside normal sequence flow")
        if kind=="subProcess" and s.get("bpmnShapeType")=="transaction":manual.append(f"{key}: review transaction protocol, rollback and compensation completion; drawing is not an executable transaction")
        if kind=="callActivity":manual.append(f"{key}: Call Activity; verify the called process/global task and its data mapping")
    # Graph reachability is an advisory check: event starts, boundary handlers and
    # compensation handlers introduce activation paths outside ordinary sequence.
    starts={k for k,r in records.items() if r["kind"] in ("startEvent","boundaryEvent") or r["obj"].get("isForCompensation")=="true"}
    seen=set(starts); todo=list(starts)
    while todo:
        key=todo.pop()
        targets=[e["cell"].get("target") for e in seq(outgoing[key])]
        # A source Link continues at its same-named target Link in that process level.
        targets+=[c for group in links.values() if key in group["throw"] for c in group["catch"]]
        for t in targets:
            if t in records and t not in seen:seen.add(t);todo.append(t)
    if any(r["kind"]=="startEvent" for r in records.values()):
        for key,d in records.items():
            if (activity(d) or d["kind"].endswith("Gateway") or d["kind"] in ("intermediateEvent","endEvent")) and key not in seen and not event_sub(d):
                manual.append(f"{key}: not reachable from declared starts/handlers; review implicit starts or missing flow")
    return errors,manual


def boundary_geometry(records,boxes):
    errors=[]
    for key,d in records.items():
        if d["kind"]!="boundaryEvent":continue
        attached=d["obj"].get("attachedToRef") or d["parent"]
        if key not in boxes or attached not in boxes:continue
        e,a=boxes[key],boxes[attached]
        cx,cy=e["x"]+e["width"]/2,e["y"]+e["height"]/2
        x,y,w,h=(a[k] for k in ("x","y","width","height"))
        rx,ry=e["width"]/2,e["height"]/2
        # An attached event need only intersect the border; exact centering is a
        # layout preference, not an OMG requirement. Rounded corners need review.
        nearest=[(x,min(max(cy,y),y+h)),(x+w,min(max(cy,y),y+h)),(min(max(cx,x),x+w),y),(min(max(cx,x),x+w),y+h)]
        if not any(((cx-qx)/rx)**2+((cy-qy)/ry)**2<=(1+2/min(rx,ry))**2 for qx,qy in nearest):
            errors.append(f"{key}: rendered boundary event does not intersect attached activity {attached}'s border")
    return errors
