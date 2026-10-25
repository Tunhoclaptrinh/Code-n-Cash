"""Payment controls: disputes, rejections and approvals.

Input: the cleaned events of a milestone, the parties lookup, the contract and the milestone row.
Output: open dispute events, valid rejections (plus rejection anomalies) and the counted approvals.
Business rules: BR-08 (a dispute opens easily, closes only by a valid resolution that references it),
BR-09 (a valid rejection blocks payment regardless of required approval roles), BR-10 (each approver
counts once; the quorum counts distinct required roles covered).
"""
from .events import approver_of_contract, party_of, up_to, valid_rejection


def dispute_scope_events(pack, milestone, events, contract_scope_dispute=False, as_of=None):
    """Events searched for disputes: the milestone's own, or the whole contract's (sensitivity switch)."""
    if not contract_scope_dispute:
        return events
    return [e for ms in pack.milestones.values() if ms["contract_id"] == milestone["contract_id"]
            for e in up_to(pack.events_by_ms[ms["milestone_id"]], as_of)]


def valid_resolution(resolution, event_by_id, parties, contract, milestone, strict_resolution=False):
    """BR-08: a RESOLVED event that references a DISPUTE_OPENED of the same milestone, not earlier than it.

    With ``strict_resolution`` the resolver must also be an active buyer-side party.
    """
    opened = event_by_id.get(resolution["reference_event_id"])
    p = party_of(parties, resolution)
    buyer_side = p is not None and (resolution["actor_party_id"] == contract["buyer_id"] or (
        p["party_type"] == "APPROVER" and p["parent_party_id"] == contract["buyer_id"]
        and "DISPUTE" in p["allowed_event_types"].split(";")))
    return (opened is not None and opened["event_type"] == "DISPUTE_OPENED"
            and opened["milestone_id"] == resolution["milestone_id"]
            and opened["contract_id"] == resolution["contract_id"] == milestone["contract_id"]
            and resolution["event_status"] == "RESOLVED"
            and resolution["event_timestamp"] >= opened["event_timestamp"]
            and (not strict_resolution or (buyer_side and p["status"] == "ACTIVE")))


def open_disputes(scope_events, event_by_id, parties, contract, milestone,
                  ignore_resolutions=False, strict_resolution=False):
    """BR-08: DISPUTE_OPENED events not closed by a valid resolution.

    ``ignore_resolutions`` treats every opened dispute as still open (sensitivity switch).
    """
    closed = set() if ignore_resolutions else {
        r["reference_event_id"] for r in scope_events
        if r["event_type"] == "DISPUTE_RESOLVED"
        and valid_resolution(r, event_by_id, parties, contract, milestone, strict_resolution)}
    return [e for e in scope_events if e["event_type"] == "DISPUTE_OPENED" and e["event_id"] not in closed]


def valid_rejections(parties, contract, events):
    """BR-09: return (rejections, anomalies); an invalid REJECTION is reported, not counted."""
    rejections = [e for e in events if e["event_type"] == "REJECTION" and valid_rejection(parties, contract, e)]
    anomalies = [f"{e['event_id']}: REJECTION không hợp lệ" for e in events
                 if e["event_type"] == "REJECTION" and not valid_rejection(parties, contract, e)]
    return rejections, anomalies


def count_approvals(parties, contract, events, roles):
    """BR-10: return (approvals, covered_role_count).

    approvals maps approver party id -> that approver's earliest valid APPROVAL (one per approver).
    The count is the number of distinct required roles covered, not the number of approvals.
    """
    approvals = {}
    for e in events:
        if (e["event_type"] == "APPROVAL" and e["event_status"] == "APPROVED"
                and approver_of_contract(parties, contract, e) and party_of(parties, e)["approval_role"] in roles):
            approvals.setdefault(e["actor_party_id"], e)
    return approvals, len({parties[a]["approval_role"] for a in approvals})
