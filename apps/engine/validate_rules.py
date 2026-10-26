"""Type-check every DSL branch without execution, sharing the UI vocabulary."""
import ast
import json
import sys
from pathlib import Path

CATALOG = json.loads(Path(__file__).with_name('rule_language.json').read_text(encoding='utf-8'))
VARIABLES = {row['name']: row for row in CATALOG['variables']}
FIELDS = tuple(CATALOG['fields'])
ALLOWED = (ast.Expression, ast.BoolOp, ast.And, ast.Compare, ast.Eq, ast.NotEq,
           ast.Lt, ast.LtE, ast.Gt, ast.GtE, ast.BinOp, ast.Add, ast.Sub,
           ast.Mult, ast.Div, ast.Call, ast.Name, ast.Load, ast.Constant)


class ExpressionProblem(ValueError):
    def __init__(self, code, node=None, token=None):
        super().__init__(code)
        self.code, self.node, self.token = code, node, token


from dataclasses import dataclass
from decimal import Decimal, DecimalException

# Dimensions: money (million VND), calendar days, counts, unconverted percent.
SCALAR = (0, 0, 0, 0)
MONEY = (1, 0, 0, 0)
DAYS = (0, 1, 0, 0)
COUNT = (0, 0, 1, 0)
PERCENT = (0, 0, 0, 1)
UNIT_DIMENSIONS = {'money': MONEY, 'days': DAYS, 'count': COUNT,
                   'ratio': SCALAR, 'percent': PERCENT, 'percentPerDay': (0, -1, 0, 1)}


@dataclass(frozen=True)
class Measure:
    kind: str
    dimension: tuple = SCALAR
    constant: object = None


def compatible(left, right, node):
    # Bare numeric constants inherit the unit of the quantity they are added/compared to.
    if left.constant is not None:
        return right.dimension
    if right.constant is not None:
        return left.dimension
    if left.dimension != right.dimension:
        raise ExpressionProblem('UNIT_MISMATCH', node)
    return left.dimension


def measure(node):
    if isinstance(node, ast.Expression):
        return measure(node.body)
    if isinstance(node, ast.Constant):
        return Measure('number', constant=node.decimal_value)
    if isinstance(node, ast.Name):
        if node.id in ('TRUE', 'FALSE'):
            return Measure('boolean')
        variable = VARIABLES[node.id]
        return Measure(variable['type'], UNIT_DIMENSIONS.get(variable['unit'], SCALAR))
    if isinstance(node, ast.BoolOp):
        for child in node.values:
            measure(child)
        return Measure('boolean')
    if isinstance(node, ast.Compare):
        left, right = measure(node.left), measure(node.comparators[0])
        if left.kind == 'number':
            compatible(left, right, node)
        return Measure('boolean')
    if isinstance(node, ast.BinOp):
        left, right = measure(node.left), measure(node.right)
        if left.kind == 'date':
            if right.constant is not None:
                if right.constant != right.constant.to_integral_value():
                    raise ExpressionProblem('INTEGER_DAYS_REQUIRED', node.right)
            elif right.dimension != DAYS:
                raise ExpressionProblem('UNIT_MISMATCH', node.right)
            return Measure('date')
        if isinstance(node.op, (ast.Add, ast.Sub)):
            dimension = compatible(left, right, node)
        elif isinstance(node.op, ast.Mult):
            dimension = tuple(a + b for a, b in zip(left.dimension, right.dimension))
            # 0.01 * percent is equivalent to percent / 100.
            if dimension[3] > 0 and (left.constant == Decimal('0.01') or right.constant == Decimal('0.01')):
                dimension = (*dimension[:3], dimension[3] - 1)
        else:
            if right.constant == 0:
                raise ExpressionProblem('DIVISION_BY_ZERO', node.right)
            dimension = tuple(a - b for a, b in zip(left.dimension, right.dimension))
            if right.constant == 100 and dimension[3] > 0:
                dimension = (*dimension[:3], dimension[3] - 1)
        constant = None
        if left.constant is not None and right.constant is not None:
            operations = {ast.Add: lambda: left.constant + right.constant,
                          ast.Sub: lambda: left.constant - right.constant,
                          ast.Mult: lambda: left.constant * right.constant,
                          ast.Div: lambda: left.constant / right.constant}
            try:
                constant = operations[type(node.op)]()
                if not constant.is_finite():
                    raise ExpressionProblem('INVALID_CONSTANT', node)
            except DecimalException as error:
                raise ExpressionProblem('INVALID_CONSTANT', node) from error
        return Measure('number', dimension, constant)
    if isinstance(node, ast.Call):
        args = [measure(arg) for arg in node.args]
        result = next((arg for arg in args if arg.constant is None), args[0])
        for arg in args:
            compatible(result, arg, node)
        constant = None
        if all(arg.constant is not None for arg in args):
            constant = (min if node.func.id == 'MIN' else max)(arg.constant for arg in args)
        return Measure('number', result.dimension, constant)
    raise ExpressionProblem('UNSUPPORTED_EXPRESSION', node)

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
        if type(node.value) not in (int, float) or not hasattr(node, 'decimal_value'):
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
    source = text.replace(' AND ', ' and ')
    tree = ast.parse(source, mode='eval')
    nodes = list(ast.walk(tree))
    if len(nodes) > 512:
        raise ExpressionProblem('EXPRESSION_TOO_COMPLEX')
    for node in nodes:
        if not isinstance(node, ALLOWED):
            raise ExpressionProblem('UNSUPPORTED_EXPRESSION', node)
        if isinstance(node, ast.Constant):
            literal = ast.get_source_segment(source, node) or ''
            if type(node.value) not in (int, float) or not literal or len(literal) > 16:
                raise ExpressionProblem('INVALID_CONSTANT', node)
            try:
                node.decimal_value = Decimal(literal)
                if not node.decimal_value.is_finite():
                    raise ExpressionProblem('INVALID_CONSTANT', node)
            except DecimalException as error:
                raise ExpressionProblem('INVALID_CONSTANT', node) from error
    actual = expression_type(tree, field)
    expected = 'boolean' if field == 'condition_expression' else 'number'
    if actual != expected:
        raise ExpressionProblem('BOOLEAN_REQUIRED' if expected == 'boolean' else 'NUMBER_REQUIRED', tree.body)
    result = measure(tree)
    if field != 'condition_expression' and result.constant is not None and result.constant < 0:
        raise ExpressionProblem('NEGATIVE_AMOUNT', tree.body)
    if field != 'condition_expression' and result.constant is None and result.dimension != MONEY:
        raise ExpressionProblem('PERCENT_CONVERSION_REQUIRED' if result.dimension[3] else 'UNIT_MISMATCH', tree.body)


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
        elif '--safety' in sys.argv:
            # Static safety proof (codecash_engine/safety.py) of rules that already type-check.
            from codecash_engine.safety import check_rules
            candidate = json.load(sys.stdin)
            validate(candidate)
            print(json.dumps(check_rules(candidate)))
        else:
            validate(json.load(sys.stdin))
            print('OK')
    except (ValueError, SyntaxError, KeyError, TypeError, RecursionError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(2)
