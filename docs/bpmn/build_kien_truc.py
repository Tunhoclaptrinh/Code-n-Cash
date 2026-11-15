"""Build the CodeCash C4 container diagram as a native draw.io file.

Usage: python docs/bpmn/build_kien_truc.py docs/bpmn/kien-truc-he-thong.drawio
"""
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

FONT = "fontFamily=Arial;"
PAD = "spacingLeft=12;spacingRight=12;"
PERSON = FONT + "html=1;dashed=0;whiteSpace=wrap;fillColor=#083F75;strokeColor=#06315C;fontColor=#ffffff;shape=mxgraph.c4.person2;align=center;verticalAlign=bottom;spacingBottom=14;"
CONTAINER = FONT + PAD + "rounded=1;whiteSpace=wrap;html=1;labelBackgroundColor=none;fillColor=#23A2D9;fontColor=#ffffff;align=center;arcSize=6;strokeColor=#0E7DAD;"
DATABASE = FONT + PAD + "shape=cylinder3;size=15;whiteSpace=wrap;html=1;boundedLbl=1;rounded=0;labelBackgroundColor=none;fillColor=#23A2D9;fontColor=#ffffff;align=center;strokeColor=#0E7DAD;"
EXTERNAL = FONT + PAD + "rounded=1;whiteSpace=wrap;html=1;labelBackgroundColor=none;fillColor=#8C8496;fontColor=#ffffff;align=center;arcSize=10;strokeColor=#736782;"
PLANNED = EXTERNAL + "dashed=1;dashPattern=8 4;strokeWidth=2;strokeColor=#3F3A47;"
BOUNDARY = FONT + "rounded=1;whiteSpace=wrap;html=1;dashed=1;arcSize=20;fillColor=none;strokeColor=#666666;fontColor=#333333;labelBackgroundColor=none;align=left;verticalAlign=bottom;spacing=12;dashPattern=8 4;absoluteArcSize=1;"
REL = FONT + "endArrow=blockThin;html=1;fontSize=15;fontColor=#404040;strokeWidth=1.5;endFill=1;strokeColor=#828282;endSize=12;rounded=0;edgeStyle=orthogonalEdgeStyle;labelBackgroundColor=#ffffff;"
NOTE = FONT + "text;html=1;align=left;verticalAlign=middle;whiteSpace=wrap;fontSize=15;fontColor=#333333;"


def card(name, text, name_size=22):
    return (f'<b style="font-size:{name_size}px">{name}</b><br><br>'
            f'<span style="font-size:16px">{text}</span>')


model = ET.Element("mxGraphModel", page="1", pageWidth="1800", pageHeight="960", grid="1", gridSize="10", background="#ffffff")
root = ET.SubElement(model, "root")
ET.SubElement(root, "mxCell", id="0")
ET.SubElement(root, "mxCell", id="1", parent="0")


def vertex(key, label, style, x, y, w, h, **meta):
    obj = ET.SubElement(root, "object", id=key, label=label, **meta)
    cell = ET.SubElement(obj, "mxCell", vertex="1", parent="1", style=style)
    ET.SubElement(cell, "mxGeometry", x=str(x), y=str(y), width=str(w), height=str(h), **{"as": "geometry"})


def rel(key, source, target, label, exit, entry, points=(), dashed=False, label_at=None):
    style = REL + f"exitX={exit[0]};exitY={exit[1]};entryX={entry[0]};entryY={entry[1]};"
    if dashed:
        style += "dashed=1;dashPattern=8 4;"
    obj = ET.SubElement(root, "object", id=key, label=label, c4Type="Relationship")
    cell = ET.SubElement(obj, "mxCell", edge="1", parent="1", source=source, target=target, style=style)
    geo = ET.SubElement(cell, "mxGeometry", relative="1", **{"as": "geometry"})
    if points:
        arr = ET.SubElement(geo, "Array", **{"as": "points"})
        for x, y in points:
            ET.SubElement(arr, "mxPoint", x=str(x), y=str(y))
    if label_at is not None:
        geo.set("x", str(label_at[0]))
        ET.SubElement(geo, "mxPoint", x="0", y=str(label_at[1]), **{"as": "offset"})


# Layout grid (absolute page coordinates).
PX, PW = 30, 230            # person and Data Pack column
BX, BW = 330, 1000          # system boundary
C1, C2 = 380, 960           # inner columns
CW = 330                    # inner container width
EX, EW = 1440, 330          # external systems column
R1Y, R2Y, R3Y = 60, 330, 650

# System boundary first so everything else paints over it.
vertex("B", '<b style="font-size:18px">CodeCash</b>', BOUNDARY, BX, 30, BW, 900, c4Type="SystemScopeBoundary")

vertex("U", card("Người dùng",
                 "Bên mua (chủ hợp đồng, cán bộ hợp đồng, người phê duyệt), nhà cung cấp, kiểm soát viên, quản trị hệ thống, kiểm toán"),
       PERSON, PX, 40, PW, 300, c4Type="Person")
