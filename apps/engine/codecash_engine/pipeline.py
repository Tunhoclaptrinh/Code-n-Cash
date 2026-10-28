"""Evaluation of one milestone: the orchestration of all stages under a policy.

Named ``pipeline`` so the module does not shadow the re-exported ``evaluate`` function.

Input: a Pack, a milestone id, the policy (default: the Case 4 policy), a run profile and switches.
Output: one result dict with the decision and every fact behind it (key order is part of the contract).
Business rules: the pipeline of spec section 5 (BR-01..BR-20), one stage module per step:
structure (BR-15) -> events (BR-03, BR-04, BR-05, BR-16, BR-19) -> requirements (BR-04..BR-07, BR-20) ->
controls (BR-08..BR-10) -> schedule (BR-11, BR-12) -> bindings + rules (BR-02, BR-14, payment guard) ->
amounts (BR-12, BR-13, amount guard) -> trace (BR-17, sections 9.2 and 14.3).
"""
from . import amounts, bindings, controls, events, requirements, rules, schedule, sequence, structure, trace
from .policy import load_policy

# Keyword switches kept for the sensitivity analysis (spec section 12); each names a switch of the policy.
SWITCH_FLAGS = ("literal_permissions", "contract_scope_dispute", "completion_includes_approval",
                "enforce_invoice_flag", "ignore_resolutions", "strict_resolution")


def resolve_policy(policy=None, profile=None, switches=(), rounding=None, **flags):
    """The compiled policy for a run: the base policy, the profile's switches, extra switches and flags."""
    base = policy or load_policy()
    names = set(switches)
    if profile:
        if profile not in base.profiles:
            raise ValueError(f"UNKNOWN_PROFILE {profile}")
        names |= set(base.profiles[profile])
    names |= {flag for flag in SWITCH_FLAGS if flags.get(flag)}
    return base.variant(names, rounding)


