"""Milestone dates: completion, lateness and the acceptance review window.

Input: valid required events, counted approvals, the completion categories of the policy, the event
verdicts, the contract row and the milestone's due date and grace days (as bound by ``bindings``).
Output: the completion timestamp and date, the days late after grace and the review window facts.
Business rules: BR-11 (completion = latest of the valid required events, one per type; approvals only count
when the policy names the APPROVAL category, a sensitivity reading), BR-12 (days late are whole calendar
days after due date + grace, never negative), BR-21 (acceptance review window: once the supplier has asked
for acceptance, a document the buyer must issue counts at the latest at the end of the window).

BR-21 in detail, for a contract that sets the window (``review_window.field`` of the policy, in days):

- A request (REVIEW_REQUEST, from the requesting side) opens the window. The window starts at the request,
  or when the requesting side's own required documents are all valid if that is later: the buyer reviews
  finished work only.
- A return (REVIEW_RETURN, from the reviewed side) inside the window cancels that request: the supplier fixes
  the work and asks again. A return after the window has closed changes nothing.
- The earliest request that was not returned is the one in force.
- A required document of the reviewed side issued after the window closed counts at the window's end. The
  document is still needed: the window moves the completion date, never the conditions for payment.
- A contract without the cell (every Data Pack contract) has no window and keeps BR-11 unchanged.
"""
from datetime import datetime, timedelta

UNREADABLE_WINDOW = "acceptance_review_days không đọc được"


def _ts(event):
    return event["event_timestamp"]


def _order(event):
    return event["event_timestamp"], event["event_id"]


def review_window(policy, verdicts, valid_req, required_types, contract):
    """BR-21: (window, issues). ``window`` is None when the contract sets no review window.

    The window dict: days, request_id, requested_at, starts_at, deadline (timestamps or None), returned_ids
    (requests cancelled by a return inside their window), reviewed_types (required types of the reviewed
    side) and, filled in by ``completion_timestamp``, deemed_types (documents counted at the deadline).
    starts_at and deadline stay None while the requesting side's own required documents are incomplete.
    """
    config = policy.review_window
    if not config:
        return None, []
    text = (contract or {}).get(config["field"])
    if text is None or str(text).strip() == "":
        return None, []
    try:
        days = int(str(text).strip())
    except ValueError:
        return None, [UNREADABLE_WINDOW]
    if days < 1 or days > config["max_days"]:
        return None, [UNREADABLE_WINDOW]

    def side_of(event_type):
        kind = policy.kinds.get(event_type)
        return kind.side if kind else None

    reviewed_side = config["reviewed_side"]
    reviewed_types = [t for t in required_types if side_of(t) == reviewed_side]
    own_types = [t for t in required_types if side_of(t) != reviewed_side]
    own_ready = all(t in valid_req for t in own_types)
    ready = max((_ts(valid_req[t]) for t in own_types if t in valid_req), default=None)
    requests = sorted((v.event for v in verdicts if v.category == "REVIEW_REQUEST" and v.flags["valid"]), key=_order)
    returns = sorted((v.event for v in verdicts if v.category == "REVIEW_RETURN" and v.flags["valid"]), key=_order)

    window = {"days": days, "request_id": None, "requested_at": None, "starts_at": None, "deadline": None,
              "returned_ids": [], "reviewed_types": reviewed_types, "deemed_types": []}

    def bounds(request):
        start = max(_ts(request), ready) if ready else _ts(request)
        return start, (datetime.fromisoformat(start) + timedelta(days=days)).isoformat(timespec="seconds")

    # In event order: a request opens a window unless one is already open (a repeated request changes
    # nothing); a return inside the open window cancels it. Event order breaks ties of the same second, so
    # a request made right after a return opens a new window.
    current = None
    returned = {e["event_id"] for e in returns}
    for event in sorted(requests + returns, key=_order):
        if event["event_id"] not in returned:
            current = current or event
        elif current is not None and _ts(event) <= bounds(current)[1]:
            window["returned_ids"].append(current["event_id"])
            current = None
    if current is not None:
        window.update(request_id=current["event_id"], requested_at=_ts(current))
        if own_ready:
            start, deadline = bounds(current)
            window.update(starts_at=start, deadline=deadline)
    return window, []


def completion_timestamp(valid_req, approvals, missing, categories=("EVIDENCE",), window=None):
    """BR-11: latest timestamp of the events the policy counts, or None while anything is missing.

    BR-21: with a review window in force, a reviewed document issued after the deadline counts at the
    deadline; ``window["deemed_types"]`` lists the documents this moved.
    """
    if missing or not valid_req:
        return None
    deadline = window["deadline"] if window else None
    stamps = []
    for event_type, event in valid_req.items():
        stamp = _ts(event)
        if deadline and event_type in window["reviewed_types"] and stamp > deadline:
            window["deemed_types"].append(event_type)
            stamp = deadline
        stamps.append(stamp)
    if "APPROVAL" in categories:
        stamps += [_ts(e) for e in approvals.values()]
    return max(stamps)


def completion_date(timestamp):
    return datetime.fromisoformat(timestamp).date() if timestamp else None


def days_late_after_grace(completed_on, due, grace):
    """BR-12: whole days after due date + grace; 0 when on time, early or not completed."""
    if not completed_on or not due:
        return 0
    return max(0, (completed_on - (due + timedelta(days=int(grace or 0)))).days)
