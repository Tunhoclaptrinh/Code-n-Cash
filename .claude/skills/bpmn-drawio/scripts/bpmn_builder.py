"""Small native draw.io BPMN builder; coordinates are absolute on the page.

This builds editable diagrams, not executable BPMN XML. The caller supplies the
business model and deliberate routes; no example-specific policy is inferred.
"""
from pathlib import Path
import xml.etree.ElementTree as ET
from colorize_drawio import colorize_tree

BASE = "html=0;whiteSpace=wrap;fontFamily=Arial;fontSize=14;fontColor=#172b42;strokeColor=#334155;strokeWidth=1.5;fillColor=#ffffff;"
TASK = BASE + "shape=mxgraph.bpmn.task2;rectStyle=rounded;arcSize=10;container=1;collapsible=0;spacingTop=8;"
EVENT = BASE + "shape=mxgraph.bpmn.event;perimeter=ellipsePerimeter;aspect=fixed;outlineConnect=0;verticalLabelPosition=bottom;verticalAlign=top;labelWidth=145;fontSize=12;spacingTop=8;"
GATE = BASE + "shape=mxgraph.bpmn.gateway2;perimeter=rhombusPerimeter;verticalLabelPosition=top;verticalAlign=bottom;labelWidth=150;spacingBottom=10;"
POOL = BASE + "swimlane;horizontal=0;startSize=48;container=1;collapsible=0;recursiveResize=0;fontStyle=1;fillColor=#f1f5f9;swimlaneFillColor=#ffffff;"
EDGE = BASE + "edgeStyle=none;rounded=0;whiteSpace=nowrap;fontSize=12;labelBackgroundColor=#ffffff;"


