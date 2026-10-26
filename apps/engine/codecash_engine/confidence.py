"""Assumption flags and confidence score.

Input: the evaluated results of a Data Pack (and the Pack for milestone attributes).
Output: per-milestone flags naming the Open assumptions (A05, A07, A08) that could change the result,
and a confidence score in [0, 1] with the factors that lowered it.
Business rule: spec section 8 and the organiser's answer on confidence: the score is the team's own
measure of how certain a decision is, it never changes the decision.

The score is robustness times evidence quality:
- robustness: each reading of the brief that the organiser has not settled is evaluated as well; when
  it would give another decision or amount, the score loses that reading's weight;
- quality: data issues, duplicates, unrelated events and a completion right at the lateness boundary
  each lower the score, because a person would want to look at those records before paying.
"""
from collections import defaultdict
from datetime import date, datetime, timedelta
from decimal import ROUND_HALF_EVEN, ROUND_HALF_UP, Decimal

from .pack import CENT

# Open readings (spec section 12): weight lost when the reading changes the outcome, and the switches
# that evaluate it. Settled readings (A02, A03, A09, ...) do not lower the score.
READINGS = {
    "A05": (Decimal("0.20"), dict(contract_scope_dispute=True)),
    "A06": (Decimal("0.10"), dict(strict_resolution=True)),
    "A07": (Decimal("0.05"), dict(rounding=ROUND_HALF_EVEN)),
    "A08": (Decimal("0.20"), dict(enforce_invoice_flag=True)),
}
ISSUE_CAP = Decimal("0.50")
DUPLICATE_FACTOR = Decimal("0.97")
UNRELATED_FACTOR = Decimal("0.97")
BOUNDARY_FACTOR = Decimal("0.95")


def assumption_flags(pack, results):
    """Milestones whose result could change if the organizers answer an Open assumption differently.

    A05: paid while the contract has an open dispute elsewhere. A07: penalty depends on rounding mode.
    A08: paid although the milestone has invoice_required but INVOICE is not a required event.
    """
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


def _outcome(result):
    return result["decision"], result["reason_code"], result["payable"], result["penalty"]


def at_lateness_boundary(result, milestone):
    """Completion within one day of due date + grace on a milestone with a late penalty."""
    if not result["completion_ts"] or milestone.get("late_penalty_applicable") != "TRUE":
        return False
    try:
        limit = date.fromisoformat(milestone["due_date"]) + timedelta(days=int(milestone["grace_period_days"]))
    except (KeyError, ValueError):
        return False
    return abs((datetime.fromisoformat(result["completion_ts"]).date() - limit).days) <= 1


def confidence_score(result, changed_by=(), milestone=None):
    """Score string with two decimals and the factors behind it; never touches the decision."""
    factors = list(changed_by)
    score = Decimal(1) - sum(READINGS[code][0] for code in changed_by)
    if result["issues"]:
        factors.append("DATA_ISSUE")
        score = min(score, ISSUE_CAP)
    duplicates = min(len(result["duplicates"]), 3)
    if duplicates:
        factors.append("DUPLICATE")
        score *= DUPLICATE_FACTOR ** duplicates
    if result["unrelated"]:
        factors.append("UNRELATED_EVENT")
        score *= UNRELATED_FACTOR
    if milestone is not None and at_lateness_boundary(result, milestone):
        factors.append("LATENESS_BOUNDARY")
        score *= BOUNDARY_FACTOR
    score = max(Decimal(0), min(Decimal(1), score)).quantize(CENT, ROUND_HALF_UP)
    return str(score), factors


def _candidates(pack, results, code):
    """Milestones a reading can affect at all, so only those are evaluated again."""
    if code == "A05":
        disputed = {e["contract_id"] for e in pack.events if e["event_type"] == "DISPUTE_OPENED"}
        return [mid for mid in results if pack.milestones[mid]["contract_id"] in disputed]
    if code == "A06":
        return [mid for mid in results if any(e["event_type"] == "DISPUTE_RESOLVED" for e in pack.events_by_ms[mid])]
    if code == "A07":
        return [mid for mid, r in results.items() if r["decision"] == "PENALTY"]
    return [mid for mid in results if pack.milestones[mid]["invoice_required"] == "TRUE"]


def confidence_scores(pack, results, evaluate, **profile):
    """Confidence of every milestone. `profile` holds the switches the results were evaluated with."""
    changed = defaultdict(list)
    for code, (_, switches) in READINGS.items():
        if all(profile.get(key) == value for key, value in switches.items()):
            continue  # the profile already reads the brief this way
        for mid in _candidates(pack, results, code):
            if _outcome(evaluate(pack, mid, **{**profile, **switches})) != _outcome(results[mid]):
                changed[mid].append(code)
    return {mid: confidence_score(result, changed.get(mid, ()), pack.milestones[mid]) for mid, result in results.items()}
