"""Assumption flags and confidence score.

Input: the evaluated results of a Data Pack (and the Pack for milestone attributes).
Output: per-milestone flags naming the Open assumptions (A05, A07, A08) that could change the result,
and a team confidence score string.
Business rule: spec section 14.2 (a scale of the team's certainty, not a probability).
"""
from collections import defaultdict
from decimal import ROUND_HALF_EVEN, ROUND_HALF_UP

from .pack import CENT


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


def confidence_score(result, flags):
    """Section 14.2: 0.50 with data issues, 0.80 with an assumption flag, otherwise 1.00."""
    if result["issues"]:
        return "0.50"
    return "0.80" if flags else "1.00"
