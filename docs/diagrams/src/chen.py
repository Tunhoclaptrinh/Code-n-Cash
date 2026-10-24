"""Chen-style ERD renderer: one layout -> SVG + draw.io XML.

Model:
  entities: {key: dict(label, sub, x, y, w=170, h=54)}   (x, y = centre)
  attrs:    [(entity, text, kind, x, y)]  kind: pk | fk | attr
  rels:     [dict(label, x, y, ends=[(entity, marker, [points...])], dashed=False)]
            points: polyline from the diamond centre to the point on the entity border.
  markers:  one | mone | many | zmany | omany | zone
"""
import math
from xml.sax.saxutils import escape

ENT_FILL, ENT_STROKE = "#D6EAF6", "#7FA7C9"
REL_FILL, REL_STROKE = "#9DB4CC", "#6F8BA8"
ATT_FILL, ATT_STROKE = "#ECEBDF", "#B9B7A3"
FK_FILL, FK_STROKE = "#FBE3C8", "#D9A066"
PK_FILL, PK_STROKE = "#E3F1DA", "#8DB572"
LINE = "#555555"
FONT = "Segoe UI, Arial, sans-serif"
REL_W, REL_H = 150, 64


def resolve(m, sx=1.0, sy=1.0, dy=0):
    """Scale/shift the layout, then end every relationship line on its entity border."""
    T = lambda x, y: (x * sx, y * sy + dy)
    for e in m["entities"].values():
        e["x"], e["y"] = T(e["x"], e["y"])
        e.setdefault("w", 190), e.setdefault("h", 56)
    m["attrs"] = [(a, t, k, *T(x, y)) for a, t, k, x, y in m["attrs"]]
    for r in m["rels"]:
        r["x"], r["y"] = T(r["x"], r["y"])
        ends = []
        for ent, mk, pts in r["ends"]:
            pts = [T(*p) for p in pts]
            e = m["entities"][ent]
            ax, ay = pts[-1] if pts else (r["x"], r["y"])
            l, rt, t, b = e["x"] - e["w"] / 2, e["x"] + e["w"] / 2, e["y"] - e["h"] / 2, e["y"] + e["h"] / 2
            if l <= ax <= rt and ay < t:
                end = (ax, t)
            elif l <= ax <= rt and ay > b:
                end = (ax, b)
            elif t <= ay <= b and ax < l:
                end = (l, ay)
            elif t <= ay <= b and ax > rt:
                end = (rt, ay)
            else:
                end = None  # already on the border
            ends.append((ent, mk, pts + [end] if end else pts))
        r["ends"] = ends
    return m


def text_w(s, size):
    return sum(size * (0.36 if c in "il.,;:|()[]" else 0.58) for c in s)


def attr_size(text, kind):
    label = text + {"fk": " (FK)", "uk": " (UK)", "pkfk": " (FK)"}.get(kind, "")
    return max(96, text_w(label, 12) + 34), 40


def lines_of(label):
    return label.split("\n")


