"""Output invariants and sample comparison.

Input: a Pack, the results of ``evaluate_all`` and the policy the results were evaluated with.
Output: a list of invariant violations (empty means pass), and the match count and mismatch list against
the 20 labelled samples of ``decision_sample.csv``.
Business rules: spec section 9 (output invariants: no payment before all conditions hold, amounts that
follow the policy's amount contract of each decision, evidence only from the milestone, no rule that a
safety check had to stop) and BR-17
(evidence reconciles with the sample labels). The amount checks are evaluated on the milestone and contract
cells parsed again here, not on the engine's own environment.
"""
from decimal import Decimal

from . import bindings
from .expressions import ExpressionError
from .rules import SAFETY_INTERVENTIONS
from .policy import load_policy


def check_invariants(pack, results, policy=None):
    """Return the violations of the section 9 invariants; an empty list means the results pass."""
    policy = policy or load_policy()
    bad = []
    rule_by_id = {r["rule_id"]: r for r in pack.rules}
    for mid, m in pack.milestones.items():
        r = results.get(mid)
        if r is None:
            bad.append(f"{mid}: không có kết quả")
            continue
        if r["decision"] not in policy.decisions or r["reason_code"] not in policy.reasons:
            bad.append(f"{mid}: decision/reason ngoài miền giá trị")
            continue
        if r["status"] != policy.status_for(r["reason_code"]):
            bad.append(f"{mid}: trạng thái không khớp ánh xạ 9.2")
        if r.get("selection") in SAFETY_INTERVENTIONS:
            # The milestone is held safely, but a rule of the table could not be applied: report the defect.
            bad.append(f"{mid}: chốt an toàn phải giữ mốc ({r['selection']}): {'; '.join(r['issues'])}")
        rule = rule_by_id.get(r["rule_id"])
        if rule is None or rule["release_rule_code"] != m["release_rule_code"] \
                or (rule["decision"], rule["reason_code"]) != (r["decision"], r["reason_code"]):
            bad.append(f"{mid}: rule_id không thuộc phạm vi hoặc không khớp quyết định")
        if not all(value.is_finite() and value >= 0 for value in (r["payable"], r["penalty"])):
            bad.append(f"{mid}: số tiền không hữu hạn hoặc âm")
            continue
        bound, _ = bindings.bind(policy, m, pack.contracts.get(m["contract_id"]))
        values = {**bound, "payable_amount_vnd_mn": r["payable"], "penalty_amount_vnd_mn": r["penalty"],
                  "reference_penalty_vnd_mn": r["raw_penalty"]}
        for text, fn in policy.amount_guards + policy.decisions[r["decision"]]["amounts"]:
            try:
                ok = fn(values)
            except ExpressionError:
                ok = False
            if ok is not True:
                bad.append(f"{mid}: số tiền sai với {r['decision']}: {text}")
        if policy.pays(r["decision"]):  # guard against unauthorized payment
            if r["missing_conditions"] or r["unauthorized"] or r["valid_rejection_count"] or r["open_dispute"] or r["issues"]:
                bad.append(f"{mid}: trả tiền khi chưa đủ điều kiện")
        own = {e["event_id"] for e in pack.events_by_ms[mid]}
        excluded = {d for d, _ in r["duplicates"]} | set(r["unauthorized"])
        if not set(r["evidence"]) <= own or set(r["evidence"]) & excluded:
            bad.append(f"{mid}: evidence ngoài mốc hoặc chứa bản lặp/event sai quyền")
        tokens = m["required_condition"].split(policy.token_separator)
        if sorted(r["conditions_met"] + r["missing_conditions"]) != sorted(tokens):
            bad.append(f"{mid}: token điều kiện không phủ đủ required_condition")
    return bad


def compare_samples(pack, results):
    """Compare the 17 columns of decision_sample.csv. Return (fully matching samples, mismatches)."""
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
