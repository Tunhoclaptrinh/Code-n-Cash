"""Static safety check of a rule set, before any milestone uses it.

Input: payment rule rows (any number of release_rule_code scopes, e.g. a draft rule version).
Output: a report: ``safe``, the number of scopes and fact scenarios checked, the violations and the rules
that never win.
Business rules: BR-14 (when unsure, HOLD) and the payment-safety invariants of spec section 9, proved for
the rules themselves instead of checked after a run on today's data. The 405-milestone comparison only
sees the parameters the Data Pack happens to contain; a contract created in the app can have others.

Method: every scope is evaluated by plain first match (without the runtime guards of ``rules.select_rule``, which would hide an unsafe rule) on a grid of rule facts that
crosses each boundary the rule language can test (no/one dispute, rejection and unauthorized event;
completion rate 0, partial, complete; approval not required, quorum 1 or 2 with every count below and at
it; penalty applicable or not; completion one day early, on, one day after and far after due + grace).
Boundary values are added for every constant a condition compares a variable with (one step below, at
and above it), so a rule that only misbehaves above some amount or count is still reached.
Properties, per scenario:
- BLOCKED_PAYMENT: no RELEASE or PENALTY while a blocker holds (open dispute, valid rejection,
  unauthorized required event, missing required event, approval quorum not met);
- AMOUNT_OUT_OF_RANGE: payable and penalty are not negative and add up to at most the planned amount;
- PAYMENT_WHILE_HELD: a HOLD or REJECT pays nothing;
- EVALUATION_ERROR: a condition or formula cannot be evaluated;
- NO_FALLBACK: the scope does not end with the ELSE rule.
"""
import ast
from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal
from itertools import product

from . import amounts, expressions, rules, schedule
from .policy import load_policy

DUE = date(2026, 1, 10)
GRACE = 2
DEFAULTS = {"planned_payment_vnd_mn": Decimal("100.00"), "penalty_rate_pct_per_day": Decimal("0.10"),
            "max_penalty_pct": Decimal("10.00")}
COMPLETION_OFFSETS = {-1, 0, 1, 200}  # days after due date + grace; 200 days reaches the penalty cap
# Step used for "just below / just above" a constant, per variable.
STEPS = {"planned_payment_vnd_mn": Decimal("0.01"), "penalty_rate_pct_per_day": Decimal("0.01"),
         "max_penalty_pct": Decimal("0.01"), "days_late_after_grace": Decimal(1),
         "valid_rejection_event_count": Decimal(1), "unauthorized_required_event_count": Decimal(1),
         "valid_approval_count": Decimal(1), "required_approval_quorum": Decimal(1)}
MAX_REPORTED = 20
MAX_BOUNDARIES = 6  # constants per variable; a longer list keeps the smallest ones


def boundaries(scope_rules):
    """Constants each variable is compared with in the scope's conditions, as {variable: set of values}."""
    found = defaultdict(set)
    for rule in scope_rules:
        text = rule["condition_expression"].strip()
        if text == "ELSE":
            continue
        for node in ast.walk(ast.parse(text.replace(" AND ", " and "), mode="eval")):
            if not isinstance(node, ast.Compare):
                continue
            left, right = node.left, node.comparators[0]
            for name, const in ((left, right), (right, left)):
                if isinstance(name, ast.Name) and name.id in STEPS and isinstance(const, ast.Constant) \
                        and type(const.value) in (int, float):
                    value, step = Decimal(str(const.value)), STEPS[name.id]
                    found[name.id] |= {v for v in (value - step, value, value + step) if v >= 0}
    return {k: sorted(v)[:MAX_BOUNDARIES * 3] for k, v in found.items()}


