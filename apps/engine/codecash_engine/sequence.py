"""Sequence checks: events that are individually valid but arrive in an order a reviewer should see.

Input: the cleaned events of a milestone, the valid required events, the counted approvals, the dispute
resolutions, the completion timestamp and the contract.
Output: warning strings ``"<event_id>: <CODE>"``, sorted. Warnings never change the decision; they lower
the confidence score (section 8) and are listed in the trace so a person looks before paying.
Business rule: the README's Silver suggestion "anomaly check cho sequence event" (spec section 5).

Codes:
- APPROVAL_BEFORE_EVIDENCE: a counted approval is older than the last required evidence it approves;
- EVENT_BEFORE_SIGNING: required evidence other than CONTRACT_SIGNED dated before the contract's signing date;
- POSSIBLE_DUPLICATE: same type, actor and status as an earlier event, with another document id, within
  ``DUPLICATE_WINDOW``; exact copies are already removed by BR-03;
- RESOLVED_BY_PAYEE: a dispute closed by the contract's supplier, the party the payment goes to. The
  submission profile does not check the resolver (reading A06, section 12); the workflow profile refuses it.
"""
from datetime import datetime, timedelta

DUPLICATE_WINDOW = timedelta(hours=24)


def _at(event):
    return datetime.fromisoformat(event["event_timestamp"])


def sequence_warnings(events, valid_req, approvals, resolutions, completion_ts, contract):
    warnings = set()
    if completion_ts:
        warnings |= {f"{e['event_id']}: APPROVAL_BEFORE_EVIDENCE" for e in approvals.values()
                     if e["event_timestamp"] < completion_ts}
    signed_on = contract.get("signing_date") or ""
    if signed_on:
        warnings |= {f"{e['event_id']}: EVENT_BEFORE_SIGNING" for e in valid_req.values()
                     if e["event_type"] != "CONTRACT_SIGNED" and e["event_timestamp"][:10] < signed_on}
    for index, later in enumerate(events):
        for earlier in events[:index]:
            same = all(earlier[k] == later[k] for k in ("event_type", "actor_party_id", "event_status"))
            if same and earlier["document_id"] != later["document_id"] \
                    and timedelta(0) <= _at(later) - _at(earlier) <= DUPLICATE_WINDOW:
                warnings.add(f"{later['event_id']}: POSSIBLE_DUPLICATE")
                break
    warnings |= {f"{r['event_id']}: RESOLVED_BY_PAYEE" for r in resolutions
                 if r["actor_party_id"] == contract.get("supplier_id")}
    return sorted(warnings)
