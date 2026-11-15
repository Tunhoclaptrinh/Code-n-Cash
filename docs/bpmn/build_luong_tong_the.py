"""Build the CodeCash role-based overall flow as a native draw.io BPMN diagram.

Usage: python docs/bpmn/build_luong_tong_the.py docs/bpmn/luong-tong-the-theo-vai-tro.drawio
"""
import sys
from pathlib import Path

SKILL = Path(__file__).resolve().parents[2] / ".claude/skills/bpmn-drawio/scripts"
sys.path.insert(0, str(SKILL))
from bpmn_builder import Diagram, save_pair  # noqa: E402

out = Path(sys.argv[1])
d = Diagram("luong-tong-the", "Luồng tổng thể theo vai trò", width=1800, height=1000)
# The slide already carries the title; the page itself does not need one.
d.root.remove(d.objects.pop("TITLE"))

X0, W = 20, 1770
P = d.pool("P", "CodeCash: thực hiện hợp đồng có điều kiện thanh toán", X0, 20, W, 950)
LANES = [
    ("L1", "Cán bộ hợp đồng\nbên mua", 20, 180),
    ("L2", "Đại diện ký\ncác bên", 200, 120),
    ("L3", "Bên nộp chứng từ", 320, 130),
    ("L4", "Hệ thống CodeCash", 450, 190),
    ("L5", "Người phê duyệt\nbên mua", 640, 140),
    ("L6", "Kiểm soát viên", 780, 190),
]
for key, label, y, h in LANES:
    d.lane(key, label, (X0 + 48, y, W - 48, h), P)
    cell = d.objects[key].find("mxCell")
    cell.set("style", cell.get("style") + "startSize=56;")

# Contract set-up, before any milestone exists.
d.event("S0", "Hợp đồng cần thực hiện", 156, 91, "L1", labelWidth=80)
d.task("T1", "Tải hợp đồng, rà soát và khoá điều khoản (AI chỉ gợi ý)", 220, 65, "L1", "user", w=175, h=90)
d.task("T2", "Đặt vị trí ký cho các bên", 425, 70, "L1", "user", w=160, h=80)
d.task("T3", "Ký số lần lượt theo thứ tự", 425, 220, "L2", "user", w=160, h=80,
       extra="isLoopMultiSeq=1;", isSequential="true")
d.task("T4", "Kích hoạt hợp đồng, mở các mốc", 425, 505, "L4", "service", w=160, h=80)

# One instance per milestone, all milestones in parallel.
SP = d.subprocess("SP", "Xử lý từng mốc thanh toán", (615, 32, 1045, 928), P)
sp = d.objects["SP"].find("mxCell")
sp.set("style", sp.get("style") + "isLoopMultiParallel=1;fillOpacity=0;")
d.objects["SP"].set("isSequential", "false")

d.event("s1", "Mốc được mở", 640, 526, SP, labelWidth=70)
d.gateway("M", "", 690, 518, SP)
d.task("EV", "Engine đánh giá lại mốc theo bộ luật", 780, 505, SP, "businessRule", w=170, h=80)
d.gateway("G1", "Quyết định?", 1010, 518, SP)
d.event("ER", "Mốc bị từ chối", 1091, 459, SP, outline="end")
d.task("TP", "Chuyển kế toán số tiền được trả", 957, 670, SP, "user", w=160, h=80)
d.event("EP", "Đã gửi lệnh chi sang kế toán", 1160, 691, SP, outline="end", symbol="message", labelWidth=110)
d.boundary("BP", "Mốc hết đủ điều kiện", "TP", symbol="conditional", interrupt=True)
# Attach near the left end of the bottom edge and label to the left, away from the message end.
bp = d.objects["BP"].find("mxCell")
bp.find("mxGeometry").set("x", "13")
bp.set("style", bp.get("style").replace("labelPosition=right;align=left;spacingLeft=10;", "labelPosition=left;align=right;spacingRight=8;labelWidth=110;verticalLabelPosition=middle;verticalAlign=middle;spacingTop=0;"))
d.boxes["BP"] = (970, 733, 34, 34)
d.gateway("G2", "Trạng thái?", 1303, 518, SP)
d.task("TS", "Nộp chứng từ còn thiếu (đúng bên)", 1250, 345, SP, "user", w=160, h=80)
d.task("TA", "Phê duyệt hoặc từ chối đúng vai trò", 1250, 670, SP, "user", w=160, h=80)
d.gateway("G3", "Có tranh chấp mở?", 1443, 518, SP)
d.event("CW", "Tranh chấp đã đóng", 1571, 526, SP, outline="catching", symbol="conditional")
d.task("TX", "Vô hiệu chứng từ sai thẩm quyền (hai người duyệt)", 1390, 800, SP, "user", w=160, h=80)

