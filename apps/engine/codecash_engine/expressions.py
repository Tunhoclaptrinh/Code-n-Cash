"""Rule expression evaluator.

Input: the text of a ``condition_expression`` / ``penalty_amount_formula`` / ``payable_amount_formula``
and an environment dict of rule variables.
Output: a bool, Decimal, date or None. Whitelisted AST only (never ``eval``); numbers are read from
the source token as Decimal, never through a binary float.
Business rules: BR-02 (rules are data, evaluated in priority order) and BR-12 (money formulas).
"""
import ast
import operator
from datetime import date, timedelta
from decimal import Decimal

_CMP = {ast.Eq: operator.eq, ast.NotEq: operator.ne, ast.Lt: operator.lt,
        ast.LtE: operator.le, ast.Gt: operator.gt, ast.GtE: operator.ge}
_ARITH = {ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul, ast.Div: operator.truediv}


def _eval(node, env, source=None):
    if isinstance(node, ast.Expression):
        return _eval(node.body, env, source)
    if isinstance(node, ast.BoolOp) and isinstance(node.op, ast.And):
        return all(_eval(v, env, source) for v in node.values)
    if isinstance(node, ast.Compare) and len(node.ops) == 1:
        left, right = _eval(node.left, env, source), _eval(node.comparators[0], env, source)
        if left is None or right is None:
            return False
        return _CMP[type(node.ops[0])](left, right)
    if isinstance(node, ast.BinOp) and type(node.op) in _ARITH:
        left, right = _eval(node.left, env, source), _eval(node.right, env, source)
        if left is None or right is None:
            return None
        if isinstance(left, date) and isinstance(node.op, ast.Add):
            if not isinstance(right, Decimal) or not right.is_finite() or right != right.to_integral_value():
                raise ValueError("RULE_NON_INTEGER_DAYS")
            return left + timedelta(days=int(right))
        if isinstance(node.op, ast.Div) and right == 0:
            raise ValueError("RULE_DIVISION_BY_ZERO")
        return _ARITH[type(node.op)](left, right)
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in ("MIN", "MAX"):
        args = [_eval(a, env, source) for a in node.args]
        return min(args) if node.func.id == "MIN" else max(args)
    if isinstance(node, ast.Name):
        if node.id in ("TRUE", "FALSE"):
            return node.id == "TRUE"
        return env[node.id]
    if isinstance(node, ast.Constant) and type(node.value) in (int, float):
        # Read the original token, never round it through a binary float.
        token = ast.get_source_segment(source, node) if source is not None else str(node.value)
        value = Decimal(token)
        if not value.is_finite():
            raise ValueError("RULE_NON_FINITE_NUMBER")
        return value
    raise ValueError(f"Biểu thức không được hỗ trợ: {ast.dump(node)}")


def evaluate_expr(text, env):
    """Evaluate one rule expression against ``env``; the literal ``ELSE`` is always true."""
    if text.strip() == "ELSE":
        return True
    source = text.replace(" AND ", " and ")
    return _eval(ast.parse(source, mode="eval"), env, source)