vertex("DP", card("Data Pack BTC",
                  "Tệp CSV: 100 hợp đồng, 405 mốc, 1.134 sự kiện, 128 luật"),
       EXTERNAL, PX, 640, PW, 180, c4Type="Software System")

vertex("W", card("Ứng dụng web",
                 "Màn hình theo vai trò; chỉ hiển thị và gửi thao tác, không ra quyết định"),
       CONTAINER, C1, R1Y, CW, 170, c4Type="Container")
vertex("A", card("Máy chủ nghiệp vụ (API)",
                 "Xác thực, phân quyền theo tổ chức; thao tác nghiệp vụ có kiểm quyền; ký theo trình tự; đọc PDF/DOCX; nhật ký chuỗi băm, neo đầu chuỗi"),
       CONTAINER, C1, R2Y, CW + 30, 220, c4Type="Container")
vertex("E", card("Bộ máy quyết định (engine)",
                 "Lọc bằng chứng; kiểm phê duyệt, tranh chấp, thời hạn; chọn luật đầu tiên khớp; tính tiền bằng Decimal"),
       CONTAINER, C2, R2Y, CW, 190, c4Type="Container")
vertex("D", card("Cơ sở dữ liệu",
                 "Hợp đồng, sự kiện, quyết định, phiên bản luật, nhật ký audit"),
       DATABASE, C1, R3Y, CW, 180, c4Type="Container")
vertex("F", card("Kho tệp",
                 "Tệp hợp đồng, khoá ký cục bộ, biên nhận neo audit"),
       DATABASE, C2, R3Y, CW, 180, c4Type="Container")

vertex("G", card("Dịch vụ AI",
                 "Tuỳ chọn. Đọc hợp đồng, gợi ý điều khoản kèm trang nguồn; người dùng xác nhận"),
       EXTERNAL, EX, R1Y, EW, 170, c4Type="Software System")
vertex("S", card("Dịch vụ ký số",
                 "Tuỳ chọn. Ký mã băm tài liệu; bản demo ký cục bộ trong máy chủ"),
       EXTERNAL, EX, R2Y, EW, 170, c4Type="Software System")
vertex("K", card("Kế toán",
                 "Chưa tích hợp. Nhận lệnh chi; bản demo ghi nhận chuyển chi trong CodeCash"),
       PLANNED, EX, 590, EW, 170, c4Type="Software System")

vertex("LG", "<b>Chú giải:</b> hình người = người dùng · xanh = container của CodeCash · trụ = nơi lưu dữ liệu · xám = hệ thống ngoài · viền hoặc mũi tên nét đứt = chưa tích hợp · mũi tên đi từ bên gọi tới bên được gọi",
       NOTE, 1380, 800, 410, 130)

AX, AW, AH = C1, CW + 30, 220
def ax(x): return (x - AX) / AW
def ay(y): return (y - R2Y) / AH

rel("r1", "U", "W", "Dùng màn hình<br>theo vai trò", (1, (145 - 40) / 300), (0, .5), label_at=(0, -34))
rel("r2", "W", "A", "Gửi thao tác, đọc dữ liệu", (.5, 1), (ax(C1 + CW / 2), 0))
rel("r3", "A", "E", "Truyền dữ liệu và<br>bộ luật đã công bố;<br>nhận quyết định", (1, ay(425)), (0, .5))
rel("r4", "A", "D", "Ghi dữ liệu và nhật ký<br>trong một giao dịch", (ax(C1 + CW / 2), 1), (.5, 0))
rel("r5", "A", "F", "Lưu tệp, khoá ký, biên nhận neo", (ax(720), 1), (.5, 0), points=[(720, 600), (C2 + CW / 2, 600)])
rel("r6", "A", "G", "Gửi PDF, nhận gợi ý điều khoản", (ax(735), 0), (0, .5), points=[(735, 145)])
rel("r7", "A", "S", "Ký mã băm tài liệu", (1, ay(350)), (0, .3), points=[(760, 350), (760, 290), (1380, 290), (1380, 381)])
rel("r8", "A", "K", "Gửi lệnh chi (dự kiến cho MVP)", (1, ay(535)), (0, .5), points=[(1400, 535), (1400, 675)], dashed=True)
rel("r9", "A", "DP", "Nạp dữ liệu lúc khởi tạo", (0, ay(520)), (.5, 0), points=[(PX + PW / 2, 520)], label_at=(.62, 0))

out = Path(sys.argv[1])
out.parent.mkdir(parents=True, exist_ok=True)
mx = ET.Element("mxfile", host="app.diagrams.net", pages="1")
ET.SubElement(mx, "diagram", id="kien-truc", name="Kiến trúc hệ thống (C4 container)").append(model)
ET.indent(mx, space="  ")
ET.ElementTree(mx).write(out, encoding="utf-8", xml_declaration=True)
print("written", out)
