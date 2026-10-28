"""Evidence, condition tokens and milestone status.

Input: the facts of one evaluated milestone (valid events, approvals, disputes, rejections, reason code) and
the policy.
Output: the sorted evidence ids, the met and missing tokens of the BTC ``required_condition`` DSL, and
the milestone status.
Business rules: BR-17 (evidence and traceability: the policy names which extra events a reason cites),
section 9 (condition tokens: the policy defines each token kind), section 4 (status per
reason from the policy; PLANNED and IN_PROGRESS exist only in as-of mode).
"""
from datetime import date
from decimal import Decimal


def collect_evidence(policy, reason, sets):
    """BR-17: valid required and counted approval events, plus the event sets the reason cites in the policy.

    ``sets`` maps VALID_REQUIRED, COUNTED_APPROVALS, OPEN_DISPUTES and REJECTIONS to event lists.
    """
    names = ("VALID_REQUIRED", "COUNTED_APPROVALS") + policy.reasons.get(reason, {}).get("evidence", ())
    return sorted({e["event_id"] for name in names for e in sets.get(name, ())})


def condition_tokens(policy, required_condition, valid_req, approval_count, has_open_dispute):
    """Section 9: split ``required_condition`` into (met, missing) tokens. Unknown kinds are missing."""
    state = {"valid_required_types": list(valid_req), "valid_approval_count": approval_count,
             "open_dispute": has_open_dispute}
    met, miss = [], []
    for token in required_condition.split(policy.token_separator):
        kind, _, argument = token.partition(":")
        check = policy.token_kinds.get(kind)
        try:
            number = Decimal(argument) if argument else None
        except ArithmeticError:
            number = None
        ok = check is not None and check({"token": {"kind": kind, "argument": argument, "number": number},
                                          "state": state})
        (met if ok else miss).append(token)
    return met, miss


def milestone_status(policy, reason, as_of=None, has_events=True, due=None):
    """Section 4: the policy status of the reason code.

    In as-of mode a reason with an ``as_of`` mapping (missing required events) is PLANNED without any event
    so far, and IN_PROGRESS while the as-of day is not after the due date.
    """
    entry = policy.reasons[reason]
    status = entry["status"]
    as_of_map = entry["as_of"]
    if as_of and as_of_map:
        if not has_events and "without_events" in as_of_map:
            status = as_of_map["without_events"]
        elif has_events and due and "until_due" in as_of_map and date.fromisoformat(as_of[:10]) <= due:
            status = as_of_map["until_due"]
    return status

