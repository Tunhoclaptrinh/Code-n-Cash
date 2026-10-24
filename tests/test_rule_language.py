"""The editor diagnostics must cover unreachable branches as well as published history."""
import csv
import sys
import unittest
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'apps/engine'))
import validate_rules as language


class RuleLanguageTests(unittest.TestCase):
    def setUp(self):
        with (ROOT / 'BangD-Case4/DataPack-CASE4_SmartContractWorkflow/01_data/payment_rules.csv').open(encoding='utf-8-sig') as stream:
            self.rules = list(csv.DictReader(stream))

    def problem(self, field, value, code):
        self.rules[0][field] = value
        result = language.inspect(self.rules)
        self.assertFalse(result['valid'])
        issue = next(i for i in result['issues'] if i['field'] == field)
        self.assertEqual(issue['code'], code)
        self.assertEqual(issue['ruleId'], 'PR0001')
        self.assertGreaterEqual(issue['line'], 1)
        self.assertGreaterEqual(issue['column'], 1)

    def test_official_rules_and_catalog(self):
        self.assertEqual(language.inspect(self.rules), {'valid': True, 'checked': 384, 'issues': []})
        self.assertEqual(len(language.VARIABLES), 17)
        self.assertEqual(len({v['name'] for v in language.CATALOG['variables']}), 17)

    def test_primitive_types(self):
        self.problem('condition_expression', 'open_dispute == 1', 'TYPE_MISMATCH')
        self.problem('payable_amount_formula', 'TRUE', 'NUMBER_REQUIRED')
        self.problem('penalty_amount_formula', 'due_date - actual_completion_date', 'TYPE_MISMATCH')

    def test_penalty_dependency(self):
        self.problem('condition_expression', 'penalty_amount_vnd_mn > 0', 'VARIABLE_UNAVAILABLE')
        self.problem('penalty_amount_formula', 'penalty_amount_vnd_mn', 'VARIABLE_UNAVAILABLE')
        language.check_expression('MAX(0, planned_payment_vnd_mn - penalty_amount_vnd_mn)', 'payable_amount_formula')

    def test_unknown_variables_in_unreachable_rules(self):
        self.problem('condition_expression', 'FALSE AND hidden_amount > 0', 'UNKNOWN_VARIABLE')
        self.problem('penalty_amount_formula', 'hidden_amount', 'UNKNOWN_VARIABLE')

    def test_unsafe_syntax(self):
        for expr in ['__import__("os")', 'open_dispute.__class__', '1 ** 3', 'TRUE OR FALSE', 'NOT TRUE', 'IF(TRUE,1,0)']:
            with self.assertRaises((ValueError, SyntaxError)):
                language.check_expression(expr, 'condition_expression')
        self.problem('payable_amount_formula', 'True', 'INVALID_CONSTANT')
        self.problem('payable_amount_formula', '0.10000000000000001', 'INVALID_CONSTANT')

    def test_dates_and_fallback(self):
        language.check_expression('actual_completion_date > due_date + grace_period_days', 'condition_expression')
        language.check_expression('ELSE', 'condition_expression', '80')
        self.problem('condition_expression', 'ELSE', 'FALLBACK_ORDER')
        self.problem('payable_amount_formula', '1 / 0', 'DIVISION_BY_ZERO')

    def test_limits_and_history(self):
        # Each published version appends 128 rules; global engine validation has no per-version cap.
        language.validate(self.rules * 2)
        with self.assertRaises(ValueError): language.inspect(self.rules * 2, limit=128)
        with self.assertRaises(ValueError): language.inspect([])
        self.problem('condition_expression', 'x' * 2001, 'EXPRESSION_REQUIRED')

    def test_numeric_comparison_and_boolean_operands(self):
        self.problem('condition_expression', '1', 'BOOLEAN_REQUIRED')
        self.problem('condition_expression', 'TRUE AND 1', 'BOOLEAN_REQUIRED')
        self.problem('payable_amount_formula', 'MIN(TRUE, 1)', 'NUMBER_REQUIRED')
        self.problem('condition_expression', '0 < valid_approval_count < 3', 'INVALID_COMPARISON')


    def test_units_and_percent_conversion(self):
        self.problem('payable_amount_formula', 'planned_payment_vnd_mn + grace_period_days', 'UNIT_MISMATCH')
        self.problem('penalty_amount_formula', 'days_late_after_grace', 'UNIT_MISMATCH')
        self.problem('condition_expression', 'valid_approval_count > grace_period_days', 'UNIT_MISMATCH')
        self.problem('condition_expression', 'actual_completion_date > due_date + max_penalty_pct', 'UNIT_MISMATCH')
        self.problem('penalty_amount_formula', 'max_penalty_pct * planned_payment_vnd_mn', 'PERCENT_CONVERSION_REQUIRED')
        self.problem('condition_expression', 'due_date + 0.5 > actual_completion_date', 'INTEGER_DAYS_REQUIRED')
        self.problem('penalty_amount_formula', '0 - 1', 'NEGATIVE_AMOUNT')
        for expr in ['max_penalty_pct / 100 * planned_payment_vnd_mn',
                     '0.01 * max_penalty_pct * planned_payment_vnd_mn',
                     'planned_payment_vnd_mn * (valid_approval_count / required_approval_quorum)',
                     'MIN(planned_payment_vnd_mn, 1000)', 'MAX(0, planned_payment_vnd_mn - 10)']:
            language.check_expression(expr, 'payable_amount_formula')

    def test_folded_division_by_zero_and_tiny_exact_constant(self):
        self.problem('payable_amount_formula', 'planned_payment_vnd_mn / (100 - 100)', 'DIVISION_BY_ZERO')
        language.check_expression('planned_payment_vnd_mn / 1e-400', 'payable_amount_formula')


if __name__ == '__main__': unittest.main()
