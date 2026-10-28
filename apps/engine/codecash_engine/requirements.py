"""Required-event matching for one milestone.

Input: the classified events (verdicts) and the milestone's required event types.
Output: valid required events per type, unauthorized required events, unrelated events, the list of
missing event types and the completion rate (Decimal).
Business rules: BR-04..BR-07 (a required event counts only from the party the policy authorizes, with the
valid status; the earliest valid copy per type wins), BR-20 (evidence events outside the required list and
unknown event types are unrelated), BR-06 (completion rate = valid required / required).
"""
from decimal import Decimal


def classify_required(verdicts):
    """Return (valid_req, unauthorized, unrelated).

    valid_req maps event type -> earliest authorized event with the valid status for that type.
    unauthorized lists required-type events from an actor the policy does not authorize (counted, never accepted).
    unrelated lists events that are neither required nor of a supporting category (approval, rejection, dispute).
    """
    valid_req, unauthorized, unrelated = {}, [], []
    for v in verdicts:
        e, flags = v.event, v.flags
        if flags["required"]:
            if not flags["required_authorized"]:
                unauthorized.append(e)
            elif flags["status_ok"]:
                valid_req.setdefault(e["event_type"], e)
        elif v.kind is None or v.kind.category == "EVIDENCE":
            unrelated.append(e)
    return valid_req, unauthorized, unrelated


def missing_events(required_types, valid_req):
    """Required types without a valid event, in the order of the milestone."""
    return [t for t in required_types if t not in valid_req]


def completion_rate(required_types, missing):
    """Share of required events that are valid, as a Decimal; 0 when nothing is required."""
    if not required_types:
        return Decimal(0)
    return Decimal(len(required_types) - len(missing)) / Decimal(len(required_types))
