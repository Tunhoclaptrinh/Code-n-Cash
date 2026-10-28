"""Event cleaning and classification.

Input: the milestone's events (ordered by timestamp, event_id), the parties lookup, the contract, the
milestone, its required event types and the policy.
Output: plain data, the deduplicated events with their duplicate pairs, one verdict per event (who may
create it, whether its status is valid, whether it is a required event from the authorized party), the
events voided by an approved exception decision and the anomaly strings.
Business rules: BR-03 (deduplicate on the policy identity, keep the earliest copy), BR-04/BR-05 (authority
and valid status per event type, from the policy), BR-15 (anomalies), BR-16 (as-of cut), BR-19 (an exception
decision may only void what the policy calls voidable).
"""


def up_to(events, as_of):
    """BR-16: keep events at or before the as-of timestamp; ``None`` keeps all of them."""
    if not as_of:
        return events
    return [e for e in events if e["event_timestamp"] <= as_of]


def dedupe(events, policy):
    """BR-03: return (kept, duplicates); duplicates are (dropped_event_id, kept_event_id) pairs.

    Two events are copies when every identity field of the policy matches and the fields the policy
    requires (the document_id) are not empty. ``events`` must already be ordered by (timestamp, event_id)
    so the earliest copy is kept.
    """
    seen, kept, dups = {}, [], []
    fields, required = policy.dedupe_fields, policy.dedupe_required
    for e in events:
        key = tuple(e.get(f, "") for f in fields)
        if all(e.get(f) for f in required) and key in seen:
            dups.append((e["event_id"], seen[key]))
            continue
        seen[key] = e["event_id"]
        kept.append(e)
    return kept, dups


class Verdict:
    """What the policy says about one event in the context of one milestone."""
    __slots__ = ("event", "kind", "actor", "scope", "flags")

    def __init__(self, event, kind, actor, scope, flags):
        self.event, self.kind, self.actor, self.scope, self.flags = event, kind, actor, scope, flags

    @property
    def category(self):
        return self.kind.category if self.kind else None


def classify(policy, parties, contract, milestone, required_types, event):
    """BR-04, BR-05: the verdict of one event; record predicates of the policy decide every flag."""
    actor = parties.get(event["actor_party_id"])
    kind = policy.kinds.get(event["event_type"])
    side = None
    if kind is not None and kind.side is not None:
        rule = policy.sides[kind.side]
        side = {"name": kind.side, "party_type": rule["party_type"], "contract_field": rule["contract_field"],
                "party_id": contract.get(rule["contract_field"], "")}
    scope = {"event": event, "actor": actor, "contract": contract, "milestone": milestone, "side": side,
             "kind": kind.record if kind is not None else None}
    authorized = kind.authority(scope) if kind is not None else False
    status_ok = kind is not None and event["event_status"] == kind.valid_status
    flags = {"authorized": authorized, "status_ok": status_ok, "valid": authorized and status_ok,
             "required": event["event_type"] in required_types}
    scope["verdict"] = flags
    flags["required_authorized"] = flags["required"] and policy.required_authorized(scope)
    return Verdict(event, kind, actor, scope, flags)


def classify_all(policy, parties, contract, milestone, required_types, events):
    required = set(required_types)
    return [classify(policy, parties, contract, milestone, required, e) for e in events]


def apply_voids(policy, verdicts, raw, voided):
    """BR-19: return (kept verdicts, applied verdicts, notes).

    ``applied`` are events with an approved exception decision that the policy calls voidable. A void
    request for an ineligible or unknown event is refused and reported in ``notes``.
    """
    if not voided:
        return verdicts, [], []
    applied = [v for v in verdicts if v.event["event_id"] in voided and policy.voidable(v.scope)]
    applied_ids = {v.event["event_id"] for v in applied}
    refused = sorted({e["event_id"] for e in raw if e["event_id"] in voided} - applied_ids)
    notes = ["yêu cầu vô hiệu không hợp lệ, bị bỏ qua: " + ";".join(refused)] if refused else []
    return [v for v in verdicts if v.event["event_id"] not in applied_ids], applied, notes


def find_anomalies(policy, verdicts):
    """BR-15: the anomaly messages of the policy, pass by pass, event by event."""
    anomalies = []
    for checks in policy.anomaly_passes:
        for v in verdicts:
            for when, message in checks:
                if when(v.scope):
                    anomalies.append(message.format_map(_Cells(v.event)))
    return anomalies


class _Cells(dict):
    """Event cells for anomaly messages; an unknown placeholder stays visible instead of failing."""

    def __missing__(self, key):
        return "{" + key + "}"
