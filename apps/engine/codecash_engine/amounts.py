"""Penalty and payable amounts, and the amount guard.

Input: the winning rule, the rule environment, the policy (rounding, quantum, amount guards, the amount
contract of each decision and the reference penalty formula).
Output: Decimal amounts quantized to the policy quantum (0.01), the unrounded reference penalty used for
reconciliation, and the amount checks that fail.
Business rules: BR-12 (late penalty = days late x rate / 100 x planned, capped at max_penalty_pct),
BR-13 (money comes from the winning rule's formulas, Decimal only, ROUND_HALF_UP by default), and the
amount contract of each decision in the policy (RELEASE pays the planned amount, HOLD and REJECT pay
nothing, PENALTY pays the planned amount less a penalty within the cap).
"""
from decimal import Decimal, DecimalException

from . import expressions
from .expressions import ExpressionError

ZERO_AMOUNT = Decimal("0.00")


def rule_amounts(rule, env, rounding=None, policy=None):
    """BR-13: return (penalty, payable) from the rule's formulas; both 0.00 when there is no rule.

    The payable formula sees the rounded penalty as ``penalty_amount_vnd_mn``. Raises ExpressionError when a
    formula cannot be evaluated.
    """
    if rule is None:
        return ZERO_AMOUNT, ZERO_AMOUNT
    if policy is None:
        from .policy import load_policy
        policy = load_policy()
    quantum, rounding = policy.quantum, rounding or policy.rounding

    def amount(text, values):
        value = expressions.evaluate_expr(text, values)
        if not isinstance(value, Decimal) or not value.is_finite():
            raise ExpressionError("RULE_AMOUNT_NOT_A_NUMBER")
        try:
            return value.quantize(quantum, rounding=rounding)
        except DecimalException as error:
            raise ExpressionError("RULE_AMOUNT_NOT_A_NUMBER") from error

    penalty = amount(rule["penalty_amount_formula"], env)
    payable = amount(rule["payable_amount_formula"], {**env, "penalty_amount_vnd_mn": penalty})
    return penalty, payable


def reference_penalty(policy, env):
    """BR-12: the capped penalty before rounding, from the policy formula, independent of the rule that won."""
    try:
        value = policy.reference_penalty(env)
    except ExpressionError:
        return None
    return value if isinstance(value, Decimal) else None


def amount_env(env, penalty, payable, reference):
    return {**env, "penalty_amount_vnd_mn": penalty, "payable_amount_vnd_mn": payable,
            "reference_penalty_vnd_mn": reference}


def failed_checks(policy, decision, values):
    """The amount guards and the decision's amount contract that do not hold (an error counts as failing)."""
    failed = []
    for text, fn in policy.amount_guards + policy.decisions[decision]["amounts"]:
        try:
            ok = fn(values)
        except ExpressionError:
            ok = False
        if ok is not True:
            failed.append(text)
    return failed