def evaluate(pack, mid, *, literal_permissions=False, contract_scope_dispute=False,
             completion_includes_approval=False, rounding=None, enforce_invoice_flag=False,
             ignore_resolutions=False, as_of=None, voided=frozenset(), strict_resolution=False,
             policy=None, profile=None, switches=(), explain=False):
    """Return the decision and all facts of one milestone.

    The defaults are the specification. The boolean flags and ``switches`` name switches of the policy
    (readings of the brief) and exist to measure sensitivity (section 12); ``profile`` names a run profile
    of the policy (BTC_SUBMISSION, WORKFLOW). as_of: as-of mode (BR-16). voided: event ids with an approved
    exception decision (BR-19). explain: also return ``explanation`` (rule variables and the outcome of every
    rule, BR-17).
    """
    policy = resolve_policy(policy, profile, switches, rounding, literal_permissions=literal_permissions,
                            contract_scope_dispute=contract_scope_dispute,
                            completion_includes_approval=completion_includes_approval,
                            enforce_invoice_flag=enforce_invoice_flag, ignore_resolutions=ignore_resolutions,
                            strict_resolution=strict_resolution)
    m = pack.milestones[mid]
    parties = pack.parties
    contract, issues = structure.resolve_contract(pack.contracts, m)
    raw = events.up_to(pack.events_by_ms[mid], as_of)

    # BR-03, BR-15: deduplicate, then structural issues.
    uniq, dups = events.dedupe(raw, policy)
    scope_rules = pack.rules_by_scope.get(m["release_rule_code"], [])
    config, structure_issues = structure.structural_issues(m, scope_rules, uniq, policy, contract)
    issues += structure_issues
    req, approval_required, quorum = config["req"], config["approval_required"], config["quorum"]

    # BR-04, BR-05: one verdict per event. BR-19: void what the policy calls voidable. BR-15: anomalies.
    verdicts = events.classify_all(policy, parties, contract, m, req, uniq)
    verdicts, applied, notes = events.apply_voids(policy, verdicts, raw, voided)
    anomalies = events.find_anomalies(policy, verdicts)
    kept = [v.event for v in verdicts]

    # BR-04..BR-07, BR-20: required events.
    valid_req, unauthorized, unrelated = requirements.classify_required(verdicts)
    missing = requirements.missing_events(req, valid_req)
    completion_rate = requirements.completion_rate(req, missing)

    # BR-11, BR-12: milestone and contract cells.
    bound, bound_issues = bindings.bind(policy, m, contract)
    issues += bound_issues

    # BR-08: disputes. BR-09: rejections. BR-10: approvals within the approver's limit, and quorum.
    scope_events = controls.dispute_scope_events(pack, m, kept, policy, as_of)
    open_disputes = controls.open_disputes(policy, scope_events, pack.event_by_id, parties, contract, m)
    rejections = controls.valid_rejections(verdicts)
    approvals, valid_approval_count, over_limit = controls.count_approvals(
        policy, verdicts, None if bound_issues else bound.get("planned_payment_vnd_mn"))

    # BR-11, BR-12: completion date and days late.
    completion_ts = schedule.completion_timestamp(valid_req, approvals, missing, policy.completion_categories)
    completion_date = schedule.completion_date(completion_ts)
    days_late = schedule.days_late_after_grace(completion_date, bound.get("due_date"), bound.get("grace_period_days"))

    # Sequence checks: warnings for a reviewer, never a change of decision.
    resolutions = [v.event for v in verdicts if v.category == "DISPUTE_RESOLVE"]
    warnings = sequence.sequence_warnings(kept, valid_req, approvals, resolutions, completion_ts, contract)
    warnings += [f"{event_id}: APPROVAL_OVER_LIMIT" for event_id in over_limit]

    # BR-02, BR-14, BR-15: rule environment, first-match selection and the payment guard.
    facts = {"open_dispute": bool(open_disputes), "valid_rejection_event_count": len(rejections),
             "unauthorized_required_event_count": len(unauthorized),
             "required_event_completion_rate": completion_rate, "valid_approval_count": valid_approval_count,
             "actual_completion_date": completion_date, "days_late_after_grace": days_late}
    env = rules.build_env(policy, config, bound, facts)
    selection = rules.select_rule(scope_rules, env, issues, anomalies, policy)
    fallback = rules.fallback_rule(scope_rules, policy)
    issues += selection.issues

    # BR-12, BR-13: amounts from the winning rule, then the amount guard of the policy.
    raw_penalty = amounts.reference_penalty(policy, env)

    def settle(chosen):
        """(penalty, payable, failed checks, mode) of a rule; a formula error or a failed check pays nothing."""
        if chosen is None:
            return amounts.ZERO_AMOUNT, amounts.ZERO_AMOUNT, [], None
        try:
            penalty, payable = amounts.rule_amounts(chosen, env, policy=policy)
        except amounts.ExpressionError as error:
            return amounts.ZERO_AMOUNT, amounts.ZERO_AMOUNT, [f"{rules.RULE_ERROR}: {chosen['rule_id']} {error.code}"], \
                rules.RULE_ERROR_FALLBACK
        failed = amounts.failed_checks(policy, chosen["decision"], amounts.amount_env(env, penalty, payable, raw_penalty))
        return penalty, payable, [f"{chosen['rule_id']}: số tiền không đạt kiểm tra: {text}" for text in failed], \
            rules.AMOUNT_GUARD_FALLBACK

    rule = selection.rule
    penalty, payable, failed, mode = settle(rule)
    if failed:
        # The winning rule's formulas cannot be evaluated or break the policy: hold through the fallback; if
        # even the fallback fails, nothing is paid. Either way the run reports a defective rule (checks.py).
        issues += failed
        selection.mode = mode
        selection.set_aside[rule["rule_id"]] = "FAILED" if mode == rules.RULE_ERROR_FALLBACK else "SET_ASIDE"
        if rule is not fallback:
            rule = fallback
            penalty, payable, failed, _ = settle(rule)
            issues += failed
        if failed:
            penalty, payable = amounts.ZERO_AMOUNT, amounts.ZERO_AMOUNT
    decision = rule["decision"] if rule else policy.fallback_decision
    reason = rule["reason_code"] if rule else policy.fallback_reason

    # BR-17: evidence, condition tokens, status.
    evidence = trace.collect_evidence(policy, reason, {
        "VALID_REQUIRED": valid_req.values(), "COUNTED_APPROVALS": approvals.values(),
        "OPEN_DISPUTES": open_disputes, "REJECTIONS": rejections})
    met, miss = trace.condition_tokens(policy, m["required_condition"], valid_req, valid_approval_count,
                                       bool(open_disputes))
    status = trace.milestone_status(policy, reason, as_of, bool(raw), bound.get("due_date"))

    selection.rule = rule
    result = {
        "milestone_id": mid, "contract_id": m["contract_id"], "decision": decision, "reason_code": reason,
        "rule_id": rule["rule_id"] if rule else "", "status": status, "payable": payable, "penalty": penalty,
        "raw_penalty": raw_penalty if raw_penalty is not None else amounts.ZERO_AMOUNT, "evidence": evidence,
        "required_event_count": len(req), "valid_required_event_count": len(req) - len(missing),
        "missing": missing, "unauthorized": [e["event_id"] for e in unauthorized], "duplicates": dups,
        "unrelated": [e["event_id"] for e in unrelated], "voided": [v.event["event_id"] for v in applied],
        "open_dispute": bool(open_disputes), "open_dispute_ids": [e["event_id"] for e in open_disputes],
        "valid_rejection_count": len(rejections), "approval_required": approval_required,
        "valid_approval_count": valid_approval_count, "quorum": quorum, "days_late": days_late,
        "completion_ts": completion_ts, "conditions_met": met, "missing_conditions": miss,
        "issues": issues + anomalies, "notes": notes, "warnings": warnings, "selection": selection.mode,
    }
    if explain:
        result["explanation"] = {"variables": rules.plain_variables(env),
                                 "trail": rules.rule_trail(scope_rules, selection)}
    return result


def evaluate_all(pack, **kw):
    """Evaluate every milestone of the pack; keyword arguments are passed to ``evaluate``."""
    return {mid: evaluate(pack, mid, **kw) for mid in pack.milestones}
