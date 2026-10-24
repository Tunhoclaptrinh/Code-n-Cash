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
import ast
import csv
import hashlib
import math
import operator
import sys
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta
from decimal import ROUND_HALF_EVEN, ROUND_HALF_UP, Decimal
from pathlib import Path

SPEC_VERSION = "1.1"
DEFAULT_DATA = Path(__file__).resolve().parent.parent / "BangD-Case4" / "DataPack-CASE4_SmartContractWorkflow"
SNAPSHOT = date(2026, 10, 18)
CENT = Decimal("0.01")

# Mục 4.2: loại required event -> loại bên được tạo.
AUTHORITY = {
    "CONTRACT_SIGNED": "BUYER", "KICKOFF_CONFIRMED": "BUYER", "REQUIREMENTS_APPROVED": "BUYER",
    "UAT_PASSED": "BUYER", "ACCEPTANCE": "BUYER",
    "DELIVERY": "SUPPLIER", "INVOICE": "SUPPLIER", "GO_LIVE": "SUPPLIER",
    "SERVICE_ACTIVATED": "SUPPLIER", "SERVICE_COMPLETED": "SUPPLIER", "WARRANTY_COMPLETED": "SUPPLIER",
}
# BR-05: trạng thái hợp lệ theo loại event.
VALID_STATUS = {t: "CONFIRMED" for t in AUTHORITY}
VALID_STATUS.update(APPROVAL="APPROVED", REJECTION="REJECTED", DISPUTE_OPENED="OPEN", DISPUTE_RESOLVED="RESOLVED")
SUPPORT_TYPES = {"APPROVAL", "REJECTION", "DISPUTE_OPENED", "DISPUTE_RESOLVED"}

# Mục 9.2: ánh xạ trạng thái milestone, đúng tên README mục 15.
STATUS = {
    "ALL_CONDITIONS_MET": "ELIGIBLE_FOR_PAYMENT", "LATE_COMPLETION": "PAID_WITH_PENALTY",
    "REJECTION_PRESENT": "REJECTED", "MISSING_REQUIRED_EVENT": "WAITING_EVIDENCE",
    "APPROVAL_QUORUM_NOT_MET": "WAITING_APPROVAL", "OPEN_DISPUTE": "ON_HOLD",
    "UNAUTHORIZED_EVENT": "ON_HOLD", "UNRESOLVED_CONDITION": "ON_HOLD",
}
DECISIONS = {"RELEASE", "HOLD", "REJECT", "PENALTY"}
PRIORITIES = [10, 20, 30, 40, 50, 60, 70, 80]