class Diagram:
    def __init__(self, key, title, width=1600, height=850):
        self.key, self.name = key, title
        self.model = ET.Element("mxGraphModel", page="1", pageScale="1", pageWidth=str(width), pageHeight=str(height), grid="1", gridSize="10", background="#ffffff")
        self.root = ET.SubElement(self.model, "root")
        ET.SubElement(self.root, "mxCell", id="0")
        ET.SubElement(self.root, "mxCell", id="1", parent="0")
        self.boxes, self.parents, self.objects = {}, {}, {}
        self.note("TITLE", title, 40, 25, width-80, 50, "fontSize=25;fontStyle=1;")

    def vertex(self, key, label, box, kind, parent="1", style="", **metadata):
        if key in self.objects: raise ValueError(f"Duplicate ID {key}")
        obj = ET.SubElement(self.root, "object", id=key, label=label, bpmnType=kind, **{k:str(v) for k,v in metadata.items()})
        cell = ET.SubElement(obj, "mxCell", vertex="1", parent=parent, style=style)
        x,y,w,h = box; px,py = self.boxes.get(parent,(0,0,0,0))[:2]
        ET.SubElement(cell, "mxGeometry", x=str(x-px), y=str(y-py), width=str(w), height=str(h), **{"as":"geometry"})
        self.boxes[key], self.parents[key], self.objects[key] = box, parent, obj
        return key

    def note(self, key, label, x,y,w,h, extra="", parent="1"):
        return self.vertex(key,label,(x,y,w,h),"text",parent,"text;"+BASE+"strokeColor=none;fillColor=none;align=left;verticalAlign=middle;"+extra)

    def pool(self, key, label, x,y,w,h, black=False):
        return self.vertex(key,label,(x,y,w,h),"participant",style=POOL,blackBox=str(black).lower())

    def lane(self,key,label,box,parent):
        return self.vertex(key,label,box,"lane",parent,POOL+"startSize=36;")

    def task(self,key,label,x,y,parent,marker="service",w=185,h=82,extra="",**meta):
        kind = marker+"Task" if marker!="abstract" else "task"
        return self.vertex(key,label,(x,y,w,h),kind,parent,TASK+f"taskMarker={marker};"+extra,**meta)

    def subprocess(self,key,label,box,parent,event=False,transaction=False):
        extra = "bpmnShapeType=subprocess;" if event else "bpmnShapeType=transaction;" if transaction else ""
        return self.vertex(key,label,box,"subProcess",parent,TASK+"taskMarker=abstract;isLoopSub=0;verticalAlign=top;align=left;spacingLeft=12;"+extra,triggeredByEvent=str(event).lower())

    def event(self,key,label,x,y,parent,outline="standard",symbol="general",size=38,**meta):
        kind = "endEvent" if outline=="end" else "boundaryEvent" if outline.startswith("bound") else "intermediateEvent" if outline in ("catching","throwing") else "startEvent"
        return self.vertex(key,label,(x,y,size,size),kind,parent,EVENT+f"outline={outline};symbol={symbol};",**meta)

    def boundary(self,key,label,activity,symbol="timer",interrupt=True,**meta):
        x,y,w,h=self.boxes[activity]
        attrs={"attachedToRef":activity}
        if symbol!="compensation": attrs["cancelActivity"]=str(interrupt).lower()
        attrs.update(meta)
        result=self.event(key,label,x+w*.78-17,y+h-17,activity,"boundInt" if interrupt or symbol=="compensation" else "boundNonint",symbol,size=34,**attrs)
        cell=self.objects[key].find("mxCell")
        cell.set("style",cell.get("style")+"labelPosition=right;align=left;spacingLeft=10;")
        return result

    def gateway(self,key,label,x,y,parent,kind="exclusiveGateway"):
        styles={"exclusiveGateway":"gwType=exclusive;outline=none;symbol=none;", "parallelGateway":"gwType=parallel;outline=none;symbol=none;", "inclusiveGateway":"gwType=event;outline=end;symbol=general;", "eventBasedGateway":"gwType=event;outline=catching;symbol=multiple;"}
        return self.vertex(key,label,(x,y,54,54),kind,parent,GATE+styles[kind])

    def common_parent(self,a,b):
        def chain(key):
            result=[]
            while key in self.parents:
                key=self.parents[key]; result.append(key)
            return result
        ca,cb=chain(a),chain(b)
        return next((p for p in ca if p in cb),"1")

    def edge(self,key,source,target,label="",kind="sequenceFlow",points=(),exit=(1,.5),entry=(0,.5),offset=(0,-14),default=False,condition=None):
        parent=self.common_parent(source,target) if kind!="messageFlow" else "1"
        style=EDGE+f"exitX={exit[0]};exitY={exit[1]};entryX={entry[0]};entryY={entry[1]};"
        if kind=="sequenceFlow":
            style+="dashed=0;endArrow=blockThin;endFill=1;endSize=8;startArrow=none;"
            if default: style+="startArrow=dash;startFill=0;startSize=7;"
            elif condition is not None and not self.objects[source].get("bpmnType","").endswith("Gateway"):
                style+="startArrow=diamondThin;startFill=0;startSize=10;"
        elif kind=="messageFlow": style+="dashed=1;dashPattern=8 5;startArrow=oval;startFill=0;endArrow=blockThin;endFill=0;startSize=5;endSize=9;"
        else: style+="dashed=1;dashPattern=1 4;startArrow=none;endArrow=openThin;endFill=0;endSize=7;"
        obj=ET.SubElement(self.root,"object",id=key,label=label,bpmnType=kind)
        if condition is not None: obj.set("conditionExpression",condition)
        if default: obj.set("isDefault","true")
        cell=ET.SubElement(obj,"mxCell",edge="1",parent=parent,source=source,target=target,style=style)
        geo=ET.SubElement(cell,"mxGeometry",relative="1",**{"as":"geometry"})
        px,py=self.boxes.get(parent,(0,0,0,0))[:2]
        if points:
            arr=ET.SubElement(geo,"Array",**{"as":"points"})
            for x,y in points: ET.SubElement(arr,"mxPoint",x=str(x-px),y=str(y-py))
        ET.SubElement(geo,"mxPoint",x=str(offset[0]),y=str(offset[1]),**{"as":"offset"})
        self.objects[key]=obj
        return key


def document(diagrams):
    root=ET.Element("mxfile",host="app.diagrams.net",pages=str(len(diagrams)))
    for d in diagrams: ET.SubElement(root,"diagram",id=d.key,name=d.name).append(d.model)
    return root


def save_pair(diagrams, path, normal_theme=None, color_theme="tool-convention"):
    """Write normal and _Co_mau variants; defaults keep earlier outputs reproducible.

    New work should pass normal_theme="monochrome", color_theme="bizagi-inspired".
    """
    path=Path(path); path.parent.mkdir(parents=True,exist_ok=True)
    root=document(diagrams)
    normal=colorize_tree(root,normal_theme) if normal_theme else root
    for dest,tree in [(path,normal),(path.with_name(path.stem+"_Co_mau.drawio"),colorize_tree(normal,color_theme))]:
        ET.indent(tree,space="  ")
        ET.ElementTree(tree).write(dest,encoding="utf-8",xml_declaration=True)
