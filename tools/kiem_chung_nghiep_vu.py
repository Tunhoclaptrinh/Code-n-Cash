"""Kiểm chứng đặc tả nghiệp vụ Case 4 trên Data Pack.

Script tham chiếu cho docs/04_DAC_TA_NGHIEP_VU.md (SPEC_VERSION bên dưới phải trùng phiên bản
tài liệu): cài đúng các quy tắc BR-01..BR-20, đọc rule từ payment_rules.csv, in mọi con số được
gắn nhãn [DỮ LIỆU] / [SAMPLE] và kiểm các bất biến đầu ra. Đây không phải engine nộp bài.
Chỉ dùng thư viện chuẩn Python 3.9+.

Chạy từ thư mục gốc repo:
    python3 tools/kiem_chung_nghiep_vu.py                    # báo cáo đầy đủ
    python3 tools/kiem_chung_nghiep_vu.py --check            # thoát mã 1 nếu lệch sample hoặc vi phạm bất biến
    python3 tools/kiem_chung_nghiep_vu.py --export ket_qua.csv
    python3 -m unittest discover -s tests -v                 # bộ test ca biên (mục 16 của đặc tả)
"""

import argparse
import csv
import hashlib
import math
import sys
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta
from decimal import ROUND_HALF_EVEN, Decimal
from pathlib import Path

# The evaluator lives in the codecash_engine package (apps/engine); this module is the spec check command.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "apps" / "engine"))
from codecash_engine import (  # noqa: E402,F401  (re-exported for the tests and the engine adapter)
    AUTHORITY, CENT, DECISIONS, DEFAULT_DATA, PRIORITIES, SNAPSHOT, SPEC_VERSION, STATUS, SUPPORT_TYPES,
    VALID_STATUS, Pack, _eval, assumption_flags, check_invariants, compare_samples, confidence_score, confidence_scores,
    evaluate, evaluate_all, evaluate_expr, read)


# ---------- Report ----------

def h(title):
    print(f"\n=== {title} ===")


def money(x):
    return f"{x:,.2f}"


def variant_impact(pack, base, label, **kw):
    alt = evaluate_all(pack, **kw)
    key = lambda r: (r["decision"], r["reason_code"], r["payable"], r["penalty"])
    changed = [mid for mid in pack.milestones if key(alt[mid]) != key(base[mid])]
    sample_ok = sum(1 for d in pack.decisions if key(alt[d["milestone_id"]]) == (
        d["expected_decision"], d["reason_code"], Decimal(d["payable_amount_vnd_mn"]), Decimal(d["penalty_amount_vnd_mn"])))
    by = Counter(f"{base[x]['reason_code']}->{alt[x]['reason_code']}" for x in changed)
    print(f"{label}: đổi kết quả {len(changed)}/405 milestone; sample còn khớp {sample_ok}/20; {dict(by)}")
    if 0 < len(changed) <= 12:
        print("   ", " ".join(changed))
    return changed


