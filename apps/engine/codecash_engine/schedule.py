"""Milestone dates: completion and lateness.

Input: valid required events, counted approvals, the completion categories of the policy and the
milestone's due date and grace days (as bound by ``bindings``).
Output: the completion timestamp and date and the days late after grace.
Business rules: BR-11 (completion = latest of the valid required events, one per type; approvals only count
when the policy names the APPROVAL category, a sensitivity reading), BR-12 (days late are whole calendar
days after due date + grace, never negative).
"""
from datetime import datetime, timedelta


def completion_timestamp(valid_req, approvals, missing, categories=("EVIDENCE",)):
    """BR-11: latest timestamp of the events the policy counts, or None while anything is missing."""
    if missing or not valid_req:
        return None
    stamps = [e["event_timestamp"] for e in valid_req.values()]
    if "APPROVAL" in categories:
        stamps += [e["event_timestamp"] for e in approvals.values()]
    return max(stamps)


def completion_date(timestamp):
    return datetime.fromisoformat(timestamp).date() if timestamp else None


def days_late_after_grace(completed_on, due, grace):
    """BR-12: whole days after due date + grace; 0 when on time, early or not completed."""
    if not completed_on or not due:
        return 0
    return max(0, (completed_on - (due + timedelta(days=int(grace or 0)))).days)
