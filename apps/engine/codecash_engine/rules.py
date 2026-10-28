"""Rule environment, first-match rule selection and the payment safety guard.

Input: the policy, the milestone configuration, the bound milestone and contract values, the facts computed
by earlier stages, the milestone's ordered rule scope, and the issues and anomalies found so far.
Output: the rule-variable environment (Decimal, bool, date or None values only, in vocabulary order) and a
``Selection``: the winning rule, how it was chosen, the rules evaluated on the way and any new issue.
Business rules: BR-02 (rules are data, first match wins), BR-14 (when nothing is sure, HOLD through the ELSE
rule), BR-15 (structural issues force the ELSE rule; anomalies only downgrade a paying rule to it), and the
safety principle of section 1: a paying rule only pays when the policy's payment guards hold, whatever the
rule table says. A rule that cannot be evaluated holds its milestone instead of failing the whole run.
"""
from decimal import Decimal

from . import expressions
from .expressions import ExpressionError

FIRST_MATCH = "FIRST_MATCH"
STRUCTURE_FALLBACK = "STRUCTURE_FALLBACK"
ANOMALY_FALLBACK = "ANOMALY_FALLBACK"
PAYMENT_GUARD_FALLBACK = "PAYMENT_GUARD_FALLBACK"
RULE_ERROR_FALLBACK = "RULE_ERROR_FALLBACK"
AMOUNT_GUARD_FALLBACK = "AMOUNT_GUARD_FALLBACK"
# A safety check had to stop a rule of the table: the milestone is held, and the run reports a defective rule.
SAFETY_INTERVENTIONS = (RULE_ERROR_FALLBACK, PAYMENT_GUARD_FALLBACK, AMOUNT_GUARD_FALLBACK)


class Selection:
    __slots__ = ("rule", "mode", "trace", "issues")

    def __init__(self, rule, mode, trace=(), issues=()):
        self.rule, self.mode, self.trace, self.issues = rule, mode, list(trace), list(issues)


def build_env(policy, config, bound, facts):
    """The rule variables known before the penalty is computed, in vocabulary order.

    ``facts`` are the values the stages computed, ``bound`` the milestone and contract cells, ``config`` the
    parsed approval configuration. Derived facts of the policy are computed last, in policy order; a derived
    fact that cannot be evaluated is missing (None).
    """
    env = {}
    for name, variable in policy.variables.items():
        source = variable["binding"]["source"]
        if source == "fact":
            value = facts[name]
            env[name] = Decimal(value) if isinstance(value, int) and not isinstance(value, bool) else value
        elif source == "config":
            value = config[variable["binding"]["key"]]
            env[name] = Decimal(value) if isinstance(value, int) and not isinstance(value, bool) else value
        elif source in ("milestone", "contract"):
            env[name] = bound[name]
        elif source == "derived":
            env[name] = None
    for name, fn in policy.derived:
        try:
            env[name] = fn(env)
        except ExpressionError:
            env[name] = None
    return env


def fallback_rule(scope_rules, policy):
    """The fallback (ELSE) rule of the scope, or None when the scope has none."""
    return next((r for r in scope_rules if r["condition_expression"].strip() == policy.fallback_condition), None)


def failed_guards(policy, env):
    """Payment guards of the policy that do not hold for ``env`` (an error counts as not holding)."""
    failed = []
    for text, fn in policy.payment_guards:
        try:
            ok = fn(env)
        except ExpressionError:
            ok = False
        if ok is not True:
            failed.append(text)
    return failed


def select_rule(scope_rules, env, issues, anomalies, policy):
    """BR-02, BR-14, BR-15 and the payment guard: return the ``Selection`` for one milestone.

    Structural ``issues`` skip evaluation and use the fallback rule. Otherwise the first rule whose condition
    holds wins; a rule that raises holds the milestone through the fallback. A paying winner falls back when
    there are ``anomalies`` or when a payment guard of the policy fails.
    """
    fallback = fallback_rule(scope_rules, policy)
    if issues:
        return Selection(fallback, STRUCTURE_FALLBACK)
    trace = []
    for rule in scope_rules:
        try:
            matched = bool(expressions.evaluate_expr(rule["condition_expression"], env))
        except ExpressionError as error:
            trace.append({"rule_id": rule["rule_id"], "priority": rule["priority"], "error": error.code})
            return Selection(fallback, RULE_ERROR_FALLBACK, trace, [f"{rule['rule_id']}: {error.code}"])
        trace.append({"rule_id": rule["rule_id"], "priority": rule["priority"], "matched": matched})
        if matched:
            break
    else:
        return Selection(fallback, RULE_ERROR_FALLBACK, trace, ["không rule nào khớp"])
    if policy.pays(rule["decision"]):
        if anomalies:
            return Selection(fallback, ANOMALY_FALLBACK, trace)
        failed = failed_guards(policy, env)
        if failed:
            return Selection(fallback, PAYMENT_GUARD_FALLBACK, trace,
                             [f"{rule['rule_id']}: luật trả tiền khi chưa đạt điều kiện an toàn: {text}" for text in failed])
    return Selection(rule, FIRST_MATCH, trace)
