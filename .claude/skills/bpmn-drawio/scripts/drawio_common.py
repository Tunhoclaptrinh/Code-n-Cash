"""Shared draw.io parsing; only Python's standard library is required."""
from pathlib import Path
import base64
import hashlib
import html
import re
import unicodedata
from urllib.parse import unquote
import xml.etree.ElementTree as ET
import zlib

COLOR_KEYS = {"fillColor", "swimlaneFillColor", "strokeColor", "fontColor", "labelBackgroundColor", "labelBorderColor"}
VISIBILITY_KEYS = {"strokeColor", "fontColor"}


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def pages(path):
    root = ET.parse(path).getroot()
    if root.tag == "mxGraphModel":
        return [{"name": Path(path).stem, "id": "page-1", "model": root}]
    if root.tag != "mxfile":
        raise ValueError("Expected an mxfile or mxGraphModel document")
    result = []
    for index, diagram in enumerate(root.findall("diagram"), 1):
        model = diagram.find("mxGraphModel")
        if model is None:
            payload = (diagram.text or "").strip()
            if payload.startswith("<"):
                model = ET.fromstring(payload)
            else:
                raw = zlib.decompress(base64.b64decode(payload), -15).decode("utf-8")
                model = ET.fromstring(unquote(raw))
        if model.tag != "mxGraphModel" or model.find("root") is None:
            raise ValueError(f"Page {index}: mxGraphModel/root missing")
        result.append({"name": diagram.get("name", f"Page {index}"), "id": diagram.get("id", str(index)), "model": model})
    if not result:
        raise ValueError("The drawing has no pages")
    return result


def style(value):
    named, props = [], {}
    for part in value.split(";"):
        if "=" in part:
            key, val = part.split("=", 1)
            props[key] = val
        elif part:
            named.append(part)
    return named, props


def visual_kind(data, records):
    """Infer the BPMN kind drawn by native draw.io styles, ignoring bpmnType metadata."""
    c, s = data["cell"], data["style"]
    shape = s.get("shape", "")
    if c.get("edge") == "1":
        if s.get("dashed") == "1" and s.get("startArrow") == "oval":
            return "messageFlow"
        if s.get("dashed") == "1" or s.get("endArrow") == "none":
            return "association"
        return "sequenceFlow"
    if "swimlane" in data["named"] or shape in ("swimlane", "mxgraph.bpmn.swimlane"):
        return "swimlane"
    if shape == "mxgraph.bpmn.event":
        outline = s.get("outline", "standard")
        return "endEvent" if outline == "end" else "boundaryEvent" if outline.startswith("bound") else "startEvent" if outline in ("standard", "eventInt", "eventNonint") else "intermediateEvent"
    if shape == "mxgraph.bpmn.gateway2":
        gw = s.get("gwType", "event")
        if gw in ("exclusive", "parallel", "complex"):
            return {"exclusive": "exclusiveGateway", "parallel": "parallelGateway", "complex": "complexGateway"}[gw]
        if s.get("outline") == "end" and s.get("symbol") == "general":
            return "inclusiveGateway"
        if s.get("outline") == "catching" and s.get("symbol") == "multiple":
            return "eventBasedGateway"
        if s.get("outline", "none") == "none" and s.get("symbol", "none") == "none":
            return "exclusiveGateway"  # BPMN also allows the unmarked XOR diamond.
        return "gateway"  # Event/advanced glyph combinations need targeted review.
    if shape == "mxgraph.bpmn.task2":
        if s.get("bpmnShapeType") == "call":
            return "callActivity"  # Thick border in the pinned renderer; not an ordinary task.
        # An attached timer alone does not make its parent task a subprocess.
        flow_children = any(v["parent"] == data["id"] and not v["style"].get("outline", "").startswith("bound") and v["style"].get("shape") in ("mxgraph.bpmn.task2", "mxgraph.bpmn.gateway2", "mxgraph.bpmn.event") for v in records.values())
        if s.get("isLoopSub") == "1" or s.get("bpmnShapeType") in ("subprocess", "transaction") or flow_children:
            return "subProcess"
        marker = s.get("taskMarker", "abstract")
        return marker + "Task" if marker != "abstract" else "task"
    if shape == "mxgraph.bpmn.data2":
        return "dataObject"
    if shape == "datastore":
        return "dataStore"
    return "text" if "text" in data["named"] or shape == "text" else "artifact"


def cells(model):
    result = {}
    for obj in model.find("root"):
        cell = obj if obj.tag == "mxCell" else obj.find("mxCell")
        if cell is None:
            continue
        key = obj.get("id") or cell.get("id")
        if not key or key in result:
            raise ValueError(f"Missing or duplicate cell ID: {key!r}")
        named, props = style(cell.get("style", ""))
        result[key] = {"id": key, "obj": obj, "cell": cell, "parent": cell.get("parent"), "label": obj.get("label", cell.get("value", "")), "named": named, "style": props, "kind": obj.get("bpmnType", "")}
    for data in result.values():
        data["visual_kind"] = visual_kind(data, result)
        data["kind"] = data["kind"] or data["visual_kind"]
    return result


def plain_text(label):
    """Visible label text for name matching; HTML markup and spacing are ignored."""
    text = re.sub(r"<br\s*/?>|</(?:div|p)>", " ", label or "", flags=re.I)
    return " ".join(html.unescape(re.sub(r"<[^>]+>", "", text)).split()).casefold()


def tool_fingerprint():
    """Version and digest of the runtime files that produce checks and renderings."""
    skill = Path(__file__).resolve().parent.parent
    files = sorted([*skill.glob("scripts/*.py"), *skill.glob("assets/themes/*.json"), skill / "VERSION"])
    combined = hashlib.sha256()
    for path in files:
        combined.update(path.relative_to(skill).as_posix().encode() + b"\0" + hashlib.sha256(path.read_bytes()).digest())
    version = (skill / "VERSION").read_text(encoding="utf-8").strip() if (skill / "VERSION").is_file() else "unknown"
    return {"version": version, "sha256": combined.hexdigest(), "files": len(files)}


def ancestors(key, records):
    result, seen = [], {key}
    while key in records and records[key]["parent"]:
        key = records[key]["parent"]
        if key in seen:
            raise ValueError("Cyclic cell hierarchy")
        seen.add(key)
        result.append(key)
    return result


def canonical(model):
    """Normalize only visible color values and insignificant XML whitespace, not diagram structure."""
    def node(element):
        attrs = dict(element.attrib)
        if "style" in attrs:
            named, props = style(attrs["style"])
            # Hidden strokes/text remove notation, so "none" is not a color-only change.
            attrs["style"] = (tuple(named), tuple(sorted((k,v) for k,v in props.items() if k not in COLOR_KEYS or k in VISIBILITY_KEYS and v == "none")))
        return (element.tag, tuple(sorted(attrs.items())), (element.text or "").strip(), tuple(node(child) for child in element))
    return node(model)


def slug(value):
    ascii_value = unicodedata.normalize("NFKD", value.replace("đ", "d").replace("Đ", "D")).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", ascii_value.lower()).strip("-")[:80] or "diagram"