def report(pack, export=None):
    P, M, C, E = pack.parties, pack.milestones, pack.contracts, pack.events
    results = evaluate_all(pack)
    print(f"Đặc tả nghiệp vụ v{SPEC_VERSION} — Data Pack: {pack.base}")

    h("1. Quy mô")
    print("contracts", len(C), "parties", len(P), "milestones", len(M), "rules", len(pack.rules), "events", len(E))
    print("contract_type", dict(Counter(c["contract_type"] for c in C.values())))
    print("party_type", dict(Counter(p["party_type"] for p in P.values())),
          "approver roles", dict(Counter(p["approval_role"] for p in P.values() if p["party_type"] == "APPROVER")))
    vals = [Decimal(c["contract_value_vnd_mn"]) for c in C.values()]
    print("giá trị HĐ min/max/tb/tổng", min(vals), max(vals), (sum(vals) / len(vals)).quantize(CENT), sum(vals))
    print("event_type", dict(Counter(e["event_type"] for e in E).most_common()))

    h("2. Toàn vẹn dữ liệu")
    print("PK trùng:", {n: len(rows) - len({r[k] for r in rows}) for n, rows, k in
                        [("contracts", list(C.values()), "contract_id"), ("events", E, "event_id"),
                         ("milestones", list(M.values()), "milestone_id"), ("rules", pack.rules, "rule_id")]})
    print("FK mồ côi events:", sum(1 for e in E if e["contract_id"] not in C or e["milestone_id"] not in M
                                   or e["actor_party_id"] not in P
                                   or (e["reference_event_id"] and e["reference_event_id"] not in pack.event_by_id)))
    print("event.contract_id lệch milestone:", sum(1 for e in E if M[e["milestone_id"]]["contract_id"] != e["contract_id"]))
    pct, amt = defaultdict(Decimal), defaultdict(Decimal)
    for m in M.values():
        pct[m["contract_id"]] += Decimal(m["payment_percent"])
        amt[m["contract_id"]] += Decimal(m["planned_payment_vnd_mn"])
    print("HĐ tổng % = 100:", sum(1 for k in C if pct[k] == 100), "/ HĐ tổng tiền khớp:",
          sum(1 for k in C if amt[k] == Decimal(C[k]["contract_value_vnd_mn"])))
    print("milestone không có event:", sum(1 for k in M if not pack.events_by_ms[k]))
    print("release_rule_code = rule_set_id:milestone_type:",
          sum(1 for m in M.values() if m["release_rule_code"] == f"{C[m['contract_id']]['rule_set_id']}:{m['milestone_type']}"))
    print("phạm vi rule:", len(pack.rules_by_scope), "mỗi phạm vi đủ 8 rule:",
          all([int(r["priority"]) for r in v] == PRIORITIES for v in pack.rules_by_scope.values()))
    distinct = defaultdict(set)
    for r in pack.rules:
        distinct[r["priority"]].add((r["condition_expression"], r["decision"], r["reason_code"], r["payable_amount_formula"],
                                     r["penalty_amount_formula"], r["parameter_source"], r["stop_processing"], r["active"]))
    print("số biến thể logic mỗi priority:", {k: len(v) for k, v in sorted(distinct.items(), key=lambda x: int(x[0]))})
    print("rule_id theo phạm vi:", {k: f"{v[0]['rule_id']}..{v[-1]['rule_id']}" for k, v in sorted(pack.rules_by_scope.items())})
    lpa = [m for m in M.values() if m["late_penalty_applicable"] == "TRUE"]
    same = sum(1 for m in lpa if all(Decimal(m[f]) == Decimal(C[m["contract_id"]][f])
                                     for f in ("grace_period_days", "penalty_rate_pct_per_day", "max_penalty_pct")))
    nolpa = [m for m in M.values() if m["late_penalty_applicable"] == "FALSE"]
    print(f"mốc có phạt: {len(lpa)}, tham số = hợp đồng: {same}; mốc không phạt: {len(nolpa)}, rate=cap=0: "
          f"{sum(1 for m in nolpa if Decimal(m['penalty_rate_pct_per_day']) == 0 and Decimal(m['max_penalty_pct']) == 0)}; "
          f"grace = hợp đồng ở mọi mốc: {all(m['grace_period_days'] == C[m['contract_id']]['grace_period_days'] for m in M.values())}")
    print("late_penalty theo loại mốc:", dict(Counter((m["milestone_type"], m["late_penalty_applicable"]) for m in M.values())))
    print("quorum = số vai trò:", sum(1 for m in M.values() if int(m["required_approval_quorum"]) == len([r for r in m["required_approval_roles"].split(";") if r])))
    pol = defaultdict(Counter)
    for m in M.values():
        c = C[m["contract_id"]]
        pol[c["approval_policy"]][(m["approval_required"], m["required_approval_quorum"], m["required_approval_roles"], c["auto_release_allowed"])] += 1
    for k, v in pol.items():
        print(f"  {k}: HĐ {len({m['contract_id'] for m in M.values() if C[m['contract_id']]['approval_policy'] == k})}, mốc {sum(v.values())}, {dict(v)}")
    inv = [m for m in M.values() if m["invoice_required"] == "TRUE" and "INVOICE" not in m["required_event_types"].split(";")]
    print("invoice_required=TRUE nhưng INVOICE không bắt buộc:", len(inv), dict(Counter(m["milestone_type"] for m in inv)),
          "có event INVOICE:", sum(1 for m in inv if any(e["event_type"] == "INVOICE" for e in pack.events_by_ms[m["milestone_id"]])))
    print("INVOICE amount = planned:", sum(1 for e in E if e["event_type"] == "INVOICE" and Decimal(e["amount_vnd_mn"]) == Decimal(M[e["milestone_id"]]["planned_payment_vnd_mn"])), "/",
          sum(1 for e in E if e["event_type"] == "INVOICE"))
    by_contract = defaultdict(list)
    for e in E:
        by_contract[e["contract_id"]].append(e)
    seq_ok = sum(1 for lst in by_contract.values()
                 if [e["event_timestamp"] for e in sorted(lst, key=lambda e: int(e["contract_event_sequence"]))] == sorted(e["event_timestamp"] for e in lst))
    print("contract_event_sequence khớp thứ tự thời gian:", seq_ok, "/", len(by_contract), "hợp đồng có event")
    print("document_id trống:", sum(1 for e in E if not e["document_id"]),
          "| event_status đúng theo loại:", sum(1 for e in E if VALID_STATUS[e["event_type"]] == e["event_status"]), "/", len(E))
    print("actor_party_type/role khớp parties:", sum(1 for e in E if P[e["actor_party_id"]]["party_type"] == e["actor_party_type"]
                                                     and (e["actor_party_type"] != "APPROVER" or P[e["actor_party_id"]]["approval_role"] == e["actor_role"])))
    print("amount = planned: APPROVAL", sum(1 for e in E if e["event_type"] == "APPROVAL" and Decimal(e["amount_vnd_mn"]) == Decimal(M[e["milestone_id"]]["planned_payment_vnd_mn"])),
          "/ 497, REJECTION", sum(1 for e in E if e["event_type"] == "REJECTION" and Decimal(e["amount_vnd_mn"]) == Decimal(M[e["milestone_id"]]["planned_payment_vnd_mn"])), "/ 6")
    print("approver mỗi (bên mua, vai trò):", dict(Counter(Counter((p["parent_party_id"], p["approval_role"]) for p in P.values() if p["party_type"] == "APPROVER").values())),
          "| event_source:", dict(Counter(e["event_source"] for e in E)))
    print("event nghiệp vụ không thuộc required_event_types của mốc:", sum(len(r["unrelated"]) for r in results.values()))
    if pack.base:
        manifest = {r["file_name"]: r for r in read(pack.base, "02_metadata/dataset_manifest_final.csv")}
        found = {p.name: p for p in pack.base.rglob("*.csv")}
        sha_ok = [n for n, r in manifest.items() if n in found and hashlib.sha256(found[n].read_bytes()).hexdigest() == r["sha256"]]
        print("SHA-256 khớp manifest:", len(sha_ok), "/", sum(1 for n in manifest if n in found), "tệp CSV có mặt;",
              "tệp chỉ dành cho BTC:", [f"{n} ({r['row_count']} dòng)" for n, r in manifest.items() if r["artifact_group"] == "ORGANIZER_ONLY"])
    tmpl_ids = [t["milestone_id"] for t in pack.template]
    print("template:", len(pack.template), "dòng,", len(pack.template[0]), "cột, ID duy nhất", len(set(tmpl_ids)),
          ", khớp milestones:", set(tmpl_ids) == set(M))

    h("3. Thẩm quyền")
    for t in ("BUYER", "SUPPLIER", "APPROVER"):
        print(t, dict(Counter((p["approval_role"], p["allowed_event_types"], p["can_approve_payment"], p["can_raise_dispute"])
                              for p in P.values() if p["party_type"] == t)))
    print("event_type x actor_party_type:", dict(sorted(Counter((e["event_type"], e["actor_party_type"]) for e in E).items())))
    literal = [e for e in E if e["event_type"] not in P[e["actor_party_id"]]["allowed_event_types"].split(";")]
    dispute_lit = [e for e in literal if e["event_type"].startswith("DISPUTE")]
    real = [e for e in literal if not e["event_type"].startswith("DISPUTE") and AUTHORITY.get(e["event_type"]) != e["actor_party_type"]]
    print(f"lệch literal allowed_event_types: {len(literal)} = {len(dispute_lit)} dispute + {len(literal) - len(dispute_lit)} khác"
          f" (trong đó vi phạm thật theo ma trận: {len(real)}, bắt nhầm: {len(literal) - len(dispute_lit) - len(real)})")
    unsampled = {"KICKOFF_CONFIRMED", "REQUIREMENTS_APPROVED", "GO_LIVE", "SERVICE_ACTIVATED"}
    print("mốc phụ thuộc quyền của 4 loại event chưa có sample:", sum(1 for m in M.values() if unsampled & set(m["required_event_types"].split(";"))))
    print("sự kiện sai bên:", [(e["event_id"], e["milestone_id"], e["event_type"], e["actor_party_type"], e["event_source"]) for e in
                               E if e["event_type"] in AUTHORITY and AUTHORITY[e["event_type"]] != e["actor_party_type"]])
    print("event bên mua/NCC không thuộc HĐ:", sum(1 for e in E if e["actor_party_type"] in ("BUYER", "SUPPLIER")
                                                 and e["actor_party_id"] not in (C[e["contract_id"]]["buyer_id"], C[e["contract_id"]]["supplier_id"])),
          "| approval của approver ngoài bên mua:", sum(1 for e in E if e["event_type"] == "APPROVAL" and P[e["actor_party_id"]]["parent_party_id"] != C[e["contract_id"]]["buyer_id"]),
          "| approval sai vai trò:", sum(1 for e in E if e["event_type"] == "APPROVAL" and P[e["actor_party_id"]]["approval_role"] not in M[e["milestone_id"]]["required_approval_roles"].split(";")),
          "| approver duyệt >1 lần/mốc:", sum(v - 1 for v in Counter((e["milestone_id"], e["actor_party_id"]) for e in E if e["event_type"] == "APPROVAL").values()))
    print("dispute mở bởi:", dict(Counter(e["actor_party_type"] for e in E if e["event_type"] == "DISPUTE_OPENED")),
          "| resolve bởi:", dict(Counter(e["actor_party_type"] for e in E if e["event_type"] == "DISPUTE_RESOLVED")),
          "| rejection bởi:", dict(Counter(e["actor_role"] for e in E if e["event_type"] == "REJECTION")))

    h("4. Thời gian")
    ts = sorted(e["event_timestamp"] for e in E)
    after = [e for e in E if datetime.fromisoformat(e["event_timestamp"]).date() > SNAPSHOT]
    sample_ms = {d["milestone_id"] for d in pack.decisions}
    print("khoảng event:", ts[0], "->", ts[-1], "| sau snapshot:", len(after), "event,", len({e["milestone_id"] for e in after}),
          "mốc; thuộc mốc sample:", sum(1 for e in after if e["milestone_id"] in sample_ms))
    print("mốc có due_date sau snapshot:", sum(1 for m in M.values() if date.fromisoformat(m["due_date"]) > SNAPSHOT))
    early = 0
    for mid, m in M.items():
        req = m["required_event_types"].split(";")
        last = max((e["event_timestamp"] for e in pack.events_by_ms[mid] if e["event_type"] in req), default=None)
        early += sum(1 for e in pack.events_by_ms[mid] if e["event_type"] == "APPROVAL" and last and e["event_timestamp"] < last)
    print("approval sớm hơn required event cuối:", early, "| event trước ngày ký:",
          sum(1 for e in E if e["event_timestamp"][:10] < C[e["contract_id"]]["signing_date"]))
    print("thời gian resolve:", dict(Counter(str(datetime.fromisoformat(e["event_timestamp"]) - datetime.fromisoformat(pack.event_by_id[e["reference_event_id"]]["event_timestamp"]))
                                         for e in E if e["event_type"] == "DISPUTE_RESOLVED")))
    print("cặp duplicate:", [(r["milestone_id"], r["duplicates"],
                              str(datetime.fromisoformat(pack.event_by_id[r["duplicates"][0][0]]["event_timestamp"]) - datetime.fromisoformat(pack.event_by_id[r["duplicates"][0][1]]["event_timestamp"])))
                             for r in results.values() if r["duplicates"]])

    h("5. So khớp 20 sample")
    full, mismatches = compare_samples(pack, results)
    for sc, mid, bad in mismatches:
        print("  LỆCH", sc, mid, bad)
    print(f"Khớp toàn bộ 17 cột so sánh (10 cột fact + quyết định, reason, payable, penalty, planned, evidence, "
          f"missing_required_events): {full}/{len(pack.decisions)} sample")
    print("loại mốc có sample:", dict(Counter(M[d["milestone_id"]]["milestone_type"] for d in pack.decisions)))
    print("loại mốc KHÔNG có sample:", sorted({m["milestone_type"] for m in M.values()} - {M[d["milestone_id"]]["milestone_type"] for d in pack.decisions}))

    h("6. Phân bố quyết định toàn pack (theo đặc tả)")
    for k, v in Counter((r["decision"], r["reason_code"]) for r in results.values()).most_common():
        print(f"  {k[0]:8} {k[1]:24} {v}")
    print("tổng kế hoạch", money(sum(Decimal(m["planned_payment_vnd_mn"]) for m in M.values())),
          "| payable", money(sum(r["payable"] for r in results.values())),
          "| penalty", money(sum(r["penalty"] for r in results.values())),
          "| giữ lại (HOLD+REJECT)", money(sum(Decimal(M[k]["planned_payment_vnd_mn"]) for k, r in results.items() if r["decision"] in ("HOLD", "REJECT"))))
    print("trạng thái milestone:", dict(Counter(r["status"] for r in results.values())))
    print("cổng chất lượng dữ liệu bị kích hoạt:", sum(1 for r in results.values() if r["issues"]))
    invariants = check_invariants(pack, results)
    print("vi phạm bất biến đầu ra:", len(invariants), invariants[:5])
    groups = defaultdict(list)
    for mid in sorted(results):
        groups[results[mid]["reason_code"]].append(mid)
    for k, v in groups.items():
        if k != "ALL_CONDITIONS_MET":
            print(f"  {k} ({len(v)}): {' '.join(v)}")
    print("  có duplicate:", " ".join(k for k, r in sorted(results.items()) if r["duplicates"]))
    print("chi tiết từng nhóm HOLD/REJECT:")
    for k in groups["MISSING_REQUIRED_EVENT"]:
        print("   thiếu", k, M[k]["milestone_type"], "thiếu:", ";".join(results[k]["missing"]))
    for k in groups["APPROVAL_QUORUM_NOT_MET"]:
        print("   quorum", k, f"{results[k]['valid_approval_count']}/{results[k]['quorum']}", M[k]["required_approval_roles"])
    for k in groups["REJECTION_PRESENT"]:
        print("   reject", k, "quorum", f"{results[k]['valid_approval_count']}/{results[k]['quorum']}", "approval_required", results[k]["approval_required"])
    for k in groups["OPEN_DISPUTE"]:
        print("   dispute", k, results[k]["open_dispute_ids"], "người mở", [pack.event_by_id[x]["actor_party_type"] for x in results[k]["open_dispute_ids"]],
              "điều kiện khác thiếu:", results[k]["missing_conditions"])
    print("ca phạt (mốc, ngày trễ, phạt thô, phạt, được trả, rate, cap):")
    for k in groups["LATE_COMPLETION"]:
        r = results[k]
        print(f"   {k} {r['days_late']} {r['raw_penalty'].normalize()} {r['penalty']} {r['payable']} {M[k]['penalty_rate_pct_per_day']} {M[k]['max_penalty_pct']}")
    late = [results[k] for k in groups["LATE_COMPLETION"]]
    print("trễ min/max:", min(r["days_late"] for r in late), max(r["days_late"] for r in late),
          "| % phạt cao nhất:", max(Decimal(r["days_late"]) * Decimal(M[r["milestone_id"]]["penalty_rate_pct_per_day"]) for r in late),
          "| trần nhỏ nhất:", min(Decimal(m["max_penalty_pct"]) for m in M.values() if m["late_penalty_applicable"] == "TRUE"),
          "| ca chạm trần:", sum(1 for r in late if r["penalty"] == (Decimal(M[r["milestone_id"]]["max_penalty_pct"]) / 100 * Decimal(M[r["milestone_id"]]["planned_payment_vnd_mn"])).quantize(CENT)))

    def limit(k):
        return date.fromisoformat(M[k]["due_date"]) + timedelta(days=int(M[k]["grace_period_days"]))

    def done(k):
        return datetime.fromisoformat(results[k]["completion_ts"]).date() if results[k]["completion_ts"] else None

    print("ca đúng biên hạn+ân hạn:", sum(1 for k in M if done(k) and done(k) == limit(k)),
          "| trễ nhưng không áp phạt:", sum(1 for k in M if done(k) and M[k]["late_penalty_applicable"] == "FALSE" and done(k) > limit(k)),
          "| trễ nhưng bị HOLD chặn:", sum(1 for k in M if done(k) and results[k]["decision"] == "HOLD" and M[k]["late_penalty_applicable"] == "TRUE" and done(k) > limit(k)))
    alt_days = []
    for r in late:
        lim = limit(r["milestone_id"])
        t = datetime.fromisoformat(r["completion_ts"])
        fl = math.floor((t - datetime.combine(lim, datetime.min.time())).total_seconds() / 86400)
        ce = math.ceil((t - datetime.combine(lim, datetime.max.time())).total_seconds() / 86400)
        if not r["days_late"] == fl == ce:
            alt_days.append(r["milestone_id"])
    print("cách đếm ngày (theo ngày / floor / ceil) cho kết quả khác nhau ở:", alt_days or "0 ca")
    print("ca chồng điều kiện:")
    for k, r in sorted(results.items()):
        flags = [n for n, v in [("dispute", r["open_dispute"]), ("rejection", r["valid_rejection_count"] > 0),
                                ("unauthorized", bool(r["unauthorized"])), ("missing", bool(r["missing"])),
                                ("quorum", r["approval_required"] and r["valid_approval_count"] < r["quorum"])] if v]
        if len(flags) > 1:
            print("  ", k, flags, "->", r["reason_code"])
    unsampled_types = sorted({m["milestone_type"] for m in M.values()} - {M[d["milestone_id"]]["milestone_type"] for d in pack.decisions})
    print("RELEASE theo loại mốc chưa có sample:", {t: sum(1 for k, r in results.items() if M[k]["milestone_type"] == t and r["decision"] == "RELEASE") for t in unsampled_types})

    h("7. Trạng thái hợp đồng (mục 9.3)")
    by_c = defaultdict(list)
    for r in results.values():
        by_c[r["contract_id"]].append(r["decision"])
    print(dict(Counter("NEEDS_REVIEW" if "REJECT" in v else "PENDING_CONDITIONS" if "HOLD" in v else "ALL_MILESTONES_ELIGIBLE" for v in by_c.values())))

    h("8. Độ nhạy theo giả định (so với đặc tả)")
    variant_impact(pack, results, "Quyền theo literal allowed_event_types", literal_permissions=True)
    changed = variant_impact(pack, results, "Dispute phạm vi hợp đồng", contract_scope_dispute=True)
    print("   HĐ có dispute mở:", len({M[k]["contract_id"] for k, r in results.items() if r["open_dispute"]}),
          "| mốc bị đổi thuộc sample:", [d["scenario_id"] for d in pack.decisions if d["milestone_id"] in changed])
    variant_impact(pack, results, "Coi mọi DISPUTE_OPENED là đang mở (bỏ qua resolve)", ignore_resolutions=True)
    variant_impact(pack, results, "Cắt event theo snapshot 18/10/2026 (as-of)", as_of="2026-10-18T23:59:59")
    variant_impact(pack, results, "Ngày hoàn thành tính cả approval", completion_includes_approval=True)
    variant_impact(pack, results, "Làm tròn HALF_EVEN", rounding=ROUND_HALF_EVEN)
    variant_impact(pack, results, "Bắt buộc INVOICE theo invoice_required", enforce_invoice_flag=True)
    blocked = []
    for k, m in M.items():
        earlier = [x for x, mm in M.items() if mm["contract_id"] == m["contract_id"]
                   and int(mm["milestone_sequence"]) < int(m["milestone_sequence"])]
        if results[k]["decision"] in ("RELEASE", "PENALTY") and any(results[x]["decision"] in ("HOLD", "REJECT") for x in earlier):
            blocked.append(k)
    print(f"Chặn tuần tự theo milestone_sequence: đổi kết quả {len(blocked)}/405 milestone (RELEASE/PENALTY -> HOLD); "
          f"sample bị ảnh hưởng: {[d['scenario_id'] for d in pack.decisions if d['milestone_id'] in blocked]}")
    lim = [e for e in E if e["event_type"] == "APPROVAL" and P[e["actor_party_id"]]["approval_limit_vnd_mn"]
           and Decimal(M[e["milestone_id"]]["planned_payment_vnd_mn"]) > Decimal(P[e["actor_party_id"]]["approval_limit_vnd_mn"])]
    print("Approval vượt approval_limit_vnd_mn:", len(lim), "| hạn mức theo vai trò:",
          dict(Counter((p["approval_role"], p["approval_limit_vnd_mn"]) for p in P.values() if p["party_type"] == "APPROVER")),
          "| planned lớn nhất:", max(Decimal(m["planned_payment_vnd_mn"]) for m in M.values()))

    h("9. Mốc phụ thuộc giả định Mở và confidence_score (mục 14.2)")
    flags = assumption_flags(pack, results)
    print("số mốc bị gắn cờ:", len(flags), "| theo giả định:", dict(Counter(a for v in flags.values() for a in v)),
          "| gắn >1 cờ:", sum(1 for v in flags.values() if len(v) > 1))
    scores = confidence_scores(pack, results, evaluate)
    print("confidence_score:", dict(sorted(Counter(scores[k][0] for k in M).items(), reverse=True)))
    print("yếu tố hạ điểm:", dict(Counter(f for k in M for f in scores[k][1])))
    print("cảnh báo dashboard (không đổi quyết định): mốc đủ điều kiện nhưng có mốc trước bị HOLD/REJECT:", len(blocked))

    if export:
        cols = ["contract_id", "milestone_id", "decision", "reason_code", "rule_id", "status", "payable", "penalty",
                "conditions_met", "missing_conditions", "evidence", "confidence_score", "assumption_flags", "missing",
                "unauthorized", "duplicates", "unrelated", "open_dispute", "valid_rejection_count", "valid_approval_count",
                "quorum", "days_late", "completion_ts", "issues"]
        with open(export, "w", encoding="utf-8", newline="") as f:
            w = csv.writer(f)
            w.writerow(cols)
            for t in pack.template:
                r = dict(results[t["milestone_id"]])
                r["duplicates"] = [f"{dup}>{kept}" for dup, kept in r["duplicates"]]
                r["assumption_flags"] = flags.get(t["milestone_id"], [])
                r["confidence_score"] = scores[t["milestone_id"]][0]
                w.writerow([";".join(map(str, v)) if isinstance(v, list) else v for v in (r[c] for c in cols)])
        print(f"\nĐã ghi {export}")
    return full == len(pack.decisions) and not invariants


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", type=Path, default=DEFAULT_DATA, help="Thư mục Data Pack")
    ap.add_argument("--export", type=Path, help="Ghi kết quả từng milestone ra CSV (để đối chiếu với engine của đội)")
    ap.add_argument("--check", action="store_true", help="Thoát mã 1 nếu lệch sample hoặc vi phạm bất biến")
    args = ap.parse_args()
    ok = report(Pack.load(args.data), args.export)
    if args.check and not ok:
        sys.exit(1)
