"""Milestone dates: completion and lateness.

Input: valid required events, counted approvals and the milestone's due date and grace days.
Output: the completion timestamp and date, the parsed milestone terms and the days late after grace.
Business rules: BR-11 (completion = latest of the valid required events, one per type; approvals only
count in the sensitivity mode), BR-12 (days late are whole calendar days after due date + grace, never
negative).
"""
from datetime import date, datetime, timedelta
from decimal import Decimal


def completion_timestamp(valid_req, approvals, missing, includes_approval=False):
    """BR-11: latest timestamp of the valid required events, or None while anything is missing."""
    if missing or not valid_req:
        return None
    stamps = [e["event_timestamp"] for e in valid_req.values()]
    if includes_approval:
        stamps += [e["event_timestamp"] for e in approvals.values()]
    return max(stamps)


def completion_date(timestamp):
    return datetime.fromisoformat(timestamp).date() if timestamp else None


def parse_terms(milestone):
    """Return (terms, issues). Unreadable date or money fields yield an issue and neutral zero terms.

    terms: due (date or None), grace (int days), rate and cap (percent Decimals), planned (Decimal).
    """
    try:
        terms = {"due": date.fromisoformat(milestone["due_date"]), "grace": int(milestone["grace_period_days"]),
                 "rate": Decimal(milestone["penalty_rate_pct_per_day"]), "cap": Decimal(milestone["max_penalty_pct"]),
                 "planned": Decimal(milestone["planned_payment_vnd_mn"])}
        return terms, []
    except (ValueError, ArithmeticError):
        neutral = {"due": None, "grace": 0, "rate": Decimal(0), "cap": Decimal(0), "planned": Decimal(0)}
        return neutral, ["tham số ngày/tiền của milestone không đọc được"]


def days_late_after_grace(completed_on, due, grace):
    """BR-12: whole days after due date + grace; 0 when on time, early or not completed."""
    if not completed_on or not due:
        return 0
    return max(0, (completed_on - (due + timedelta(days=grace))).days)
