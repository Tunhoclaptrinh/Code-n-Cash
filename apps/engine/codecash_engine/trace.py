"""Evidence, condition tokens and milestone status.

Input: the facts of one evaluated milestone (valid events, approvals, disputes, rejections, reason code).
Output: the sorted evidence ids, the met and missing tokens of the BTC ``required_condition`` DSL, and
the milestone status.
Business rules: BR-17 (evidence and traceability), section 14.3 (condition tokens), sections 9.2 and 9.4
(status mapping; PLANNED and IN_PROGRESS exist only in as-of mode).
"""
from datetime import date

from .pack import STATUS


def collect_evidence(valid_req, approvals, reason, open_dispute_events, rejections):
    """BR-17: valid required and approval events, plus the disputes or rejections that decided the reason."""
    evidence = [e["event_id"] for e in valid_req.values()] + [e["event_id"] for e in approvals.values()]
    if reason == "OPEN_DISPUTE":
        evidence += [e["event_id"] for e in open_dispute_events]
    if reason == "REJECTION_PRESENT":
        evidence += [e["event_id"] for e in rejections]
    return sorted(set(evidence))


def condition_tokens(required_condition, valid_req, approval_count, has_open_dispute):
    """Section 14.3: split ``required_condition`` into (met, missing) tokens. Unknown kinds are missing."""
    met, miss = [], []
    for token in required_condition.split(" AND "):
        kind, _, arg = token.partition(":")
        ok = {"EVENT": lambda: arg in valid_req,
              "APPROVAL_QUORUM": lambda: approval_count >= int(arg),
              "NO_OPEN_DISPUTE": lambda: not has_open_dispute}.get(kind, lambda: False)()
        (met if ok else miss).append(token)
    return met, miss


def milestone_status(reason, as_of=None, has_events=True, due=None):
    """Sections 9.2 and 9.4: map the reason code to a status.

    In as-of mode a milestone that only lacks events is PLANNED without any event so far, and IN_PROGRESS
    while the as-of day is not after the due date.
    """
    status = STATUS[reason]
    if as_of and reason == "MISSING_REQUIRED_EVENT":
        if not has_events:
            status = "PLANNED"
        elif due and date.fromisoformat(as_of[:10]) <= due:
            status = "IN_PROGRESS"
    return status
