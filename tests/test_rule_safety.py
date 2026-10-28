"""Static safety check of rule sets (apps/engine/codecash_engine/safety.py).

Run from the repository root:  python3 -m unittest tests.test_rule_safety -v
"""
import copy
import json
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'apps/engine'))
from codecash_engine import Pack, DEFAULT_DATA  # noqa: E402
from codecash_engine.safety import check_rules  # noqa: E402

PACK_RULES = Pack.load(DEFAULT_DATA).rules
SCOPE = 'R_GOODS_STD:DELIVERY'


def scope_rules():
    return copy.deepcopy([r for r in PACK_RULES if r['release_rule_code'] == SCOPE])


def by_priority(rows, priority):
    return next(r for r in rows if r['priority'] == str(priority))


class RuleSafetyTests(unittest.TestCase):
    def test_the_organiser_rules_are_safe_and_every_rule_but_else_can_win(self):
        report = check_rules(PACK_RULES)
        self.assertTrue(report['safe'], report['violations'])
        self.assertEqual((report['scopes'], report['violationCount'], report['unreachable']), (16, 0, []))
        self.assertGreater(report['scenarios'], 9000)

    def test_a_penalty_rule_that_ignores_a_blocker_is_caught(self):
        rows = scope_rules()
        by_priority(rows, 10)['condition_expression'] = 'open_dispute == TRUE AND valid_rejection_event_count > 5'
        report = check_rules(rows)
        self.assertFalse(report['safe'])
        violation = report['violations'][0]
        self.assertEqual((violation['code'], violation['ruleId'], violation['facts']['open_dispute']),
                         ('BLOCKED_PAYMENT', by_priority(rows, 60)['rule_id'], True))

    def test_a_rule_that_only_misbehaves_above_an_amount_is_reached_by_boundary_values(self):
        rows = scope_rules()
        by_priority(rows, 10)['condition_expression'] = 'open_dispute == TRUE AND planned_payment_vnd_mn <= 6000'
        report = check_rules(rows)
        self.assertFalse(report['safe'])
        violation = report['violations'][0]
        self.assertEqual((violation['code'], violation['facts']['open_dispute'],
                          violation['facts']['planned_payment_vnd_mn']), ('BLOCKED_PAYMENT', True, '6000.01'))

    def test_amounts_outside_the_planned_payment_are_caught(self):
        rows = scope_rules()
        by_priority(rows, 70)['payable_amount_formula'] = 'planned_payment_vnd_mn * 2'
        self.assertEqual({v['code'] for v in check_rules(rows)['violations']}, {'AMOUNT_OUT_OF_RANGE'})

    def test_a_hold_that_pays_is_caught(self):
        rows = scope_rules()
        by_priority(rows, 40)['payable_amount_formula'] = 'planned_payment_vnd_mn'
        self.assertEqual({v['code'] for v in check_rules(rows)['violations']}, {'PAYMENT_WHILE_HELD'})

    def test_a_scope_without_else_is_caught(self):
        rows = [r for r in scope_rules() if r['priority'] != '80']
        self.assertIn('NO_FALLBACK', {v['code'] for v in check_rules(rows)['violations']})

    def test_a_rule_hidden_behind_an_earlier_one_is_reported_as_unreachable(self):
        rows = scope_rules()
        by_priority(rows, 20)['condition_expression'] = 'valid_rejection_event_count >= 0'
        report = check_rules(rows)
        self.assertTrue(report['safe'])
        self.assertEqual({r['ruleId'] for r in report['unreachable']},
                         {by_priority(rows, p)['rule_id'] for p in (30, 40, 50, 60, 70)})

    def test_the_command_line_prints_the_report(self):
        rows = scope_rules()
        by_priority(rows, 70)['payable_amount_formula'] = 'planned_payment_vnd_mn * 2'
        done = subprocess.run([sys.executable, str(ROOT / 'apps/engine/validate_rules.py'), '--safety'],
                              input=json.dumps(rows), capture_output=True, text=True, encoding='utf-8', check=True)
        report = json.loads(done.stdout)
        self.assertEqual((report['safe'], report['violations'][0]['code']), (False, 'AMOUNT_OUT_OF_RANGE'))


if __name__ == '__main__':
    unittest.main()
