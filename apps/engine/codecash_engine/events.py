"""Event cleaning and actor classification.

Input: the milestone's events (ordered by timestamp, event_id), the parties lookup and the contract.
Output: plain lists, the deduplicated events with their duplicate pairs, the events voided by an
approved exception decision, anomaly strings, and the authority predicates used by later stages.
Business rules: BR-03 (deduplicate, keep the earliest copy), BR-04/BR-05 (who may create which event
and with which status), BR-15 (anomalies), BR-16 (as-of cut), BR-19 (exception decisions may only
void unauthorized or anomalous events).
"""
from .pack import AUTHORITY, VALID_STATUS


def up_to(events, as_of):
    """BR-16: keep events at or before the as-of timestamp; ``None`` keeps all of them."""
    if not as_of:
        return events
    return [e for e in events if e["event_timestamp"] <= as_of]


def dedupe(events):
    """BR-03: return (kept, duplicates); duplicates are (dropped_event_id, kept_event_id) pairs.

    Two events are copies when every identity field matches and the document_id is not empty.
    ``events`` must already be ordered by (timestamp, event_id) so the earliest copy is kept.
    """
    seen, kept, dups = {}, [], []
    for e in events:
        key = (e["contract_id"], e["milestone_id"], e["event_type"], e["document_id"],
               e["actor_party_id"], e["event_status"], e["reference_event_id"])
        if e["document_id"] and key in seen:
            dups.append((e["event_id"], seen[key]))
            continue
        seen[key] = e["event_id"]
        kept.append(e)
    return kept, dups


def party_of(parties, event):
    return parties.get(event["actor_party_id"])


def required_authorized(parties, contract, event, literal_permissions=False):
    """BR-04: the actor is the contract's own active party of the type that may create this event.

    ``literal_permissions`` is a sensitivity switch that trusts parties.allowed_event_types instead.
    """
    p = party_of(parties, event)
    if p is None:
        return False
    if literal_permissions:
        return event["event_type"] in p["allowed_event_types"].split(";")
    needed = AUTHORITY.get(event["event_type"])
    if p["party_type"] != needed or p["status"] != "ACTIVE":
        return False
    return event["actor_party_id"] == (contract["buyer_id"] if needed == "BUYER" else contract["supplier_id"])


def approver_of_contract(parties, contract, event):
    """Actor is an active approver of the contract's buyer who may approve payment."""
    p = party_of(parties, event)
    return (p is not None and p["party_type"] == "APPROVER" and p["status"] == "ACTIVE"
            and p["parent_party_id"] == contract["buyer_id"] and p["can_approve_payment"] == "TRUE")


def valid_rejection(parties, contract, event):
    """BR-09: a REJECTED event by an approver of the contract that is allowed to reject."""
    return (event["event_status"] == "REJECTED" and approver_of_contract(parties, contract, event)
            and "REJECTION" in party_of(parties, event)["allowed_event_types"].split(";"))


def void_eligible(parties, contract, required_types, event, literal_permissions=False):
    """BR-19: only unknown-actor, unknown-type, unauthorized required or invalid rejection events qualify."""
    if party_of(parties, event) is None or event["event_type"] not in VALID_STATUS:
        return True
    if event["event_type"] in required_types and not required_authorized(parties, contract, event, literal_permissions):
        return True
    return event["event_type"] == "REJECTION" and not valid_rejection(parties, contract, event)


def apply_voids(parties, contract, required_types, events, raw, voided, literal_permissions=False):
    """BR-19: return (kept, applied, notes).

    ``applied`` are events with an approved exception decision that are eligible to be voided.
    A void request for an ineligible or unknown event is refused and reported in ``notes``.
    """
    applied = [e for e in events if e["event_id"] in voided
               and void_eligible(parties, contract, required_types, e, literal_permissions)]
    refused = sorted({e["event_id"] for e in raw if e["event_id"] in voided} - {e["event_id"] for e in applied})
    notes = []
    if refused:
        notes.append("yêu cầu vô hiệu không hợp lệ, bị bỏ qua: " + ";".join(refused))
    return [e for e in events if e not in applied], applied, notes


def find_anomalies(parties, events):
    """BR-15: events from an unknown actor or with an unknown event_type."""
    anomalies = []
    for e in events:
        if party_of(parties, e) is None:
            anomalies.append(f"{e['event_id']}: actor không tồn tại")
        if e["event_type"] not in VALID_STATUS:
            anomalies.append(f"{e['event_id']}: event_type lạ")
    return anomalies