def read(base, rel):
    with open(base / rel, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


class Pack:
    """Dữ liệu đầu vào. Dựng từ thư mục Data Pack (load) hoặc từ danh sách dòng (dùng trong test)."""

    def __init__(self, contracts, parties, milestones, events, rules, decisions=(), template=(), base=None):
        self.base = base
        self.contracts = {r["contract_id"]: r for r in contracts}
        self.parties = {r["party_id"]: r for r in parties}
        self.milestones = {r["milestone_id"]: r for r in milestones}
        self.events = list(events)
        self.rules = list(rules)
        self.decisions = list(decisions)
        self.template = list(template)
        self.event_by_id = {e["event_id"]: e for e in self.events}
        self.events_by_ms = defaultdict(list)
        for e in self.events:
            self.events_by_ms[e["milestone_id"]].append(e)
        for lst in self.events_by_ms.values():
            lst.sort(key=lambda e: (e["event_timestamp"], e["event_id"]))
        self.rules_by_scope = defaultdict(list)
        for r in self.rules:
            if r["active"] == "TRUE":
                self.rules_by_scope[r["release_rule_code"]].append(r)
        for lst in self.rules_by_scope.values():
            lst.sort(key=lambda r: int(r["priority"]))

    @classmethod
    def load(cls, base):
        return cls(read(base, "01_data/contracts.csv"), read(base, "01_data/parties.csv"),
                   read(base, "01_data/milestones.csv"), read(base, "01_data/events.csv"),
                   read(base, "01_data/payment_rules.csv"), read(base, "03_labels_sample/decision_sample.csv"),
                   read(base, "04_output_templates/submission_output_template.csv"), base)


# ---------- Bộ đánh giá biểu thức rule (whitelist AST, không dùng eval) ----------

_CMP = {ast.Eq: operator.eq, ast.NotEq: operator.ne, ast.Lt: operator.lt,
        ast.LtE: operator.le, ast.Gt: operator.gt, ast.GtE: operator.ge}
_ARITH = {ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul, ast.Div: operator.truediv}


def _eval(node, env):
    if isinstance(node, ast.Expression):
        return _eval(node.body, env)
    if isinstance(node, ast.BoolOp) and isinstance(node.op, ast.And):
        return all(_eval(v, env) for v in node.values)
    if isinstance(node, ast.Compare) and len(node.ops) == 1:
        left, right = _eval(node.left, env), _eval(node.comparators[0], env)
        if left is None or right is None:
            return False
        return _CMP[type(node.ops[0])](left, right)
    if isinstance(node, ast.BinOp) and type(node.op) in _ARITH:
        left, right = _eval(node.left, env), _eval(node.right, env)
        if left is None or right is None:
            return None
        if isinstance(left, date) and isinstance(node.op, ast.Add):
            return left + timedelta(days=int(right))
        return _ARITH[type(node.op)](left, right)
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in ("MIN", "MAX"):
        args = [_eval(a, env) for a in node.args]
        return min(args) if node.func.id == "MIN" else max(args)
    if isinstance(node, ast.Name):
        if node.id in ("TRUE", "FALSE"):
            return node.id == "TRUE"
        return env[node.id]
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
        return Decimal(str(node.value))
    raise ValueError(f"Biểu thức không được hỗ trợ: {ast.dump(node)}")


def evaluate_expr(text, env):
    if text.strip() == "ELSE":
        return True
    return _eval(ast.parse(text.replace(" AND ", " and "), mode="eval"), env)


# ---------- Đánh giá một milestone theo đặc tả ----------

def evaluate(pack, mid, *, literal_permissions=False, contract_scope_dispute=False,
             completion_includes_approval=False, rounding=ROUND_HALF_UP, enforce_invoice_flag=False,
             ignore_resolutions=False, as_of=None, voided=frozenset(), strict_resolution=False):
    """Trả về quyết định và toàn bộ fact của một milestone.

    Tham số mặc định là đặc tả. Các cờ còn lại chỉ dùng để đo độ nhạy (mục 13).
    as_of: chế độ as-of (BR-16). voided: event_id đã có quyết định ngoại lệ được duyệt (BR-19).
    """
    m = pack.milestones[mid]
    parties = pack.parties
    issues, anomalies, notes = [], [], []
    c = pack.contracts.get(m["contract_id"])
    if c is None:
        issues.append("milestone trỏ tới hợp đồng không tồn tại")
        c = {"contract_id": m["contract_id"], "buyer_id": "", "supplier_id": ""}
    raw = pack.events_by_ms[mid]
    if as_of:
        raw = [e for e in raw if e["event_timestamp"] <= as_of]

    # BR-03: khử trùng lặp, giữ bản sớm nhất (đã sắp theo timestamp, event_id).
    seen, uniq, dups = {}, [], []
    for e in raw:
        key = (e["contract_id"], e["milestone_id"], e["event_type"], e["document_id"],
               e["actor_party_id"], e["event_status"], e["reference_event_id"])
        if e["document_id"] and key in seen:
            dups.append((e["event_id"], seen[key]))
            continue
        seen[key] = e["event_id"]
        uniq.append(e)

    # BR-15: lỗi cấu trúc.
    req = [t for t in m["required_event_types"].split(";") if t]
    roles = [r for r in m["required_approval_roles"].split(";") if r]
    approval_required = m["approval_required"] == "TRUE"
    try:
        quorum = int(m["required_approval_quorum"])
    except ValueError:
        issues.append("required_approval_quorum không đọc được")
        quorum = 0
    if not req:
        issues.append("required_event_types trống")
    if approval_required and quorum != len(roles):
        issues.append("quorum khác số vai trò bắt buộc")
    if not approval_required and quorum != 0:
        issues.append("approval_required=FALSE nhưng quorum > 0")
    scope_rules = pack.rules_by_scope.get(m["release_rule_code"], [])
    if [int(r["priority"]) for r in scope_rules] != PRIORITIES:
        issues.append("phạm vi rule không đủ 8 rule priority 10..80")
    for e in uniq:
        if e["contract_id"] != m["contract_id"]:
            issues.append(f"{e['event_id']}: contract_id lệch milestone")

    def party(e):
        return parties.get(e["actor_party_id"])

    def required_authorized(e):
        p = party(e)
        if p is None:
            return False
        if literal_permissions:
            return e["event_type"] in p["allowed_event_types"].split(";")
        needed = AUTHORITY.get(e["event_type"])
        if p["party_type"] != needed or p["status"] != "ACTIVE":
            return False
        return e["actor_party_id"] == (c["buyer_id"] if needed == "BUYER" else c["supplier_id"])

    def approver_of_contract(e):
        p = party(e)
        return (p is not None and p["party_type"] == "APPROVER" and p["status"] == "ACTIVE"
                and p["parent_party_id"] == c["buyer_id"] and p["can_approve_payment"] == "TRUE")

    def valid_rejection(e):
        return (e["event_status"] == "REJECTED" and approver_of_contract(e)
                and "REJECTION" in party(e)["allowed_event_types"].split(";"))

    # BR-19: chỉ event sai thẩm quyền hoặc bất thường mới được vô hiệu bằng quyết định ngoại lệ.
    def void_eligible(e):
        if party(e) is None or e["event_type"] not in VALID_STATUS:
            return True
        if e["event_type"] in req and not required_authorized(e):
            return True
        return e["event_type"] == "REJECTION" and not valid_rejection(e)

    applied = [e for e in uniq if e["event_id"] in voided and void_eligible(e)]
    refused = sorted({e["event_id"] for e in raw if e["event_id"] in voided} - {e["event_id"] for e in applied})
    if refused:
        notes.append("yêu cầu vô hiệu không hợp lệ, bị bỏ qua: " + ";".join(refused))
    uniq = [e for e in uniq if e not in applied]

    # BR-15: bất thường.
    for e in uniq:
        if party(e) is None:
            anomalies.append(f"{e['event_id']}: actor không tồn tại")
        if e["event_type"] not in VALID_STATUS:
            anomalies.append(f"{e['event_id']}: event_type lạ")

    # BR-04..BR-07, BR-20: required event hợp lệ / sai thẩm quyền / không liên quan.
    valid_req, unauthorized, unrelated = {}, [], []
    for e in uniq:
        if e["event_type"] in req:
            if not required_authorized(e):
                unauthorized.append(e)
            elif e["event_status"] == VALID_STATUS[e["event_type"]]:
                valid_req.setdefault(e["event_type"], e)
        elif e["event_type"] not in SUPPORT_TYPES:
            unrelated.append(e)
    missing = [t for t in req if t not in valid_req]
    if enforce_invoice_flag and m["invoice_required"] == "TRUE" and "INVOICE" not in req:
        missing.append("INVOICE")
    completion_rate = Decimal(len(req) - len(missing)) / Decimal(len(req)) if req else Decimal(0)

    # BR-08: tranh chấp. Mở thì dễ (mọi DISPUTE_OPENED), đóng thì khó (resolve phải hợp lệ).
    def valid_resolution(r):
        o = pack.event_by_id.get(r["reference_event_id"])
        p = party(r)
        buyer_side = p is not None and (r["actor_party_id"] == c["buyer_id"] or (
            p["party_type"] == "APPROVER" and p["parent_party_id"] == c["buyer_id"]
            and "DISPUTE" in p["allowed_event_types"].split(";")))
        return (o is not None and o["event_type"] == "DISPUTE_OPENED" and o["milestone_id"] == r["milestone_id"]
                and o["contract_id"] == r["contract_id"] == m["contract_id"]
                and r["event_status"] == "RESOLVED" and r["event_timestamp"] >= o["event_timestamp"]
                and (not strict_resolution or (buyer_side and p["status"] == "ACTIVE")))

    scope_events = uniq
    if contract_scope_dispute:
        scope_events = [e for ms in pack.milestones.values() if ms["contract_id"] == m["contract_id"]
                        for e in pack.events_by_ms[ms["milestone_id"]] if not as_of or e["event_timestamp"] <= as_of]
    closed = set() if ignore_resolutions else {
        r["reference_event_id"] for r in scope_events if r["event_type"] == "DISPUTE_RESOLVED" and valid_resolution(r)}
    open_disputes = [e for e in scope_events if e["event_type"] == "DISPUTE_OPENED" and e["event_id"] not in closed]

    # BR-09: rejection. Không phụ thuộc required_approval_roles (SC015).
    rejections = [e for e in uniq if e["event_type"] == "REJECTION" and valid_rejection(e)]
    anomalies += [f"{e['event_id']}: REJECTION không hợp lệ" for e in uniq
                  if e["event_type"] == "REJECTION" and not valid_rejection(e)]

    # BR-10: approval — mỗi approver một lần, đếm số vai trò bắt buộc được phủ.
    approvals = {}
    for e in uniq:
        if (e["event_type"] == "APPROVAL" and e["event_status"] == "APPROVED" and approver_of_contract(e)
                and party(e)["approval_role"] in roles):
            approvals.setdefault(e["actor_party_id"], e)
    valid_approval_count = len({parties[a]["approval_role"] for a in approvals})

    # BR-11: thời điểm hoàn thành = muộn nhất trong các required event hợp lệ (bản sớm nhất mỗi loại).
    completion_ts = None
    if not missing and valid_req:
        stamps = [e["event_timestamp"] for e in valid_req.values()]
        if completion_includes_approval:
            stamps += [e["event_timestamp"] for e in approvals.values()]
        completion_ts = max(stamps)
    completion_date = datetime.fromisoformat(completion_ts).date() if completion_ts else None
    try:
        due = date.fromisoformat(m["due_date"])
        grace = int(m["grace_period_days"])
        rate, cap = Decimal(m["penalty_rate_pct_per_day"]), Decimal(m["max_penalty_pct"])
        planned = Decimal(m["planned_payment_vnd_mn"])
    except (ValueError, ArithmeticError):
        issues.append("tham số ngày/tiền của milestone không đọc được")
        due, grace, rate, cap, planned = None, 0, Decimal(0), Decimal(0), Decimal(0)
    days_late = max(0, (completion_date - (due + timedelta(days=grace))).days) if completion_date and due else 0

    all_met = completion_rate == 1 and not unauthorized and (not approval_required or valid_approval_count >= quorum)
    env = {
        "open_dispute": bool(open_disputes),
        "valid_rejection_event_count": Decimal(len(rejections)),
        "unauthorized_required_event_count": Decimal(len(unauthorized)),
        "required_event_completion_rate": completion_rate,
        "approval_required": approval_required,
        "valid_approval_count": Decimal(valid_approval_count),
        "required_approval_quorum": Decimal(quorum),
        "late_penalty_applicable": m["late_penalty_applicable"] == "TRUE",
        "actual_completion_date": completion_date,
        "due_date": due,
        "grace_period_days": Decimal(grace),
        "all_required_conditions_met": all_met,
        "days_late_after_grace": Decimal(days_late),
        "penalty_rate_pct_per_day": rate,
        "max_penalty_pct": cap,
        "planned_payment_vnd_mn": planned,
    }

    # BR-02: first-match; BR-15: lỗi cấu trúc -> rule 80, bất thường chỉ hạ lệnh trả tiền xuống rule 80.
    fallback = next((r for r in scope_rules if r["condition_expression"].strip() == "ELSE"), None)
    if issues:
        rule = fallback
    else:
        rule = next(r for r in scope_rules if evaluate_expr(r["condition_expression"], env))
        if anomalies and rule["decision"] in ("RELEASE", "PENALTY"):
            rule = fallback
    decision = rule["decision"] if rule else "HOLD"
    reason = rule["reason_code"] if rule else "UNRESOLVED_CONDITION"

    # BR-12, BR-13: tiền theo công thức của rule thắng, Decimal + ROUND_HALF_UP.
    if rule:
        penalty = Decimal(evaluate_expr(rule["penalty_amount_formula"], env)).quantize(CENT, rounding=rounding)
        env["penalty_amount_vnd_mn"] = penalty
        payable = Decimal(evaluate_expr(rule["payable_amount_formula"], env)).quantize(CENT, rounding=rounding)
    else:
        penalty = payable = Decimal("0.00")
    raw_penalty = min(Decimal(days_late) * rate / 100 * planned, cap / 100 * planned)

    # BR-17: bằng chứng.
    evidence = [e["event_id"] for e in valid_req.values()] + [e["event_id"] for e in approvals.values()]
    if reason == "OPEN_DISPUTE":
        evidence += [e["event_id"] for e in open_disputes]
    if reason == "REJECTION_PRESENT":
        evidence += [e["event_id"] for e in rejections]

    # Mục 14.3: token điều kiện theo DSL required_condition của BTC.
    met, miss = [], []
    for token in m["required_condition"].split(" AND "):
        kind, _, arg = token.partition(":")
        ok = {"EVENT": lambda: arg in valid_req,
              "APPROVAL_QUORUM": lambda: valid_approval_count >= int(arg),
              "NO_OPEN_DISPUTE": lambda: not open_disputes}.get(kind, lambda: False)()
        (met if ok else miss).append(token)

    # Mục 9.2 / 9.4: trạng thái; PLANNED và IN_PROGRESS chỉ có ở chế độ as-of.
    status = STATUS[reason]
    if as_of and reason == "MISSING_REQUIRED_EVENT":
        if not raw:
            status = "PLANNED"
        elif due and date.fromisoformat(as_of[:10]) <= due:
            status = "IN_PROGRESS"

    return {
        "milestone_id": mid, "contract_id": m["contract_id"], "decision": decision, "reason_code": reason,
        "rule_id": rule["rule_id"] if rule else "", "status": status, "payable": payable, "penalty": penalty,
        "raw_penalty": raw_penalty, "evidence": sorted(set(evidence)),
        "required_event_count": len(req), "valid_required_event_count": len(req) - len(missing),
        "missing": missing, "unauthorized": [e["event_id"] for e in unauthorized], "duplicates": dups,
        "unrelated": [e["event_id"] for e in unrelated], "voided": [e["event_id"] for e in applied],
        "open_dispute": bool(open_disputes), "open_dispute_ids": [e["event_id"] for e in open_disputes],
        "valid_rejection_count": len(rejections), "approval_required": approval_required,
        "valid_approval_count": valid_approval_count, "quorum": quorum, "days_late": days_late,
        "completion_ts": completion_ts, "conditions_met": met, "missing_conditions": miss,
        "issues": issues + anomalies, "notes": notes,
    }


def evaluate_all(pack, **kw):
    return {mid: evaluate(pack, mid, **kw) for mid in pack.milestones}


# ---------- Bất biến đầu ra (mục 14.6) ----------

def check_invariants(pack, results):
    """Trả về danh sách vi phạm; rỗng nghĩa là đạt."""
    bad = []
    rule_by_id = {r["rule_id"]: r for r in pack.rules}
    for mid, m in pack.milestones.items():
        r = results.get(mid)
        if r is None:
            bad.append(f"{mid}: không có kết quả")
            continue
        P = Decimal(m["planned_payment_vnd_mn"])
        if r["decision"] not in DECISIONS or r["reason_code"] not in STATUS:
            bad.append(f"{mid}: decision/reason ngoài miền giá trị")
        if r["status"] != STATUS[r["reason_code"]]:
            bad.append(f"{mid}: trạng thái không khớp ánh xạ 9.2")
        rule = rule_by_id.get(r["rule_id"])
        if rule is None or rule["release_rule_code"] != m["release_rule_code"] \
                or (rule["decision"], rule["reason_code"]) != (r["decision"], r["reason_code"]):
            bad.append(f"{mid}: rule_id không thuộc phạm vi hoặc không khớp quyết định")
        amounts = {"RELEASE": (P, Decimal(0)), "HOLD": (Decimal(0), Decimal(0)), "REJECT": (Decimal(0), Decimal(0))}
        if r["decision"] in amounts and (r["payable"], r["penalty"]) != amounts[r["decision"]]:
            bad.append(f"{mid}: số tiền sai với {r['decision']}")
        if r["decision"] == "PENALTY" and not (r["penalty"] > 0 and r["payable"] == max(Decimal(0), P - r["penalty"])):
            bad.append(f"{mid}: PENALTY không đối soát được")
        if r["decision"] in ("RELEASE", "PENALTY"):  # chống unauthorized payment
            if r["missing_conditions"] or r["unauthorized"] or r["valid_rejection_count"] or r["open_dispute"] or r["issues"]:
                bad.append(f"{mid}: trả tiền khi chưa đủ điều kiện")
        own = {e["event_id"] for e in pack.events_by_ms[mid]}
        excluded = {d for d, _ in r["duplicates"]} | set(r["unauthorized"])
        if not set(r["evidence"]) <= own or set(r["evidence"]) & excluded:
            bad.append(f"{mid}: evidence ngoài mốc hoặc chứa bản lặp/event sai quyền")
        if sorted(r["conditions_met"] + r["missing_conditions"]) != sorted(m["required_condition"].split(" AND ")):
            bad.append(f"{mid}: token điều kiện không phủ đủ required_condition")
    return bad


def compare_samples(pack, results):
    """So 17 cột của decision_sample.csv. Trả về (số sample khớp hoàn toàn, danh sách lệch)."""
    fields = [("expected_decision", "decision", str), ("reason_code", "reason_code", str),
              ("payable_amount_vnd_mn", "payable", Decimal), ("penalty_amount_vnd_mn", "penalty", Decimal),
              ("required_event_count", "required_event_count", int),
              ("valid_required_event_count", "valid_required_event_count", int),
              ("unauthorized_required_event_count", None, int), ("duplicate_event_count", None, int),
              ("open_dispute", "open_dispute", lambda v: v == "TRUE"), ("valid_rejection_count", "valid_rejection_count", int),
              ("approval_required", "approval_required", lambda v: v == "TRUE"),
              ("valid_approval_count", "valid_approval_count", int), ("required_approval_quorum", "quorum", int),
              ("days_late_after_grace", "days_late", int)]
    full, mismatches = 0, []
    for d in pack.decisions:
        r = results[d["milestone_id"]]
        got = dict(r, unauthorized_required_event_count=len(r["unauthorized"]), duplicate_event_count=len(r["duplicates"]))
        bad = [f"{col}: {d[col]} vs {got[key or col]}" for col, key, conv in fields if conv(d[col]) != got[key or col]]
        if Decimal(d["planned_payment_vnd_mn"]) != Decimal(pack.milestones[d["milestone_id"]]["planned_payment_vnd_mn"]):
            bad.append("planned_payment_vnd_mn")
        if sorted(filter(None, d["evidence_event_ids"].split(";"))) != r["evidence"]:
            bad.append(f"evidence: {d['evidence_event_ids']} vs {';'.join(r['evidence'])}")
        if d["missing_required_events"] != ";".join(r["missing"]):
            bad.append(f"missing_required_events: {d['missing_required_events']} vs {';'.join(r['missing'])}")
        if bad:
            mismatches.append((d["scenario_id"], d["milestone_id"], bad))
        else:
            full += 1
    return full, mismatches


def assumption_flags(pack, results):
    """Mốc có kết quả có thể đổi nếu BTC trả lời khác một giả định Mở (A05, A07, A08)."""
    M = pack.milestones
    open_c = {M[k]["contract_id"] for k, r in results.items() if r["open_dispute"]}
    flags = defaultdict(list)
    for k, r in results.items():
        paid = r["decision"] in ("RELEASE", "PENALTY")
        if paid and M[k]["contract_id"] in open_c:
            flags[k].append("A05")
        if r["decision"] == "PENALTY" and r["raw_penalty"].quantize(CENT, ROUND_HALF_UP) != r["raw_penalty"].quantize(CENT, ROUND_HALF_EVEN):
            flags[k].append("A07")
        if paid and M[k]["invoice_required"] == "TRUE" and "INVOICE" not in M[k]["required_event_types"].split(";"):
            flags[k].append("A08")
    return flags


def confidence_score(result, flags):
    """Mục 14.2: thang chắc chắn của đội, không phải xác suất."""
    if result["issues"]:
        return "0.50"
    return "0.80" if flags else "1.00"


# ---------- Báo cáo ----------

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

    h("9. Mốc phụ thuộc giả định Mở (confidence_score, mục 14.2)")
    flags = assumption_flags(pack, results)
    print("số mốc bị gắn cờ:", len(flags), "| theo giả định:", dict(Counter(a for v in flags.values() for a in v)),
          "| gắn >1 cờ:", sum(1 for v in flags.values() if len(v) > 1))
    print("confidence_score:", dict(Counter(confidence_score(results[k], flags.get(k)) for k in M)))
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
                r["confidence_score"] = confidence_score(r, r["assumption_flags"])
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
