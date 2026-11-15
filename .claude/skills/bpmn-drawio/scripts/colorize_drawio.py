"""Apply a consistent presentation palette without changing BPMN semantics.

Green start / red end follows a familiar modeling-tool convention (e.g. Bizagi),
not a normative BPMN color requirement. Every end is red, including success.
Labels and business outcomes never determine the event color.
"""
from copy import deepcopy
from pathlib import Path
import argparse
import xml.etree.ElementTree as ET
from drawio_common import cells, pages, style

from themes import load_theme, expected_fill

# Compatibility export for existing callers; one JSON source of truth.
PALETTE = load_theme('tool-convention')['fills']


def colorize_tree(source, theme="tool-convention"):
    """Copy an uncompressed mxfile/model and modify only color style properties."""
    selected = load_theme(theme)
    result = deepcopy(source)
    models = [result] if result.tag == "mxGraphModel" else list(result.iter("mxGraphModel"))
    if not models:
        raise ValueError("Decode compressed pages before calling colorize_tree")
    for model in models:
        for data in cells(model).values():
            if data['cell'].get('vertex',data['cell'].get('edge')) != '1': continue
            fill = expected_fill(data, selected)
            if fill is None and not selected["apply_ink"]: continue
            cell = data["cell"]
            named, props = style(cell.get("style", ""))
            if fill is not None: props["fillColor"] = fill
            if selected["apply_ink"]:
                for key in ("strokeColor", "fontColor"):
                    if props.get(key) != "none":
                        props[key] = selected["stroke" if key == "strokeColor" else "text"]
                if "labelBackgroundColor" in props:
                    props["labelBackgroundColor"] = selected["label_background"]
            if data["kind"] in ("participant", "swimlane", "lane"):
                props["swimlaneFillColor"] = selected["fills"]["body"]
            cell.set("style", ";".join(named + [f"{k}={v}" for k, v in props.items()]) + ";")
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("drawing", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--theme", default="tool-convention", help="Built-in profile or JSON theme path")
    args = parser.parse_args()
    if args.drawing.resolve() == args.output.resolve():
        raise ValueError("Keep the normal drawing: choose a different output path")
    root = ET.parse(args.drawing).getroot()
    if root.tag == "mxfile":
        for diagram, page in zip(root.findall("diagram"), pages(args.drawing)):
            for child in list(diagram): diagram.remove(child)
            diagram.text = None
            diagram.append(page["model"])
    result = colorize_tree(root, args.theme)
    ET.indent(result, space="  ")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    ET.ElementTree(result).write(args.output, encoding="utf-8", xml_declaration=True)
    print(f"Created {args.output}; profile={load_theme(args.theme)['id']}; labels/outcomes unchanged")


if __name__ == "__main__": main()
