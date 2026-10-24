import sys
from chen import render_svg, render_drawio

E = lambda label, sub, x, y, **k: dict(label=label, sub=sub, x=x, y=y, w=k.get("w", 180), h=k.get("h", 60))

m = dict(
    title="Sơ đồ ERD — Data Pack BTC (01_data)",
    subtitle="Case 4 Smart Contract Workflow · 5 bảng CSV · snapshot 18/10/2026",
    size=(1780, 1300),
    legend_at=(1070, 1145),
    entities=dict(
        parties=E("parties", "Bên tham gia", 330, 600),
        contracts=E("contracts", "Hợp đồng", 830, 310),
        payment_rules=E("payment_rules", "Quy tắc thanh toán", 1420, 310),
        milestones=E("milestones", "Mốc thanh toán", 1420, 660),
        events=E("events", "Sự kiện", 830, 900),
    ),
    attrs=[
        ("parties", "party_id", "pk", 140, 500),
        ("parties", "party_name", "attr", 215, 425),
        ("parties", "party_type", "attr", 115, 580),
        ("parties", "approval_role", "attr", 120, 660),
        ("parties", "parent_party_id", "fk", 150, 745),

        ("contracts", "contract_id", "pk", 640, 215),
        ("contracts", "buyer_id", "fk", 700, 140),
        ("contracts", "supplier_id", "fk", 830, 118),
        ("contracts", "rule_set_id", "attr", 955, 140),
        ("contracts", "contract_type", "attr", 1065, 190),
        ("contracts", "contract_value_vnd_mn", "attr", 1010, 258),

        ("payment_rules", "rule_id", "pk", 1280, 175),
        ("payment_rules", "rule_set_id", "attr", 1420, 135),
        ("payment_rules", "release_rule_code", "attr", 1590, 180),
        ("payment_rules", "priority", "attr", 1630, 255),
        ("payment_rules", "decision", "attr", 1630, 330),

        ("milestones", "milestone_id", "pk", 1620, 560),
        ("milestones", "contract_id", "fk", 1650, 625),
        ("milestones", "milestone_sequence", "attr", 1640, 690),
        ("milestones", "due_date", "attr", 1620, 755),
        ("milestones", "planned_payment_vnd_mn", "attr", 1580, 820),
        ("milestones", "release_rule_code", "attr", 1240, 565),

        ("events", "event_id", "pk", 620, 990),
        ("events", "actor_party_id", "fk", 440, 980),
        ("events", "milestone_id", "fk", 545, 1075),
        ("events", "reference_event_id", "fk", 770, 1045),
        ("events", "contract_id", "fk", 650, 800),
        ("events", "event_type", "attr", 990, 760),
        ("events", "event_status", "attr", 1010, 825),
    ],
    rels=[
        dict(label="Là bên mua\n(buyer_id)", x=560, y=310,
             ends=[("parties", "mone", [(330, 310), (330, 570)]), ("contracts", "zmany", [(740, 310)])]),
        dict(label="Là nhà cung cấp\n(supplier_id)", x=600, y=585,
             ends=[("parties", "mone", [(420, 585)]), ("contracts", "zmany", [(770, 585), (770, 340)])]),
        dict(label="Trực thuộc\n(parent_party_id)", x=520, y=725,
             ends=[("parties", "zone", [(520, 618), (420, 618)]), ("parties", "zmany", [(380, 725), (380, 630)])]),
        dict(label="Tạo sự kiện\n(actor_party_id)", x=560, y=900,
             ends=[("parties", "mone", [(300, 900), (300, 630)]), ("events", "zmany", [(740, 900)])]),
        dict(label="Phát sinh\n(contract_id)", x=830, y=760,
             ends=[("contracts", "mone", [(830, 340)]), ("events", "zmany", [(830, 870)])]),
        dict(label="Gồm\n(contract_id)", x=1110, y=660,
             ends=[("contracts", "mone", [(890, 660), (890, 340)]), ("milestones", "omany", [(1330, 660)])]),
        dict(label="Ghi nhận\n(milestone_id)", x=1200, y=890,
             ends=[("milestones", "mone", [(1420, 890), (1420, 690)]), ("events", "zmany", [(920, 890)])]),
        dict(label="Tham chiếu\n(reference_event_id)", x=1060, y=1010, w=160,
             ends=[("events", "zone", [(1060, 915), (920, 915)]), ("events", "zmany", [(880, 1010), (880, 930)])]),
        dict(label="Áp dụng bộ rule\n(rule_set_id)", x=1125, y=310, dashed=True,
             ends=[("contracts", "zmany", [(920, 310)]), ("payment_rules", "omany", [(1330, 310)])]),
        dict(label="Khớp mã rule\n(release_rule_code)", x=1420, y=485, w=160, dashed=True,
             ends=[("payment_rules", "omany", [(1420, 340)]), ("milestones", "zmany", [(1420, 630)])]),
    ],
)

out = sys.argv[1]
render_svg(m, out + ".svg")
render_drawio(m, out + ".drawio")