# ---------------------------------------------------------------- SVG
def marker_svg(px, py, ux, uy, kind):
    """(px,py) on the entity border, (ux,uy) unit vector pointing away from the entity."""
    nx, ny = -uy, ux
    out = []

    def at(d):
        return px + ux * d, py + uy * d

    def bar(d, half=8):
        cx, cy = at(d)
        out.append(f'<line x1="{cx + nx * half:.1f}" y1="{cy + ny * half:.1f}" '
                   f'x2="{cx - nx * half:.1f}" y2="{cy - ny * half:.1f}"/>')

    def crow(d=14, half=8):
        tx, ty = at(d)
        for s in (-1, 0, 1):
            out.append(f'<line x1="{tx:.1f}" y1="{ty:.1f}" x2="{px + nx * half * s:.1f}" '
                       f'y2="{py + ny * half * s:.1f}"/>')

    def circle(d):
        cx, cy = at(d)
        out.append(f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="5" fill="white"/>')

    if kind == "one":
        bar(12)
    elif kind == "mone":
        bar(9), bar(15)
    elif kind == "many":
        crow()
    elif kind == "omany":
        crow(), bar(20)
    elif kind == "zmany":
        crow(), circle(25)
    elif kind == "zone":
        bar(10), circle(22)
    return "".join(out)


def svg_text(x, y, s, size=13, weight="normal", style="normal", deco="none", fill="#1f2d3d"):
    return (f'<text x="{x:.1f}" y="{y:.1f}" font-size="{size}" font-weight="{weight}" '
            f'font-style="{style}" text-decoration="{deco}" fill="{fill}" '
            f'text-anchor="middle" dominant-baseline="central">{escape(s)}</text>')


def render_svg(m, path):
    W, H = m["size"]
    ents, out = m["entities"], []
    out.append(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" '
               f'viewBox="0 0 {W} {H}" font-family="{FONT}">')
    out.append(f'<rect width="{W}" height="{H}" fill="white"/>')
    out.append(svg_text(W / 2, 34, m["title"], 24, "600"))
    if m.get("subtitle"):
        out.append(svg_text(W / 2, 62, m["subtitle"], 13, fill="#5b6b7b"))

    # attribute lines (under the shapes)
    out.append(f'<g stroke="{LINE}" stroke-width="1.2">')
    for ent, text, kind, x, y in m["attrs"]:
        e = ents[ent]
        out.append(f'<line x1="{x}" y1="{y}" x2="{e["x"]}" y2="{e["y"]}"/>')
    out.append("</g>")

    # relationship lines + markers
    for r in m["rels"]:
        dash = ' stroke-dasharray="7 5"' if r.get("dashed") else ""
        for ent, mk, pts in r["ends"]:
            poly = [(r["x"], r["y"])] + pts
            d = " ".join(f"{x},{y}" for x, y in poly)
            out.append(f'<polyline points="{d}" fill="none" stroke="{LINE}" stroke-width="1.4"{dash}/>')
            (ax, ay), (bx, by) = poly[-2], poly[-1]
            L = math.hypot(ax - bx, ay - by)
            out.append(f'<g stroke="{LINE}" stroke-width="1.4" fill="none">'
                       + marker_svg(bx, by, (ax - bx) / L, (ay - by) / L, mk) + "</g>")

    # entities
    for e in ents.values():
        w, h = e.get("w", 170), e.get("h", 54)
        out.append(f'<rect x="{e["x"] - w / 2}" y="{e["y"] - h / 2}" width="{w}" height="{h}" '
                   f'fill="{ENT_FILL}" stroke="{ENT_STROKE}" stroke-width="1.4"/>')
        if e.get("sub"):
            out.append(svg_text(e["x"], e["y"] - 8, e["label"], 15, "600"))
            out.append(svg_text(e["x"], e["y"] + 12, e["sub"], 11.5, fill="#4a6178"))
        else:
            out.append(svg_text(e["x"], e["y"], e["label"], 15, "600"))

    # relationships
    for r in m["rels"]:
        x, y, w, h = r["x"], r["y"], r.get("w", REL_W), r.get("h", REL_H)
        out.append(f'<polygon points="{x},{y - h / 2} {x + w / 2},{y} {x},{y + h / 2} {x - w / 2},{y}" '
                   f'fill="{REL_FILL}" stroke="{REL_STROKE}" stroke-width="1.3"/>')
        ls = lines_of(r["label"])
        for i, s in enumerate(ls):
            out.append(svg_text(x, y + (i - (len(ls) - 1) / 2) * 14, s, 11.5, "500"))

    # attributes
    for ent, text, kind, x, y in m["attrs"]:
        w, h = attr_size(text, kind)
        fill, stroke = {"pk": (PK_FILL, PK_STROKE), "pkfk": (PK_FILL, FK_STROKE),
                        "fk": (FK_FILL, FK_STROKE)}.get(kind, (ATT_FILL, ATT_STROKE))
        dash = ' stroke-dasharray="4 3"' if kind in ("fk", "pkfk") else ""
        out.append(f'<ellipse cx="{x}" cy="{y}" rx="{w / 2}" ry="{h / 2}" fill="{fill}" '
                   f'stroke="{stroke}" stroke-width="1.2"{dash}/>')
        if kind == "pk":
            out.append(svg_text(x, y, text, 12, "700", deco="underline"))
        elif kind == "pkfk":
            out.append(svg_text(x, y, text + " (FK)", 12, "700", "italic", "underline"))
        elif kind == "uk":
            out.append(svg_text(x, y, text + " (UK)", 12))
        elif kind == "fk":
            out.append(svg_text(x, y, text + " (FK)", 12, style="italic"))
        else:
            out.append(svg_text(x, y, text, 12))

    out.append(legend_svg(*m["legend_at"]))
    for note in m.get("notes", []):
        nx, ny, lines = note
        for i, s in enumerate(lines):
            out.append(f'<text x="{nx}" y="{ny + i * 17}" font-size="12" fill="#4a5a6a">{escape(s)}</text>')
    out.append("</svg>")
    open(path, "w", encoding="utf-8").write("\n".join(out))


def legend_svg(x, y):
    o = [f'<g transform="translate({x},{y})">',
         f'<rect width="690" height="132" rx="10" fill="white" stroke="#9aa5b1"/>',
         f'<rect x="18" y="16" width="86" height="34" fill="{ENT_FILL}" stroke="{ENT_STROKE}"/>',
         svg_text(61, 33, "Thực thể", 12),
         f'<polygon points="175,14 228,33 175,52 122,33" fill="{REL_FILL}" stroke="{REL_STROKE}"/>',
         svg_text(175, 33, "Quan hệ", 12),
         f'<ellipse cx="290" cy="33" rx="46" ry="17" fill="{ATT_FILL}" stroke="{ATT_STROKE}"/>',
         svg_text(290, 33, "Thuộc tính", 12),
         f'<ellipse cx="61" cy="92" rx="46" ry="17" fill="{PK_FILL}" stroke="{PK_STROKE}"/>',
         svg_text(61, 92, "mã_id", 12, "700", deco="underline"),
         f'<text x="114" y="96" font-size="12" fill="#1f2d3d">= Khóa chính (PK)</text>',
         f'<ellipse cx="290" cy="92" rx="52" ry="17" fill="{FK_FILL}" stroke="{FK_STROKE}" stroke-dasharray="4 3"/>',
         svg_text(290, 92, "mã_id (FK)", 12, style="italic"),
         f'<text x="350" y="96" font-size="12" fill="#1f2d3d">= Khóa ngoại</text>']
    rows = [("mone", "= Đúng một"), ("zone", "= Không hoặc một"), ("zmany", "= Không hoặc nhiều"),
            ("omany", "= Một hoặc nhiều")]
    for i, (mk, label) in enumerate(rows):
        yy = 22 + i * 24
        o.append(f'<line x1="440" y1="{yy}" x2="490" y2="{yy}" stroke="{LINE}" stroke-width="1.4"/>')
        o.append(f'<g stroke="{LINE}" stroke-width="1.4" fill="none">{marker_svg(490, yy, -1, 0, mk)}</g>')
        o.append(f'<text x="500" y="{yy + 4}" font-size="12" fill="#1f2d3d">{label}</text>')
    o.append(f'<line x1="440" y1="118" x2="490" y2="118" stroke="{LINE}" stroke-width="1.4" stroke-dasharray="7 5"/>')
    o.append('<text x="500" y="122" font-size="12" fill="#1f2d3d">= Nối logic theo mã nhóm</text>')
    o.append("</g>")
    return "".join(o)


# ---------------------------------------------------------------- draw.io
DRAWIO_MARK = {"one": "ERone", "mone": "ERmandOne", "many": "ERmany", "zmany": "ERzeroToMany",
               "omany": "ERoneToMany", "zone": "ERzeroToOne"}


def rel_exit(r, p):
    """Point on the diamond border towards p, as relative (0..1) coordinates."""
    w, h = r.get("w", REL_W), r.get("h", REL_H)
    dx, dy = p[0] - r["x"], p[1] - r["y"]
    t = 1 / (abs(dx) / (w / 2) + abs(dy) / (h / 2))
    return 0.5 + dx * t / w, 0.5 + dy * t / h


def render_drawio(m, path):
    W, H = m["size"]
    cells, n = [], [1]

    def nid():
        n[0] += 1
        return f"c{n[0]}"

    def vertex(value, style, x, y, w, h):
        i = nid()
        cells.append(f'<mxCell id="{i}" value="{escape(value, {chr(34): "&quot;"})}" style="{style}" '
                     f'vertex="1" parent="1"><mxGeometry x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" '
                     f'height="{h:.1f}" as="geometry"/></mxCell>')
        return i

    def edge(src, dst, style, pts=()):
        i = nid()
        arr = "".join(f'<mxPoint x="{x}" y="{y}"/>' for x, y in pts)
        arr = f'<Array as="points">{arr}</Array>' if pts else ""
        cells.append(f'<mxCell id="{i}" style="{style}" edge="1" parent="1" source="{src}" target="{dst}">'
                     f'<mxGeometry relative="1" as="geometry">{arr}</mxGeometry></mxCell>')

    base_font = "fontFamily=Segoe UI;"
    vertex(f'<font style="font-size:24px">{m["title"]}</font>', "text;html=1;align=center;" + base_font,
           0, 14, W, 40)
    ids = {}
    for k, e in m["entities"].items():
        w, h = e.get("w", 170), e.get("h", 54)
        val = f"<b>{e['label']}</b>" + (f"<br><font style='font-size:11px'>{e['sub']}</font>" if e.get("sub") else "")
        ids[k] = vertex(val, f"rounded=0;whiteSpace=wrap;html=1;fillColor={ENT_FILL};strokeColor={ENT_STROKE};"
                        f"fontSize=15;{base_font}", e["x"] - w / 2, e["y"] - h / 2, w, h)
        e["_w"], e["_h"] = w, h
    for ent, text, kind, x, y in m["attrs"]:
        w, h = attr_size(text, kind)
        if kind == "pk":
            val, fill, stroke, extra = f"<u><b>{text}</b></u>", PK_FILL, PK_STROKE, ""
        elif kind == "pkfk":
            val, fill, stroke, extra = f"<u><b><i>{text} (FK)</i></b></u>", PK_FILL, FK_STROKE, "dashed=1;"
        elif kind == "uk":
            val, fill, stroke, extra = f"{text} (UK)", ATT_FILL, ATT_STROKE, ""
        elif kind == "fk":
            val, fill, stroke, extra = f"<i>{text} (FK)</i>", FK_FILL, FK_STROKE, "dashed=1;"
        else:
            val, fill, stroke, extra = text, ATT_FILL, ATT_STROKE, ""
        a = vertex(val, f"ellipse;whiteSpace=wrap;html=1;fillColor={fill};strokeColor={stroke};{extra}"
                   f"fontSize=12;{base_font}", x - w / 2, y - h / 2, w, h)
        edge(a, ids[ent], f"endArrow=none;html=1;strokeColor={LINE};")
    for r in m["rels"]:
        w, h = r.get("w", REL_W), r.get("h", REL_H)
        d = vertex(r["label"].replace("\n", "<br>"),
                   f"rhombus;whiteSpace=wrap;html=1;fillColor={REL_FILL};strokeColor={REL_STROKE};"
                   f"fontSize=11;{base_font}", r["x"] - w / 2, r["y"] - h / 2, w, h)
        for ent, mk, pts in r["ends"]:
            e = m["entities"][ent]
            ex, ey = rel_exit(r, pts[0])
            bx, by = pts[-1]
            nx = (bx - (e["x"] - e["_w"] / 2)) / e["_w"]
            ny = (by - (e["y"] - e["_h"] / 2)) / e["_h"]
            style = (f"endArrow={DRAWIO_MARK[mk]};endFill=0;endSize=12;html=1;strokeColor={LINE};"
                     f"exitX={ex:.3f};exitY={ey:.3f};exitDx=0;exitDy=0;exitPerimeter=0;"
                     f"entryX={nx:.3f};entryY={ny:.3f};entryDx=0;entryDy=0;entryPerimeter=0;"
                     + ("dashed=1;" if r.get("dashed") else ""))
            edge(d, ids[ent], style, pts[:-1])
    xml = (f'<mxfile host="Electron"><diagram name="{escape(m["title"])}" id="erd">'
           f'<mxGraphModel dx="{W}" dy="{H}" grid="1" gridSize="10" guides="1" page="1" pageScale="1" '
           f'pageWidth="{W}" pageHeight="{H}" math="0" shadow="0"><root><mxCell id="0"/>'
           f'<mxCell id="1" parent="0"/>{"".join(cells)}</root></mxGraphModel></diagram></mxfile>')
    open(path, "w", encoding="utf-8").write(xml)