# A dispute can be opened at any moment of the milestone; it never stops the main path.
ESP = d.subprocess("ESP", "Tranh chấp (bất kỳ lúc nào)", (880, 45, 560, 145), SP, event=True)
d.event("DS", "Một bên mở tranh chấp", 925, 96, ESP, outline="eventNonint", symbol="conditional", labelWidth=120)
d.task("DT", "Giải quyết tranh chấp, đóng có tham chiếu", 1010, 78, ESP, "user", w=190, h=80)
d.event("DE", "Tranh chấp đã đóng", 1271, 99, ESP, outline="end", labelWidth=120)

d.event("E0", "Hợp đồng đã đóng", 1711, 526, P, outline="end")

# Top-level sequence.
d.edge("f1", "S0", "T1")
d.edge("f2", "T1", "T2")
d.edge("f3", "T2", "T3", exit=(.5, 1), entry=(.5, 0))
d.edge("f4", "T3", "T4", exit=(.5, 1), entry=(.5, 0))
spy = (545 - 32) / 928
d.edge("f5", "T4", "SP", entry=(0, spy))
d.edge("f6", "SP", "E0", exit=(1, spy))

# Milestone loop: every new event leads back to the engine.
d.edge("m1", "s1", "M")
d.edge("m2", "M", "EV")
d.edge("m3", "EV", "G1")
d.edge("g1r", "G1", "ER", "Từ chối", exit=(.5, 0), entry=(0, .5), points=[(1037, 478)], condition="REJECT", offset=(0, 0))
d.edge("g1p", "G1", "TP", "Chi đủ / chi trừ phạt", exit=(.5, 1), entry=(.5, 0), condition="RELEASE or PENALTY", offset=(0, 0))
d.edge("g1h", "G1", "G2", "Tạm giữ", condition="HOLD")
d.edge("tp", "TP", "EP")
d.edge("g2s", "G2", "TS", "Thiếu chứng từ", exit=(.5, 0), entry=(.5, 1), condition="WAITING_EVIDENCE", offset=(-52, 0))
d.edge("g2a", "G2", "TA", "Chờ phê duyệt", exit=(.5, 1), entry=(.5, 0), condition="WAITING_APPROVAL", offset=(0, 0))
d.edge("g2h", "G2", "G3", "Tạm giữ khác", condition="ON_HOLD")
d.edge("g3d", "G3", "CW", "Có", condition="open dispute")
d.edge("g3x", "G3", "TX", "Lý do khác", exit=(.5, 1), entry=(.5, 0), default=True, offset=(0, 0))

# Returns above the axis share the corridor in the signing lane, returns below share the bottom corridor.
UP, DOWN = 270, 915
d.edge("rs", "TS", "M", exit=(.5, 0), entry=(.5, 0), points=[(1330, UP), (717, UP)])
d.edge("rc", "CW", "M", exit=(.5, 0), entry=(.5, 0), points=[(1590, UP), (717, UP)])
d.edge("ra", "TA", "M", exit=(.5, 1), entry=(.5, 1), points=[(1330, DOWN), (717, DOWN)])
d.edge("rx", "TX", "M", exit=(.5, 1), entry=(.5, 1), points=[(1470, DOWN), (717, DOWN)])
d.edge("rb", "BP", "M", exit=(.5, 1), entry=(.5, 1), points=[(987, DOWN), (717, DOWN)])

# Gateway questions sit at the upper left so they do not cover flows leaving the top vertex.
for key in ("G1", "G2", "G3"):
    cell = d.objects[key].find("mxCell")
    cell.set("style", cell.get("style").replace("labelWidth=150;", "labelWidth=90;") + "labelPosition=left;align=right;spacingRight=-14;")

# Dispute handler.
d.edge("d1", "DS", "DT")
d.edge("d2", "DT", "DE")

# Event label widths live in the style (the builder keeps extra keyword arguments as metadata only).
for key in ("S0", "s1", "EP", "DS", "DE"):
    obj = d.objects[key]
    width = obj.attrib.pop("labelWidth", None)
    if width:
        cell = obj.find("mxCell")
        cell.set("style", cell.get("style").replace("labelWidth=145;", f"labelWidth={width};"))

save_pair([d], out, normal_theme="monochrome", color_theme="bizagi-inspired")
print("written", out)
