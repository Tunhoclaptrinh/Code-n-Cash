"""Penalty and payable amounts.

Input: the winning rule, the rule environment, the rounding mode, and the milestone's terms.
Output: Decimal amounts quantized to 0.01, plus the unrounded capped penalty used for reconciliation.
Business rules: BR-12 (late penalty = days late x rate / 100 x planned, capped at max_penalty_pct),
BR-13 (money comes from the winning rule's formulas, Decimal only, ROUND_HALF_UP by default).
"""
from decimal import ROUND_HALF_UP, Decimal

from . import expressions
from .pack import CENT

ZERO_AMOUNT = Decimal("0.00")


def rule_amounts(rule, env, rounding=ROUND_HALF_UP):
    """BR-13: return (penalty, payable) from the rule's formulas; both 0.00 when there is no rule.

    The payable formula sees the rounded penalty as ``penalty_amount_vnd_mn``.
    """
    if rule is None:
        return ZERO_AMOUNT, ZERO_AMOUNT
    penalty = Decimal(expressions.evaluate_expr(rule["penalty_amount_formula"], env)).quantize(CENT, rounding=rounding)
    payable_env = {**env, "penalty_amount_vnd_mn": penalty}
    payable = Decimal(expressions.evaluate_expr(rule["payable_amount_formula"], payable_env)).quantize(CENT, rounding=rounding)
    return penalty, payable


def raw_penalty(days_late, rate, cap, planned):
    """BR-12: the capped penalty before rounding, independent of the rule that won."""
    return min(Decimal(days_late) * rate / 100 * planned, cap / 100 * planned)
