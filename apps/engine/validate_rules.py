"""Type-check every DSL branch without execution, sharing the UI vocabulary."""
import ast
import json
import math
import sys
from pathlib import Path

CATALOG = json.loads(Path(__file__).with_name('rule_language.json').read_text())
VARIABLES = {row['name']: row for row in CATALOG['variables']}
FIELDS = tuple(CATALOG['fields'])
ALLOWED = (ast.Expression, ast.BoolOp, ast.And, ast.Compare, ast.Eq, ast.NotEq,
           ast.Lt, ast.LtE, ast.Gt, ast.GtE, ast.BinOp, ast.Add, ast.Sub,
           ast.Mult, ast.Div, ast.Call, ast.Name, ast.Load, ast.Constant)


class ExpressionProblem(ValueError):
    def __init__(self, code, node=None, token=None):
        super().__init__(code)
        self.code, self.node, self.token = code, node, token


def expression_type(node, field):
    if isinstance(node, ast.Expression):
        return expression_type(node.body, field)
    if isinstance(node, ast.Name):
        if node.id in ('TRUE', 'FALSE'):
            return 'boolean'
        variable = VARIABLES.get(node.id)
        if variable is None:
            raise ExpressionProblem('UNKNOWN_VARIABLE', node, node.id)
        if field not in variable['fields']:
            raise ExpressionProblem('VARIABLE_UNAVAILABLE', node, node.id)
        return variable['type']
    if isinstance(node, ast.Constant):
        if (type(node.value) not in (int, float) or len(str(node.value)) > 16
                or (isinstance(node.value, float) and not math.isfinite(node.value))):
            raise ExpressionProblem('INVALID_CONSTANT', node)
        return 'number'
    if isinstance(node, ast.BoolOp):
        if any(expression_type(value, field) != 'boolean' for value in node.values):
            raise ExpressionProblem('BOOLEAN_REQUIRED', node)
        return 'boolean'
    if isinstance(node, ast.Compare):
        if len(node.ops) != 1:
            raise ExpressionProblem('INVALID_COMPARISON', node)
        left, right = expression_type(node.left, field), expression_type(node.comparators[0], field)
        if left != right or (left == 'boolean' and not isinstance(node.ops[0], (ast.Eq, ast.NotEq))):
            raise ExpressionProblem('TYPE_MISMATCH', node)
        return 'boolean'
    if isinstance(node, ast.BinOp):
        left, right = expression_type(node.left, field), expression_type(node.right, field)
        if left == 'date' and right == 'number' and isinstance(node.op, ast.Add):
            return 'date'
        if left != 'number' or right != 'number':
            raise ExpressionProblem('TYPE_MISMATCH', node)
        if isinstance(node.op, ast.Div) and isinstance(node.right, ast.Constant) and node.right.value == 0:
            raise ExpressionProblem('DIVISION_BY_ZERO', node.right)
        return 'number'
    if isinstance(node, ast.Call):
        if (not isinstance(node.func, ast.Name) or node.func.id not in ('MIN', 'MAX')
                or node.keywords or not 1 <= len(node.args) <= 8):
            raise ExpressionProblem('INVALID_FUNCTION', node)
        if any(expression_type(value, field) != 'number' for value in node.args):
            raise ExpressionProblem('NUMBER_REQUIRED', node)
        return 'number'
    raise ExpressionProblem('UNSUPPORTED_EXPRESSION', node)


def check_expression(text, field, priority=None):
    if not isinstance(text, str) or not text.strip() or len(text) > 2000:
        raise ExpressionProblem('EXPRESSION_REQUIRED')
    if text.strip() == 'ELSE' and field == 'condition_expression':
        if priority is not None and str(priority) != '80':
            raise ExpressionProblem('FALLBACK_ORDER')
        return
    tree = ast.parse(text.replace(' AND ', ' and '), mode='eval')
    nodes = list(ast.walk(tree))
    if len(nodes) > 512:
        raise ExpressionProblem('EXPRESSION_TOO_COMPLEX')
    for node in nodes:
        if not isinstance(node, ALLOWED):
            raise ExpressionProblem('UNSUPPORTED_EXPRESSION', node)
        if isinstance(node, ast.Constant) and len(ast.get_source_segment(text.replace(' AND ', ' and '), node) or '') > 16:
            raise ExpressionProblem('INVALID_CONSTANT', node)
    actual = expression_type(tree, field)
    expected = 'boolean' if field == 'condition_expression' else 'number'
    if actual != expected:
        raise ExpressionProblem('BOOLEAN_REQUIRED' if expected == 'boolean' else 'NUMBER_REQUIRED', tree.body)


def inspect(rules, limit=None):
    if (not isinstance(rules, list) or not rules or (limit is not None and len(rules) > limit)
            or any(not isinstance(row, dict) for row in rules)):
        raise ValueError('INVALID_RULE_INPUT')
    issues = []
    for index, rule in enumerate(rules):
        for field in FIELDS:
            try:
                check_expression(rule.get(field), field, rule.get('priority'))
            except (ExpressionProblem, SyntaxError, RecursionError) as error:
                node = getattr(error, 'node', None)
                issues.append({
                    'ruleId': str(rule.get('rule_id', index)), 'field': field,
                    'code': getattr(error, 'code', 'EXPRESSION_TOO_COMPLEX' if isinstance(error, RecursionError) else 'SYNTAX_ERROR'),
                    'token': getattr(error, 'token', None),
                    'line': getattr(node, 'lineno', getattr(error, 'lineno', 1)) or 1,
                    'column': getattr(node, 'col_offset', 0) + 1 if node is not None else (getattr(error, 'offset', 1) or 1),
                })
    return {'valid': not issues, 'checked': len(rules) * len(FIELDS), 'issues': issues}


def validate(rules):
    result = inspect(rules)
    if not result['valid']:
        raise ValueError(result['issues'][0]['code'])


if __name__ == '__main__':
    try:
        if '--inspect' in sys.argv:
            print(json.dumps(inspect(json.load(sys.stdin), limit=128)))
        else:
            validate(json.load(sys.stdin))
            print('OK')
    except (ValueError, SyntaxError, KeyError, TypeError, RecursionError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(2)