def scenarios(extra=None, policy=None):
    """Yield (facts, blocked, env) for every point of the grid, widened by ``extra`` boundary values."""
    extra = extra or {}
    policy = policy or load_policy()
    counts = lambda name: sorted({0, 1} | {int(v) for v in extra.get(name, ()) if v == v.to_integral_value()})
    offsets = sorted(COMPLETION_OFFSETS | {int(v) for v in extra.get("days_late_after_grace", ())
                                           if v == v.to_integral_value()})
    completions = [(Decimal(0), None), (Decimal("0.5"), None)] + [(Decimal(1), o) for o in offsets]
    quorums = sorted({1, 2} | {int(v) for v in extra.get("required_approval_quorum", ()) if 0 < v <= 5})
    approvals = [(False, 0, 0)] + [(True, q, c) for q in quorums
                                   for c in sorted(set(range(q + 1)) | set(counts("valid_approval_count")))]
    parameters = [dict(zip(DEFAULTS, values)) for values in product(
        *[sorted({DEFAULTS[name]} | set(extra.get(name, ()))) for name in DEFAULTS])]
    for dispute, rejections, unauthorized, (rate, offset), (required, quorum, count), late_applies, terms in product(
            (False, True), counts("valid_rejection_event_count"), counts("unauthorized_required_event_count"),
            completions, approvals, (False, True), parameters):
        completed = DUE + timedelta(days=GRACE + offset) if offset is not None else None
        days_late = schedule.days_late_after_grace(completed, DUE, GRACE)
        blocked = dispute or rejections > 0 or unauthorized > 0 or rate < 1 or (required and count < quorum)
        bound = {name: None for name, variable in policy.variables.items()
                 if variable["binding"].get("source") in ("milestone", "contract")}
        bound.update(due_date=DUE, grace_period_days=Decimal(GRACE), late_penalty_applicable=late_applies,
                     invoice_required=False, hold_on_open_dispute=True, **terms)
        facts_in = {"open_dispute": dispute, "valid_rejection_event_count": rejections,
                    "unauthorized_required_event_count": unauthorized, "required_event_completion_rate": rate,
                    "valid_approval_count": count, "actual_completion_date": completed,
                    "days_late_after_grace": days_late}
        env = rules.build_env(policy, {"approval_required": required, "quorum": quorum}, bound, facts_in)
        facts = {"open_dispute": dispute, "rejections": rejections, "unauthorized": unauthorized,
                 "completion_rate": str(rate), "approval": f"{count}/{quorum}" if required else "none",
                 "late_penalty_applicable": late_applies, "days_after_deadline": offset,
                 **{name: str(value) for name, value in terms.items() if value != DEFAULTS[name]}}
        yield facts, blocked, env


def first_match(scope_rules, env):
    """Plain first match of the rule table, without the engine's runtime guards: the proof is about the rules."""
    return next((r for r in scope_rules if expressions.evaluate_expr(r["condition_expression"], env)), None)


def check_scope(scope_rules, policy=None):
    """Return (violations, winners, scenario count) for one scope ordered by priority.

    Rules are named by priority so the result of one scope applies to any scope with the same rules.
    """
    policy = policy or load_policy()
    violations, winners, checked = [], set(), 0
    fallback = rules.fallback_rule(scope_rules, policy)
    if not scope_rules or fallback is None or scope_rules[-1] is not fallback:
        violations.append({"code": "NO_FALLBACK", "priority": scope_rules[-1]["priority"] if scope_rules else ""})
    for facts, blocked, env in scenarios(boundaries(scope_rules), policy):
        checked += 1
        try:
            rule = first_match(scope_rules, env)
            penalty, payable = amounts.rule_amounts(rule, env, policy=policy)
        except (ArithmeticError, TypeError, ValueError, KeyError) as error:
            violations.append({"code": "EVALUATION_ERROR", "priority": "", "facts": facts,
                               "detail": f"{type(error).__name__} {error}"})
            continue
        if rule is None:
            continue
        winners.add(rule["priority"])
        problem = None
        if blocked and policy.pays(rule["decision"]):
            problem = "BLOCKED_PAYMENT"
        elif penalty < 0 or payable < 0 or penalty + payable > env["planned_payment_vnd_mn"]:
            problem = "AMOUNT_OUT_OF_RANGE"
        elif not policy.pays(rule["decision"]) and payable != 0:
            problem = "PAYMENT_WHILE_HELD"
        if problem:
            violations.append({"code": problem, "priority": rule["priority"], "facts": facts})
    return violations, winners, checked


def check_rules(rule_rows, policy=None):
    """Safety report of every active scope in ``rule_rows`` (identical scopes are checked once)."""
    policy = policy or load_policy()
    scopes = defaultdict(list)
    for row in rule_rows:
        if str(row.get("active", "TRUE")).upper() == "TRUE":
            scopes[row["release_rule_code"]].append(row)
    report = {"safe": True, "scopes": len(scopes), "scenarios": 0, "violations": [], "unreachable": []}
    seen = {}
    for code, scope in sorted(scopes.items()):
        scope.sort(key=lambda r: int(r["priority"]))
        shape = tuple((r["priority"], r["condition_expression"], r["decision"], r["payable_amount_formula"],
                       r["penalty_amount_formula"]) for r in scope)
        if shape not in seen:
            seen[shape] = check_scope(scope, policy)
        violations, winners, checked = seen[shape]
        rule_id = {r["priority"]: r["rule_id"] for r in scope}
        for violation in violations:
            named = {k: v for k, v in violation.items() if k != "priority"}
            report["violations"].append({**named, "scope": code, "ruleId": rule_id.get(violation["priority"], "")})
        # ELSE is not listed: with well-formed facts the BTC rules 10..70 cover every case, so ELSE is
        # reached only through structural issues and anomalies (BR-15), which are not rule facts.
        fallback = rules.fallback_rule(scope, policy)
        report["unreachable"] += [{"scope": code, "ruleId": r["rule_id"]} for r in scope
                                  if r["priority"] not in winners and r is not fallback]
        report["scenarios"] += checked
    report["safe"] = not report["violations"]
    report["violationCount"] = len(report["violations"])
    report["violations"] = report["violations"][:MAX_REPORTED]
    return report
