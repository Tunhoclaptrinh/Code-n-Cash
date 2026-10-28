"""Verify the public DSL vocabulary against actual runtime facts and an independent money oracle."""
import itertools
import sys
import unittest
from datetime import date, datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'apps/engine'))
sys.path.insert(0, str(ROOT / 'tools'))
import validate_rules as language
import kiem_chung_nghiep_vu as spec
from codecash_engine import expressions
from test_dac_ta_nghiep_vu import Case, PACK, approver

CENT = Decimal('0.01')


class RuntimeContractTests(unittest.TestCase):
    def test_all_variables_match_runtime_values_and_declared_types_on_405_milestones(self):
        observed = set()
        original = expressions.evaluate_expr
        for mid, milestone in PACK.milestones.items():
            calls = []
            def capture(text, env):
                calls.append(dict(env))
                return original(text, env)
            with patch.object(expressions, 'evaluate_expr', side_effect=capture):
                result = spec.evaluate(PACK, mid)
            before, after = calls[-2:]
            self.assertNotIn('penalty_amount_vnd_mn', before)
            self.assertEqual(set(after), set(language.VARIABLES), mid)
            expected = {
                'open_dispute': result['open_dispute'],
                'valid_rejection_event_count': Decimal(result['valid_rejection_count']),
                'unauthorized_required_event_count': Decimal(len(result['unauthorized'])),
                'required_event_completion_rate': Decimal(result['valid_required_event_count']) / result['required_event_count'],
                'approval_required': milestone['approval_required'] == 'TRUE',
                'valid_approval_count': Decimal(result['valid_approval_count']),
                'required_approval_quorum': Decimal(milestone['required_approval_quorum']),
                'late_penalty_applicable': milestone['late_penalty_applicable'] == 'TRUE',
                'actual_completion_date': datetime.fromisoformat(result['completion_ts']).date() if result['completion_ts'] else None,
                'due_date': date.fromisoformat(milestone['due_date']),
                'grace_period_days': Decimal(milestone['grace_period_days']),
                'planned_payment_vnd_mn': Decimal(milestone['planned_payment_vnd_mn']),
                'penalty_amount_vnd_mn': result['penalty'],
                'penalty_rate_pct_per_day': Decimal(milestone['penalty_rate_pct_per_day']),
                'max_penalty_pct': Decimal(milestone['max_penalty_pct']),
                'invoice_required': milestone['invoice_required'] == 'TRUE',
                'hold_on_open_dispute': milestone['hold_on_open_dispute'] == 'TRUE',
                'payment_percent': Decimal(milestone['payment_percent']),
                'contract_value_vnd_mn': Decimal(PACK.contracts[milestone['contract_id']]['contract_value_vnd_mn']),
                'auto_release_allowed': PACK.contracts[milestone['contract_id']]['auto_release_allowed'] == 'TRUE',
            }
            completion = expected['actual_completion_date']
            expected['days_late_after_grace'] = Decimal(max(0, (completion - (expected['due_date'] + timedelta(days=int(expected['grace_period_days'])))).days) if completion else 0)
            expected['all_required_conditions_met'] = (expected['required_event_completion_rate'] == 1 and not expected['unauthorized_required_event_count']
                                                       and (not expected['approval_required'] or expected['valid_approval_count'] >= expected['required_approval_quorum']))
            self.assertEqual(after, expected, mid)
            for name, value in after.items():
                kind = language.VARIABLES[name]['type']
                self.assertTrue((kind == 'number' and type(value) is Decimal and value.is_finite())
                                or (kind == 'boolean' and type(value) is bool)
                                or (kind == 'date' and (value is None or type(value) is date)), (mid, name, value))
            observed.update(after)
        self.assertEqual(observed, set(language.VARIABLES))

    def test_independent_decimal_formula_for_each_official_milestone(self):
        for mid, m in PACK.milestones.items():
            result = spec.evaluate(PACK, mid)
            planned = Decimal(m['planned_payment_vnd_mn'])
            penalty = Decimal('0.00')
            payable = planned if result['decision'] == 'RELEASE' else Decimal('0.00')
            if result['decision'] == 'PENALTY':
                actual = datetime.fromisoformat(result['completion_ts']).date()
                days = max(0, (actual - date.fromisoformat(m['due_date'])).days - int(m['grace_period_days']))
                penalty = min(Decimal(days) * Decimal(m['penalty_rate_pct_per_day']) * planned / 100,
                              Decimal(m['max_penalty_pct']) * planned / 100).quantize(CENT, ROUND_HALF_UP)
                payable = max(Decimal(0), planned - penalty).quantize(CENT, ROUND_HALF_UP)
            self.assertEqual((result['penalty'], result['payable']), (penalty, payable), mid)

    def test_unseen_parameter_matrix_including_zero_rounding_and_caps(self):
        count = 0
        for planned, rate, cap, grace, offset in itertools.product(
                ['0.01', '1.00', '1000.00', '9999999999.99'], ['0.00', '0.01', '0.10', '5.00'],
                ['0.00', '0.01', '8.00', '100.00'], [0, 2], [-1, 0, 1, 3, 365]):
            actual = date(2026, 6, 10) + timedelta(days=grace + offset)
            case = Case(planned=planned, rate=rate, cap=cap, grace=grace).delivered(actual.isoformat())
            result = case.run()
            days = max(0, offset)
            expected_penalty = (min(Decimal(days) * Decimal(rate) * Decimal(planned) / 100,
                                    Decimal(cap) * Decimal(planned) / 100) if days else Decimal(0)).quantize(CENT, ROUND_HALF_UP)
            expected_payable = max(Decimal(0), Decimal(planned) - expected_penalty).quantize(CENT, ROUND_HALF_UP)
            self.assertEqual(result['decision'], 'PENALTY' if days else 'RELEASE')
            self.assertEqual((result['penalty'], result['payable']), (expected_penalty, expected_payable), (planned, rate, cap, grace, offset))
            pack = spec.Pack([case.contract], case.parties, [case.milestone], case.events, PACK.rules)
            self.assertEqual(spec.check_invariants(pack, {'MS9001': result}), [], (planned, rate, cap, grace, offset))
            count += 1
        self.assertEqual(count, 640)

    def test_all_16_scopes_use_their_configured_variables(self):
        prototypes = {m['release_rule_code']: m for m in PACK.milestones.values()}
        self.assertEqual(len(prototypes), 16)
        for scope, prototype in prototypes.items():
            rule_set, mtype = scope.split(':')
            case = Case(required=prototype['required_event_types'], mtype=mtype, rule_set=rule_set,
                        roles=prototype['required_approval_roles'], late_penalty=prototype['late_penalty_applicable'] == 'TRUE',
                        due='2026-06-10', grace=2, planned='1000.00', rate='0.10', cap='8.00')
            for kind in prototype['required_event_types'].split(';'):
                case.ev(kind, Case.BUYER if spec.AUTHORITY[kind] == 'BUYER' else Case.SUPPLIER, '2026-06-15T09:00:00')
            for role in prototype['required_approval_roles'].split(';'):
                if role:
                    case.ev('APPROVAL', approver(Case.BUYER, role), '2026-06-20T09:00:00')
            result = case.run()
            penalized = case.milestone['late_penalty_applicable'] == 'TRUE'
            self.assertEqual(result['decision'], 'PENALTY' if penalized else 'RELEASE', scope)
            self.assertEqual((result['penalty'], result['payable']), (Decimal('3.00'), Decimal('997.00')) if penalized else (Decimal('0.00'), Decimal('1000.00')), scope)
            self.assertEqual(result['completion_ts'], '2026-06-15T09:00:00', 'Later approvals must not change business completion')

    def test_payable_uses_rounded_penalty_not_unrounded_result(self):
        case = Case(planned='1.00', rate='0.50', cap='8.00', grace=0).delivered('2026-06-11')
        result = case.run()
        # 0.005 rounds HALF_UP to 0.01; payable must use that rounded 0.01.
        self.assertEqual((result['raw_penalty'], result['penalty'], result['payable']), (Decimal('0.005'), Decimal('0.01'), Decimal('0.99')))

    def test_runtime_rejects_fractional_days_and_computed_zero_denominator(self):
        with self.assertRaisesRegex(ValueError, 'RULE_NON_INTEGER_DAYS'):
            spec.evaluate_expr('due_date + grace_period_days / 2', {'due_date': date(2026, 1, 1), 'grace_period_days': Decimal(3)})
        self.assertEqual(spec.evaluate_expr('due_date + grace_period_days / 2', {'due_date': date(2026, 1, 1), 'grace_period_days': Decimal(4)}), date(2026, 1, 3))
        with self.assertRaisesRegex(ValueError, 'RULE_DIVISION_BY_ZERO'):
            spec.evaluate_expr('planned_payment_vnd_mn / (required_event_completion_rate - required_event_completion_rate)', {'planned_payment_vnd_mn': Decimal(1000), 'required_event_completion_rate': Decimal(1)})
        self.assertEqual(spec.evaluate_expr('1e-400', {}), Decimal('1e-400'))

    def test_invalid_amounts_and_excess_penalty_are_detected(self):
        case = Case(cap='8.00', grace=0).delivered('2026-06-11')
        pack = spec.Pack([case.contract], case.parties, [case.milestone], case.events, PACK.rules)
        original = case.run()
        for penalty, payable in [('81.00', '919.00'), ('-1.00', '1001.00'), ('NaN', '1000.00')]:
            altered = {**original, 'penalty': Decimal(penalty), 'payable': Decimal(payable)}
            self.assertTrue(spec.check_invariants(pack, {'MS9001': altered}))


if __name__ == '__main__': unittest.main()
