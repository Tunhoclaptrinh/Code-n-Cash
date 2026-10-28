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
from datetime import date
from decimal import Decimal

from . import expressions
from .expressions import ExpressionError

FIRST_MATCH = "FIRST_MATCH"
STRUCTURE_FALLBACK = "STRUCTURE_FALLBACK"
ANOMALY_FALLBACK = "ANOMALY_FALLBACK"
PAYMENT_GUARD_FALLBACK = "PAYMENT_GUARD_FALLBACK"
RULE_ERROR_FALLBACK = "RULE_ERROR_FALLBACK"
AMOUNT_GUARD_FALLBACK = "AMOUNT_GUARD_FALLBACK"
# A safety check had to stop a paying rule of the table: the milestone is held, and the run reports a defective
# rule. A rule that cannot be evaluated only holds its milestone (BR-14); the rule version preview refuses it.
SAFETY_INTERVENTIONS = (PAYMENT_GUARD_FALLBACK, AMOUNT_GUARD_FALLBACK)
RULE_ERROR = "không đánh giá được luật (RULE_EVALUATION_ERROR)"


class Selection:
    """The applied rule, how it was chosen, the rules evaluated on the way (``trace``) and new issues.

    ``set_aside`` maps a rule that matched but was not applied to its outcome (OVERRIDDEN, SET_ASIDE, FAILED).
    """
    __slots__ = ("rule", "mode", "trace", "issues", "set_aside")

    def __init__(self, rule, mode, trace=(), issues=(), set_aside=None):
        self.rule, self.mode, self.trace, self.issues = rule, mode, list(trace), list(issues)
        self.set_aside = dict(set_aside or {})


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
            return Selection(fallback, RULE_ERROR_FALLBACK, trace, [f"{RULE_ERROR}: {rule['rule_id']} {error.code}"],
                             {rule["rule_id"]: "FAILED"})
        trace.append({"rule_id": rule["rule_id"], "priority": rule["priority"], "matched": matched})
        if matched:
            break
    else:
        return Selection(fallback, RULE_ERROR_FALLBACK, trace, ["không rule nào khớp"])
    if policy.pays(rule["decision"]):
        if anomalies:
            return Selection(fallback, ANOMALY_FALLBACK, trace, set_aside={rule["rule_id"]: "OVERRIDDEN"})
        failed = failed_guards(policy, env)
        if failed:
            return Selection(fallback, PAYMENT_GUARD_FALLBACK, trace,
                             [f"{rule['rule_id']}: luật trả tiền khi chưa đạt điều kiện an toàn: {text}" for text in failed],
                             {rule["rule_id"]: "SET_ASIDE"})
    return Selection(rule, FIRST_MATCH, trace)


def rule_trail(scope_rules, selection):
    """BR-17: what happened to each rule of the scope, in priority order: (rule_id, outcome).

    MATCHED is the rule applied; NOT_MATCHED a rule whose condition was false; OVERRIDDEN a paying rule that
    matched but was sent to ELSE by an anomaly; SET_ASIDE a matching rule stopped by a safety guard; FAILED a
    rule that could not be evaluated; NOT_EVALUATED a rule after the decision, or every rule when a structural
    issue sent the milestone straight to ELSE.
    """
    seen = {step["rule_id"]: step for step in selection.trace}
    applied = selection.rule["rule_id"] if selection.rule else None
    trail = []
    for r in scope_rules:
        rule_id = r["rule_id"]
        if rule_id in selection.set_aside:
            outcome = selection.set_aside[rule_id]
        elif rule_id == applied:
            outcome = "MATCHED"
        elif rule_id in seen:
            outcome = "MATCHED" if seen[rule_id].get("matched") else "NOT_MATCHED"
        else:
            outcome = "NOT_EVALUATED"
        trail.append((rule_id, outcome))
    return trail


def plain_variables(env):
    """The rule variables as JSON-ready strings, booleans and None (Decimal and date become text)."""
    return {k: str(v) if isinstance(v, (Decimal, date)) else v for k, v in env.items()}
