"""Rule environment and first-match rule selection.

Input: the facts computed by earlier stages, the milestone's ordered rule scope, and the issues and
anomalies found so far.
Output: the rule-variable environment (Decimal, bool, date or None values only) and the winning rule.
Business rules: BR-02 (rules are data, first match wins), BR-14 (when nothing is sure, HOLD through the
ELSE rule), BR-15 (structural issues force the ELSE rule; anomalies only downgrade a paying rule to it).
"""
from decimal import Decimal

from . import expressions

PAYING_DECISIONS = ("RELEASE", "PENALTY")


def all_conditions_met(completion_rate, unauthorized_count, approval_required, approval_count, quorum):
    """The ``all_required_conditions_met`` fact: complete, nothing unauthorized, approval quorum reached."""
    return completion_rate == 1 and not unauthorized_count and (not approval_required or approval_count >= quorum)


def build_env(*, open_dispute, rejection_count, unauthorized_count, completion_rate, approval_required,
              approval_count, quorum, late_penalty_applicable, completion_date, terms, all_met, days_late):
    """Build the 16 rule variables known before the penalty is computed (the 17th is added by amounts)."""
    return {
        "open_dispute": open_dispute,
        "valid_rejection_event_count": Decimal(rejection_count),
        "unauthorized_required_event_count": Decimal(unauthorized_count),
        "required_event_completion_rate": completion_rate,
        "approval_required": approval_required,
        "valid_approval_count": Decimal(approval_count),
        "required_approval_quorum": Decimal(quorum),
        "late_penalty_applicable": late_penalty_applicable,
        "actual_completion_date": completion_date,
        "due_date": terms["due"],
        "grace_period_days": Decimal(terms["grace"]),
        "all_required_conditions_met": all_met,
        "days_late_after_grace": Decimal(days_late),
        "penalty_rate_pct_per_day": terms["rate"],
        "max_penalty_pct": terms["cap"],
        "planned_payment_vnd_mn": terms["planned"],
    }


def fallback_rule(scope_rules):
    """The ELSE rule of the scope (rule 80), or None when the scope has none."""
    return next((r for r in scope_rules if r["condition_expression"].strip() == "ELSE"), None)


def select_rule(scope_rules, env, issues, anomalies):
    """BR-02, BR-14, BR-15: return the winning rule, or None when no rule can be applied.

    Structural ``issues`` skip evaluation and use the ELSE rule. Otherwise the first rule whose condition
    holds wins, and ``anomalies`` downgrade a RELEASE or PENALTY winner to the ELSE rule.
    """
    fallback = fallback_rule(scope_rules)
    if issues:
        return fallback
    rule = next((r for r in scope_rules if expressions.evaluate_expr(r["condition_expression"], env)), fallback)
    if rule is None:
        return None
    if anomalies and rule["decision"] in PAYING_DECISIONS:
        return fallback
    return rule
