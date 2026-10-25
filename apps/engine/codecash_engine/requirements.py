"""Required-event matching for one milestone.

Input: the cleaned events, the milestone's required event types, the parties lookup and the contract.
Output: valid required events per type, unauthorized required events, unrelated events, the list of
missing event types and the completion rate (Decimal).
Business rules: BR-04..BR-07 (a required event counts only from the authorized party with the valid
status; the earliest valid copy per type wins), BR-20 (events outside the required list are unrelated),
BR-06 (completion rate = valid required / required).
"""
from decimal import Decimal

from .events import required_authorized
from .pack import SUPPORT_TYPES, VALID_STATUS


def classify_required(parties, contract, events, required_types, literal_permissions=False):
    """Return (valid_req, unauthorized, unrelated).

    valid_req maps event type -> earliest authorized event with the valid status for that type.
    unauthorized lists required-type events from the wrong actor (counted, never accepted).
    unrelated lists business events whose type is neither required nor a supporting type.
    """
    valid_req, unauthorized, unrelated = {}, [], []
    for e in events:
        if e["event_type"] in required_types:
            if not required_authorized(parties, contract, e, literal_permissions):
                unauthorized.append(e)
            elif e["event_status"] == VALID_STATUS[e["event_type"]]:
                valid_req.setdefault(e["event_type"], e)
        elif e["event_type"] not in SUPPORT_TYPES:
            unrelated.append(e)
    return valid_req, unauthorized, unrelated


def missing_events(required_types, valid_req, enforce_invoice=False):
    """Required types without a valid event. ``enforce_invoice`` also demands an INVOICE (sensitivity switch)."""
    missing = [t for t in required_types if t not in valid_req]
    if enforce_invoice:
        missing.append("INVOICE")
    return missing


def completion_rate(required_types, missing):
    """Share of required events that are valid, as a Decimal; 0 when nothing is required."""
    if not required_types:
        return Decimal(0)
    return Decimal(len(required_types) - len(missing)) / Decimal(len(required_types))
