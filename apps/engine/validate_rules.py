"""Validate every rule expression before execution, including normally short-circuited branches."""
import ast
import json
import sys

ALLOWED = (ast.Expression, ast.BoolOp, ast.And, ast.Compare, ast.Eq, ast.NotEq,
           ast.Lt, ast.LtE, ast.Gt, ast.GtE, ast.BinOp, ast.Add, ast.Sub,
           ast.Mult, ast.Div, ast.Call, ast.Name, ast.Load, ast.Constant)
NAMES = set('TRUE FALSE MIN MAX open_dispute valid_rejection_event_count '
            'unauthorized_required_event_count required_event_completion_rate '
            'approval_required valid_approval_count required_approval_quorum '
            'late_penalty_applicable actual_completion_date due_date grace_period_days '
            'all_required_conditions_met planned_payment_vnd_mn penalty_amount_vnd_mn '
            'days_late_after_grace penalty_rate_pct_per_day max_penalty_pct'.split())


def validate(rules):
    for rule in rules:
        for key in ('condition_expression', 'payable_amount_formula', 'penalty_amount_formula'):
            text = rule[key]
            if text == 'ELSE' and key == 'condition_expression':
                continue
            tree = ast.parse(text.replace(' AND ', ' and '), mode='eval')
            for node in ast.walk(tree):
                if not isinstance(node, ALLOWED):
                    raise ValueError('UNSUPPORTED_EXPRESSION')
                if isinstance(node, ast.Name) and node.id not in NAMES:
                    raise ValueError('UNKNOWN_VARIABLE')
                if isinstance(node, ast.Call) and (not isinstance(node.func, ast.Name)
                    or node.func.id not in ('MIN', 'MAX') or node.keywords or not 1 <= len(node.args) <= 8):
                    raise ValueError('INVALID_FUNCTION')
                if isinstance(node, ast.Constant) and (not isinstance(node.value, (int, float))
                    or len(str(node.value)) > 16):
                    raise ValueError('INVALID_CONSTANT')
                if isinstance(node, ast.Compare) and len(node.ops) != 1:
                    raise ValueError('INVALID_COMPARISON')


if __name__ == '__main__':
    try:
        validate(json.load(sys.stdin))
        print('OK')
    except (ValueError, SyntaxError, KeyError, TypeError, RecursionError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(2)
