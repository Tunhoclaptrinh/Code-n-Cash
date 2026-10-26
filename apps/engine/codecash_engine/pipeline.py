"""Evaluation of one milestone: the orchestration of all stages.

Named ``pipeline`` so the module does not shadow the re-exported ``evaluate`` function.

Input: a Pack, a milestone id, and the optional sensitivity switches (defaults are the specification).
Output: one result dict with the decision and every fact behind it (key order is part of the contract).
Business rules: the nine-step pipeline of spec section 5 (BR-01..BR-20), one stage module per step:
structure (BR-15) -> events (BR-03, BR-16, BR-19) -> requirements (BR-04..BR-07, BR-20) ->
controls (BR-08..BR-10) -> schedule (BR-11, BR-12) -> rules (BR-02, BR-14) -> amounts (BR-12, BR-13) ->
trace (BR-17, sections 4 and 9).
"""
from decimal import ROUND_HALF_UP

from . import amounts, controls, events, requirements, rules, schedule, structure, trace
from .pack import PRIORITIES


def evaluate(pack, mid, *, literal_permissions=False, contract_scope_dispute=False,
             completion_includes_approval=False, rounding=ROUND_HALF_UP, enforce_invoice_flag=False,
             ignore_resolutions=False, as_of=None, voided=frozenset(), strict_resolution=False):
    """Return the decision and all facts of one milestone.

    The default arguments are the specification; the other flags exist only to measure sensitivity
    (section 12). as_of: as-of mode (BR-16). voided: event ids with an approved exception decision (BR-19).
    """
    m = pack.milestones[mid]
    parties = pack.parties
    contract, issues = structure.resolve_contract(pack.contracts, m)
    raw = events.up_to(pack.events_by_ms[mid], as_of)

    # BR-03, BR-15: deduplicate, then structural issues.
    uniq, dups = events.dedupe(raw)
    scope_rules = pack.rules_by_scope.get(m["release_rule_code"], [])
    config, structure_issues = structure.structural_issues(m, scope_rules, uniq, PRIORITIES)
    issues += structure_issues
    req, roles, approval_required, quorum = config["req"], config["roles"], config["approval_required"], config["quorum"]

    # BR-19: void eligible events with an approved exception decision; BR-15: anomalies.
    uniq, applied, notes = events.apply_voids(parties, contract, req, uniq, raw, voided, literal_permissions)
    anomalies = events.find_anomalies(parties, uniq)

    # BR-04..BR-07, BR-20: required events.
    valid_req, unauthorized, unrelated = requirements.classify_required(
        parties, contract, uniq, req, literal_permissions)
    missing = requirements.missing_events(
        req, valid_req, enforce_invoice_flag and m["invoice_required"] == "TRUE" and "INVOICE" not in req)
    completion_rate = requirements.completion_rate(req, missing)

    # BR-08: disputes. BR-09: rejections. BR-10: approvals and quorum.
    scope_events = controls.dispute_scope_events(pack, m, uniq, contract_scope_dispute, as_of)
    open_disputes = controls.open_disputes(scope_events, pack.event_by_id, parties, contract, m,
                                           ignore_resolutions, strict_resolution)
    rejections, rejection_anomalies = controls.valid_rejections(parties, contract, uniq)
    anomalies += rejection_anomalies
    approvals, valid_approval_count = controls.count_approvals(parties, contract, uniq, roles)

    # BR-11, BR-12: completion date and days late.
    completion_ts = schedule.completion_timestamp(valid_req, approvals, missing, completion_includes_approval)
    completion_date = schedule.completion_date(completion_ts)
    terms, terms_issues = schedule.parse_terms(m)
    issues += terms_issues
    days_late = schedule.days_late_after_grace(completion_date, terms["due"], terms["grace"])

    # BR-02, BR-14, BR-15: rule environment and first-match selection.
    env = rules.build_env(
        open_dispute=bool(open_disputes), rejection_count=len(rejections), unauthorized_count=len(unauthorized),
        completion_rate=completion_rate, approval_required=approval_required, approval_count=valid_approval_count,
        quorum=quorum, late_penalty_applicable=m["late_penalty_applicable"] == "TRUE",
        completion_date=completion_date, terms=terms, days_late=days_late,
        all_met=rules.all_conditions_met(completion_rate, len(unauthorized), approval_required,
                                         valid_approval_count, quorum))
    # BR-12, BR-13: amounts from the winning rule. BR-14: a rule that cannot be evaluated for this
    # milestone (e.g. a formula dividing by a zero parameter) holds it through ELSE, not the whole run.
    try:
        rule = rules.select_rule(scope_rules, env, issues, anomalies)
        penalty, payable = amounts.rule_amounts(rule, env, rounding)
    except (ArithmeticError, TypeError, ValueError, KeyError) as error:
        issues.append(f"không đánh giá được luật: {type(error).__name__} {error}")
        rule = rules.fallback_rule(scope_rules)
        penalty, payable = amounts.rule_amounts(rule, env, rounding)
    decision = rule["decision"] if rule else "HOLD"
    reason = rule["reason_code"] if rule else "UNRESOLVED_CONDITION"
    raw_penalty = amounts.raw_penalty(days_late, terms["rate"], terms["cap"], terms["planned"])

    # BR-17: evidence, condition tokens, status.
    evidence = trace.collect_evidence(valid_req, approvals, reason, open_disputes, rejections)
    met, miss = trace.condition_tokens(m["required_condition"], valid_req, valid_approval_count, bool(open_disputes))
    status = trace.milestone_status(reason, as_of, bool(raw), terms["due"])

    return {
        "milestone_id": mid, "contract_id": m["contract_id"], "decision": decision, "reason_code": reason,
        "rule_id": rule["rule_id"] if rule else "", "status": status, "payable": payable, "penalty": penalty,
        "raw_penalty": raw_penalty, "evidence": evidence,
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
    """Evaluate every milestone of the pack; keyword flags are passed to ``evaluate``."""
    return {mid: evaluate(pack, mid, **kw) for mid in pack.milestones}
