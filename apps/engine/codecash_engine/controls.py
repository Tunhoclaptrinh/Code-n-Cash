"""Payment controls: disputes, rejections and approvals.

Input: the classified events (verdicts) of a milestone, the parties lookup, the contract, the milestone row
and the policy.
Output: open dispute events, valid rejections and the counted approvals.
Business rules: BR-08 (a dispute opens easily, closes only when the policy's closing predicate holds for a
resolution that references it; scope milestone or contract), BR-09 (a valid rejection blocks payment
regardless of required approval roles), BR-10 (each approver counts once; the quorum counts the distinct
values the policy names, the approval roles, covered by counted approvals).
"""
from .events import up_to


def dispute_scope_events(pack, milestone, events, policy, as_of=None):
    """Events searched for disputes: the milestone's own (cleaned) events, or the whole contract's raw events."""
    if policy.dispute_scope != "CONTRACT":
        return events
    return [e for ms in pack.milestones.values() if ms["contract_id"] == milestone["contract_id"]
            for e in up_to(pack.events_by_ms[ms["milestone_id"]], as_of)]


def closes_dispute(policy, resolution, event_by_id, parties, contract, milestone):
    """BR-08: the policy's closing predicate for one resolution and the event it references."""
    scope = {"event": resolution, "actor": parties.get(resolution["actor_party_id"]), "contract": contract,
             "milestone": milestone, "referenced": event_by_id.get(resolution["reference_event_id"])}
    return policy.dispute_closes(scope)


def open_disputes(policy, scope_events, event_by_id, parties, contract, milestone):
    """BR-08: opening events that no closing resolution references."""
    kinds = policy.kinds

    def category(e):
        kind = kinds.get(e["event_type"])
        return kind.category if kind else None

    closed = {r["reference_event_id"] for r in scope_events if category(r) == "DISPUTE_RESOLVE"
              and closes_dispute(policy, r, event_by_id, parties, contract, milestone)}
    return [e for e in scope_events if category(e) == "DISPUTE_OPEN" and e["event_id"] not in closed]


def valid_rejections(verdicts):
    """BR-09: rejection events from an authorized party with the valid status."""
    return [v.event for v in verdicts if v.category == "REJECTION" and v.flags["valid"]]


def count_approvals(policy, verdicts):
    """BR-10: return (approvals, covered_count).

    approvals maps the policy's ``one_per`` cell (the approver party id) -> that approver's earliest counted
    approval. The count is the number of distinct ``covers`` values (approval roles), not of approvals.
    """
    approvals, covered = {}, {}
    for v in verdicts:
        if v.category == "APPROVAL" and v.flags["valid"] and policy.approval_counts(v.scope):
            key = v.event.get(policy.approval_one_per)
            if key not in approvals:
                approvals[key] = v.event
                covered[key] = (v.actor or {}).get(policy.approval_covers)
    return approvals, len(set(covered.values()))
