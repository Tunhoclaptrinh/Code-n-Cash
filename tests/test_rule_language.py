"""Contract between the editor vocabulary and the actual server-side DSL validator."""
import csv
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'apps/engine'))
import validate_rules as language


class RuleLanguageTests(unittest.TestCase):
    def rule(self, **overrides):
        return dict(rule_id='TEST', priority='70', condition_expression='open_dispute == FALSE',
                    penalty_amount_formula='0', payable_amount_formula='planned_payment_vnd_mn', **overrides)

    def inspect(self, field, text, priority='70'):
        row = self.rule()
        row[field], row['priority'] = text, priority
        return language.inspect([row])

    def test_all_384_official_expressions_validate(self):
        with (ROOT / 'BangD-Case4/DataPack-CASE4_SmartContractWorkflow/01_data/payment_rules.csv').open(encoding='utf-8-sig') as handle:
            result = language.inspect(list(csv.DictReader(handle)))
        self.assertEqual(result, {'valid': True, 'checked': 384, 'issues': []})

    def test_catalog_is_the_validator_vocabulary(self):
        self.assertEqual(len(language.VARIABLES), 17)
        self.assertEqual(language.NAMES, set(language.VARIABLES) | {'TRUE', 'FALSE', 'MIN', 'MAX'})
        self.assertEqual(language.VARIABLES['penalty_amount_vnd_mn']['fields'], ['payable_amount_formula'])
        self.assertEqual(language.VARIABLES['planned_payment_vnd_mn']['unit'], 'money')

    def test_checks_unreachable_branches_and_reports_rule_and_field(self):
        result = self.inspect('condition_expression', 'FALSE AND unknown_name == 0')
        self.assertFalse(result['valid'])
        self.assertEqual(result['issues'][0]['ruleId'], 'TEST')
        self.assertEqual(result['issues'][0]['field'], 'condition_expression')
        self.assertEqual(result['issues'][0]['code'], 'UNKNOWN_VARIABLE')
        self.assertEqual(result['issues'][0]['token'], 'unknown_name')
        self.assertGreater(result['issues'][0]['column'], 1)

    def test_penalty_is_available_only_after_penalty_calculation(self):
        for field in ['condition_expression', 'penalty_amount_formula']:
            with self.subTest(field=field):
                text = 'penalty_amount_vnd_mn > 0' if field == 'condition_expression' else 'penalty_amount_vnd_mn'
                self.assertEqual(self.inspect(field, text)['issues'][0]['code'], 'VARIABLE_UNAVAILABLE')
        self.assertTrue(self.inspect('payable_amount_formula', 'MAX(0, planned_payment_vnd_mn - penalty_amount_vnd_mn)')['valid'])

    def test_boolean_number_and_date_types_are_distinct(self):
        for field, text, code in [
            ('condition_expression', '1000', 'BOOLEAN_REQUIRED'),
            ('penalty_amount_formula', 'TRUE', 'NUMBER_REQUIRED'),
            ('condition_expression', 'TRUE AND 1', 'BOOLEAN_REQUIRED'),
            ('condition_expression', 'due_date == TRUE', 'TYPE_MISMATCH'),
            ('payable_amount_formula', 'due_date + grace_period_days', 'NUMBER_REQUIRED'),
            ('condition_expression', 'actual_completion_date - due_date > 2', 'TYPE_MISMATCH'),
        ]:
            with self.subTest(text=text):
                self.assertEqual(self.inspect(field, text)['issues'][0]['code'], code)
        self.assertTrue(self.inspect('condition_expression', 'actual_completion_date > due_date + grace_period_days')['valid'])

    def test_dsl_does_not_allow_general_python_or_javascript(self):
        for text in ['TRUE OR FALSE', 'not TRUE', 'x.value', '__import__("os")', 'planned_payment_vnd_mn ** 2', 'MIN()', 'MIN(0, key=2)', 'True', '1e999', '"hello"']:
            with self.subTest(text=text):
                self.assertFalse(self.inspect('payable_amount_formula', text)['valid'])

    def test_else_and_zero_division_have_actionable_diagnostics(self):
        self.assertTrue(self.inspect('condition_expression', 'ELSE', '80')['valid'])
        self.assertEqual(self.inspect('condition_expression', 'ELSE', '10')['issues'][0]['code'], 'FALLBACK_ORDER')
        self.assertEqual(self.inspect('payable_amount_formula', '1 / 0')['issues'][0]['code'], 'DIVISION_BY_ZERO')
        self.assertEqual(self.inspect('condition_expression', '(')['issues'][0]['code'], 'SYNTAX_ERROR')

    def test_bounded_input_and_multiple_field_errors(self):
        with self.assertRaises(ValueError):
            language.inspect([])
        with self.assertRaises(ValueError):
            language.inspect([self.rule()] * 129, limit=128)
        self.assertTrue(language.inspect([self.rule()] * 256)["valid"])
        result = language.inspect([dict(self.rule(), condition_expression='', penalty_amount_formula='oops')])
        self.assertEqual(len(result['issues']), 2)
        self.assertFalse(self.inspect('payable_amount_formula', '1' * 2001)['valid'])


if __name__ == '__main__':
    unittest.main()
