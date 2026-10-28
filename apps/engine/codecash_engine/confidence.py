"""Readings of the brief, assumption flags and confidence score.

Input: the evaluated results of a Data Pack, the Pack, the evaluate function and the run profile.
Output: per milestone the Open readings (spec section 12) that change its outcome, the assumption flags
(readings marked ``flag`` that change a paid milestone) and a confidence score in [0, 1] with the factors
that lowered it.
Business rule: spec section 8 and the organiser's answer on confidence: the score is the team's own
measure of how certain a decision is, it never changes the decision.

The score is robustness times evidence quality, with every weight read from the policy:
- robustness: each reading the organiser has not settled is evaluated again through its policy switch;
  when it gives another decision, reason or amount, the score loses that reading's weight;
- quality: data issues, duplicates, unrelated events and a completion right at the lateness boundary each
  lower the score, because a person would want to look at those records before paying.
"""
from collections import defaultdict
from datetime import date, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal

from .pipeline import resolve_policy
from .policy import load_policy

CENT = Decimal("0.01")
# Run profile arguments that select the policy; the others (as_of, voided) are passed through unchanged.
POLICY_ARGS = ("policy", "profile", "switches", "rounding", "literal_permissions", "contract_scope_dispute",
               "completion_includes_approval", "enforce_invoice_flag", "ignore_resolutions", "strict_resolution")


def _outcome(result):
    return result["decision"], result["reason_code"], result["payable"], result["penalty"]


def _candidates(pack, results, reading):
    """Milestones a reading can affect at all, so only those are evaluated again."""
    rule = reading.candidates
    mids = list(results)
    if "contract_has_event_types" in rule:
        types = set(rule["contract_has_event_types"])
        contracts = {e["contract_id"] for e in pack.events if e["event_type"] in types}
        mids = [mid for mid in mids if pack.milestones[mid]["contract_id"] in contracts]
    if "milestone_has_event_types" in rule:
        types = set(rule["milestone_has_event_types"])
        mids = [mid for mid in mids if any(e["event_type"] in types for e in pack.events_by_ms[mid])]
    if "decisions" in rule:
        mids = [mid for mid in mids if results[mid]["decision"] in rule["decisions"]]
    if "milestone" in rule:
        mids = [mid for mid in mids if rule["milestone"](
            {"milestone": pack.milestones[mid], "contract": pack.contracts.get(pack.milestones[mid]["contract_id"])})]
    return mids


def reading_changes(pack, results, evaluate, **profile):
    """Readings (in policy order) that change the outcome of each milestone under the run ``profile``."""
    policy = resolve_policy(**{k: v for k, v in profile.items() if k in POLICY_ARGS})
    changed = defaultdict(list)
    for code, reading in policy.base.readings.items():
        if policy.variant([reading.switch]).hash == policy.hash:
            continue  # the profile already reads the brief this way
        switches = tuple(profile.get("switches", ())) + (reading.switch,)
        for mid in _candidates(pack, results, reading):
            if _outcome(evaluate(pack, mid, **{**profile, "switches": switches})) != _outcome(results[mid]):
                changed[mid].append(code)
    return changed


def assumption_flags(pack, results, evaluate=None, changes=None, **profile):
    """Paid milestones whose outcome changes under a flagged Open reading (A05, A07, A08 in the Case 4 policy)."""
    policy = resolve_policy(**{k: v for k, v in profile.items() if k in POLICY_ARGS})
    if changes is None:
        from .pipeline import evaluate as default_evaluate
        changes = reading_changes(pack, results, evaluate or default_evaluate, **profile)
    flags = defaultdict(list)
    for mid, codes in changes.items():
        if policy.pays(results[mid]["decision"]):
            flags[mid] = [c for c in codes if policy.base.readings[c].flag]
            if not flags[mid]:
                del flags[mid]
    return flags


def at_lateness_boundary(result, milestone, days=1):
    """Completion within ``days`` of due date + grace on a milestone with a late penalty."""
    if not result["completion_ts"] or milestone.get("late_penalty_applicable") != "TRUE":
        return False
    try:
        limit = date.fromisoformat(milestone["due_date"]) + timedelta(days=int(milestone["grace_period_days"]))
    except (KeyError, ValueError):
        return False
    return abs((datetime.fromisoformat(result["completion_ts"]).date() - limit).days) <= days


def confidence_score(result, changed_by=(), milestone=None, policy=None):
    """Score string with two decimals and the factors behind it; never touches the decision."""
    policy = policy or load_policy()
    weights = policy.base.readings
    c = policy.confidence
    factors = list(changed_by)
    score = Decimal(1) - sum((weights[code].weight for code in changed_by), Decimal(0))
    if result["issues"]:
        factors.append("DATA_ISSUE")
        score = min(score, c["issue_cap"])
    duplicates = min(len(result["duplicates"]), c["duplicate_limit"])
    if duplicates:
        factors.append("DUPLICATE")
        score *= c["duplicate_factor"] ** duplicates
    if result["unrelated"]:
        factors.append("UNRELATED_EVENT")
        score *= c["unrelated_factor"]
    if milestone is not None and at_lateness_boundary(result, milestone, c["boundary_days"]):
        factors.append("LATENESS_BOUNDARY")
        score *= c["boundary_factor"]
    score = max(Decimal(0), min(Decimal(1), score)).quantize(CENT, ROUND_HALF_UP)
    return str(score), factors


def confidence_scores(pack, results, evaluate, changes=None, **profile):
    """Confidence of every milestone. ``profile`` holds the arguments the results were evaluated with."""
    policy = resolve_policy(**{k: v for k, v in profile.items() if k in POLICY_ARGS})
    if changes is None:
        changes = reading_changes(pack, results, evaluate, **profile)
    return {mid: confidence_score(result, changes.get(mid, ()), pack.milestones[mid], policy)
            for mid, result in results.items()}
