"""The engine is driven by its policy pack: new event types, rule scopes, guards and readings without code changes.

Run from the repository root:  python3 -m unittest discover -s tests -p "test_policy_engine.py" -v
"""
import copy
import json
import subprocess
import sys
import tempfile
import unittest
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'apps/engine'))
sys.path.insert(0, str(ROOT / 'tests'))
from codecash_engine import Pack, Policy, PolicyError, evaluate, expressions, load_policy  # noqa: E402
from codecash_engine.expressions import ExpressionError, compile_fact, compile_record  # noqa: E402
from test_engine_stages import CONTRACT, MILESTONE, PARTIES, PipelineTests, event, rule  # noqa: E402

POLICY = load_policy()
DOCUMENT = json.loads((ROOT / 'apps/engine/policy/case4_btc.json').read_text(encoding='utf-8'))


def policy_with(change):
    document = copy.deepcopy(DOCUMENT)
    change(document)
    return Policy(document)


def complete_events():
    return [event('E1', 'DELIVERY', 'S1', '2026-01-03T08:00:00'), event('E2', 'ACCEPTANCE', 'B1', '2026-01-09T17:30:00'),
            event('P1', 'APPROVAL', 'A1', '2026-01-10T09:00:00'), event('P2', 'APPROVAL', 'A3', '2026-01-10T10:00:00')]


def run(rows, scope=None, milestone=MILESTONE, **kw):
    scope = scope or PipelineTests.scope()
    rule_rows = [dict(r, release_rule_code=milestone['release_rule_code'], active='TRUE') for r in scope]
    return evaluate(Pack([CONTRACT], PARTIES.values(), [milestone], rows, rule_rows), milestone['milestone_id'], **kw)


def replace(scope, at, **changes):
    """The scope with the rule at priority ``at`` changed."""
    return [dict(r, **changes) if r['priority'] == str(at) else r for r in scope]


class PolicyDocumentTests(unittest.TestCase):
    def test_the_official_policy_compiles_and_describes_its_vocabulary(self):
        described = POLICY.describe()
        self.assertEqual((described['policyId'], described['version']), ('CASE4_BTC', '2.0.0'))
        self.assertEqual(described['eventTypes']['DELIVERY'], {'name': 'DELIVERY', 'category': 'EVIDENCE',
                                                               'side': 'SUPPLIER', 'valid_status': 'CONFIRMED'})
        self.assertEqual(described['reasons']['APPROVAL_QUORUM_NOT_MET'], 'WAITING_APPROVAL')
        self.assertEqual(described['profiles'], {'BTC_SUBMISSION': [], 'WORKFLOW': ['strict_resolution']})
        self.assertEqual(len(POLICY.hash), 64)

    def test_every_problem_of_a_broken_policy_is_reported(self):
        def break_it(d):
            d['event_types']['DELIVERY']['category'] = 'PAYMENT'
            d['event_types']['ACCEPTANCE']['side'] = 'BANK'
            d['categories']['APPROVAL']['authority'] = "actor.favourite_colour == 'BLUE'"
            d['reasons']['OPEN_DISPUTE']['status'] = 'FROZEN'
            d['readings']['A05']['switch'] = 'nowhere'
            d['guards']['payment'].append('no_such_variable == TRUE')
            d['disputes']['scope'] = 'PORTFOLIO'
        with self.assertRaises(PolicyError) as caught:
            policy_with(break_it)
        problems = '\n'.join(caught.exception.problems)
        for expected in ('event_types.DELIVERY.category', 'event_types.ACCEPTANCE.side',
                         'POLICY_UNKNOWN_ATTRIBUTE: actor.favourite_colour', 'reasons.OPEN_DISPUTE.status',
                         'readings.A05.switch', 'biến không có: no_such_variable', 'disputes.scope'):
            self.assertIn(expected, problems)

    def test_a_definition_cycle_is_rejected(self):
        def loop(d):
            d['definitions']['a'] = 'b'
            d['definitions']['b'] = 'a'
            d['categories']['DISPUTE_OPEN']['authority'] = 'a'
        with self.assertRaises(PolicyError) as caught:
            policy_with(loop)
        self.assertIn('POLICY_DEFINITION_CYCLE', '\n'.join(caught.exception.problems))

    def test_variants_are_cached_and_hashed_by_content(self):
        workflow = POLICY.variant(['strict_resolution'])
        self.assertIs(workflow, POLICY.variant(['strict_resolution']))
        self.assertNotEqual(workflow.hash, POLICY.hash)
        self.assertIs(POLICY.variant([]), POLICY)
        self.assertEqual(POLICY.variant(rounding='ROUND_HALF_EVEN').hash, POLICY.variant(['rounding_half_even']).hash)


class DynamicVocabularyTests(unittest.TestCase):
    def test_a_new_event_type_is_policy_data(self):
        milestone = dict(MILESTONE, required_event_types='DELIVERY;TRAINING_DONE',
                         required_condition='EVENT:DELIVERY AND EVENT:TRAINING_DONE AND APPROVAL_QUORUM:2 AND NO_OPEN_DISPUTE')
        rows = [r for r in complete_events() if r['event_type'] != 'ACCEPTANCE'] + [
            event('E5', 'TRAINING_DONE', 'S1', '2026-01-08T09:00:00')]
        before = run(rows, milestone=milestone)
        self.assertEqual((before['decision'], before['reason_code']), ('HOLD', 'UNAUTHORIZED_EVENT'))
        self.assertIn('E5: event_type lạ', before['issues'])

        def add(d):
            d['event_types']['TRAINING_DONE'] = {'category': 'EVIDENCE', 'side': 'SUPPLIER', 'valid_status': 'CONFIRMED'}
        extended = policy_with(add)
        after = run(rows, milestone=milestone, policy=extended)
        self.assertEqual((after['decision'], after['payable'], after['issues']), ('RELEASE', Decimal('100.00'), []))
        self.assertIn('E5', after['evidence'])
        by_buyer = run(rows[:-1] + [event('E5', 'TRAINING_DONE', 'B1', '2026-01-08T09:00:00')], milestone=milestone,
                       policy=extended)
        self.assertEqual((by_buyer['reason_code'], by_buyer['unauthorized']), ('UNAUTHORIZED_EVENT', ['E5']))

    def test_authority_per_category_is_a_predicate_of_the_policy(self):
        # Only finance approvers may approve payments: the contract owner's approval no longer counts.
        def finance_only(d):
            d['categories']['APPROVAL']['authority'] = "buyer_approver AND actor.approval_role == 'FINANCE'"
        result = run(complete_events(), policy=policy_with(finance_only))
        self.assertEqual((result['reason_code'], result['valid_approval_count']), ('APPROVAL_QUORUM_NOT_MET', 1))

    def test_a_new_milestone_cell_is_a_rule_variable_through_its_binding(self):
        scope = sorted(PipelineTests.scope() + [rule(65, 'payment_percent > 50', 'HOLD', 'APPROVAL_QUORUM_NOT_MET')],
                       key=lambda r: int(r['priority']))
        large = run(complete_events(), scope=scope, milestone=dict(MILESTONE, payment_percent='60.00'))
        small = run(complete_events(), scope=scope, milestone=dict(MILESTONE, payment_percent='20.00'))
        self.assertEqual((large['rule_id'], large['decision']), ('PR65', 'HOLD'))
        self.assertEqual((small['rule_id'], small['decision']), ('PR70', 'RELEASE'))
        self.assertEqual(large['variables']['payment_percent'], Decimal('60.00'))

    def test_a_derived_fact_is_policy_data(self):
        def owner_must_approve(d):
            d['derived_facts']['all_required_conditions_met'] += ' AND valid_approval_count >= 2'
        rows = [r for r in complete_events() if r['event_id'] != 'P2']
        milestone = dict(MILESTONE, required_approval_roles='CONTRACT_OWNER', required_approval_quorum='1')
        self.assertEqual(run(rows, milestone=milestone)['decision'], 'RELEASE')
        result = run(rows, milestone=milestone, policy=policy_with(owner_must_approve))
        self.assertEqual((result['decision'], result['reason_code']), ('HOLD', 'UNRESOLVED_CONDITION'))


class SafetyTests(unittest.TestCase):
    def test_a_rule_that_pays_too_early_is_stopped_by_the_payment_guard(self):
        scope = replace(PipelineTests.scope(), 70, priority='5', condition_expression='TRUE')
        scope = sorted(scope, key=lambda r: int(r['priority']))
        disputed = complete_events() + [event('D1', 'DISPUTE_OPENED', 'S1', '2026-01-11T09:00:00')]
        result = run(disputed, scope=scope)
        self.assertEqual((result['decision'], result['reason_code'], result['payable']),
                         ('HOLD', 'UNRESOLVED_CONDITION', Decimal('0.00')))
        self.assertEqual(result['selection'], 'PAYMENT_GUARD_FALLBACK')
        self.assertIn('PR70: luật trả tiền khi chưa đạt điều kiện an toàn: '
                      'open_dispute == FALSE OR hold_on_open_dispute == FALSE', result['issues'])
        clean = run(complete_events(), scope=scope)
        self.assertEqual((clean['decision'], clean['selection']), ('RELEASE', 'FIRST_MATCH'))

    def test_hold_on_open_dispute_false_lets_a_rule_pay_with_an_open_dispute(self):
        scope = replace(PipelineTests.scope(), 10, condition_expression='open_dispute == TRUE AND hold_on_open_dispute == TRUE')
        scope = replace(scope, 70, condition_expression='all_required_conditions_met == TRUE AND valid_rejection_event_count == 0')
        disputed = complete_events() + [event('D1', 'DISPUTE_OPENED', 'S1', '2026-01-11T09:00:00')]
        self.assertEqual(run(disputed, scope=scope)['decision'], 'HOLD')
        released = run(disputed, scope=scope, milestone=dict(MILESTONE, hold_on_open_dispute='FALSE'))
        self.assertEqual((released['decision'], released['open_dispute']), ('RELEASE', True))

    def test_a_rule_that_cannot_be_evaluated_holds_only_its_milestone(self):
        scope = replace(PipelineTests.scope(), 30, condition_expression='planned_payment_vnd_mn / valid_approval_count > 1')
        result = run([event('E1', 'DELIVERY', 'S1')], scope=scope)  # no approval yet: division by zero
        self.assertEqual((result['decision'], result['selection']), ('HOLD', 'RULE_ERROR_FALLBACK'))
        self.assertIn('PR30: RULE_DIVISION_BY_ZERO', result['issues'])
        self.assertEqual(result['rule_trace'][-1], {'rule_id': 'PR30', 'priority': '30', 'error': 'RULE_DIVISION_BY_ZERO'})

    def test_an_amount_outside_the_decision_contract_is_never_paid(self):
        scope = replace(PipelineTests.scope(), 70, payable_amount_formula='planned_payment_vnd_mn * 2')
        result = run(complete_events(), scope=scope)
        self.assertEqual((result['decision'], result['payable'], result['selection']),
                         ('HOLD', Decimal('0.00'), 'AMOUNT_GUARD_FALLBACK'))
        self.assertIn('PR70: số tiền không đạt kiểm tra: payable_amount_vnd_mn == planned_payment_vnd_mn', result['issues'])

    def test_a_safety_intervention_is_also_an_invariant_violation(self):
        from codecash_engine import check_invariants
        scope = replace(PipelineTests.scope(), 70, payable_amount_formula='planned_payment_vnd_mn * 2')
        rule_rows = [dict(r, release_rule_code=MILESTONE['release_rule_code'], active='TRUE') for r in scope]
        pack = Pack([CONTRACT], PARTIES.values(), [MILESTONE], complete_events(), rule_rows)
        violations = check_invariants(pack, {'M1': evaluate(pack, 'M1')})
        self.assertEqual(len(violations), 1)
        self.assertTrue(violations[0].startswith('M1: chốt an toàn phải giữ mốc (AMOUNT_GUARD_FALLBACK)'))

    def test_rule_trace_and_variables_explain_the_decision(self):
        result = run(complete_events())
        self.assertEqual([step['rule_id'] for step in result['rule_trace']], ['PR10', 'PR20', 'PR30', 'PR40', 'PR50', 'PR60', 'PR70'])
        self.assertEqual([step['matched'] for step in result['rule_trace']], [False] * 6 + [True])
        self.assertEqual(result['variables']['actual_completion_date'], '2026-01-09')
        self.assertIs(result['variables']['all_required_conditions_met'], True)


class ProfileTests(unittest.TestCase):
    def test_the_workflow_profile_applies_its_switches(self):
        opened = event('D1', 'DISPUTE_OPENED', 'S1', '2026-01-11T09:00:00')
        by_supplier = event('D2', 'DISPUTE_RESOLVED', 'S1', '2026-01-12T09:00:00', reference_event_id='D1')
        rows = complete_events() + [opened, by_supplier]
        self.assertEqual(run(rows)['decision'], 'RELEASE')
        self.assertEqual(run(rows, profile='WORKFLOW')['reason_code'], 'OPEN_DISPUTE')
        self.assertEqual(run(rows, strict_resolution=True)['reason_code'], 'OPEN_DISPUTE')
        with self.assertRaisesRegex(ValueError, 'UNKNOWN_PROFILE'):
            run(rows, profile='NOPE')


class ExpressionDialectTests(unittest.TestCase):
    SPACES = {'event': None, 'actor': None, 'state': None}

    def record(self, text, scope):
        return compile_record(text, {}, self.SPACES)(scope)

    def test_record_predicates_read_cells_lists_and_missing_values(self):
        actor = {'status': 'ACTIVE', 'allowed_event_types': 'APPROVAL;REJECTION', 'can_approve_payment': 'TRUE'}
        self.assertTrue(self.record("actor.status == 'ACTIVE' AND 'REJECTION' IN actor.allowed_event_types", {'actor': actor}))
        self.assertTrue(self.record("actor.can_approve_payment == TRUE", {'actor': actor}))
        self.assertTrue(self.record("'DISPUTE' NOT IN actor.allowed_event_types", {'actor': actor}))
        # A missing actor makes every comparison false, so NOT is needed to say "not authorized".
        self.assertFalse(self.record("actor.status == 'ACTIVE'", {'actor': None}))
        self.assertFalse(self.record("actor.status != 'ACTIVE'", {'actor': None}))
        self.assertTrue(self.record("NOT actor.exists", {'actor': None}))
        self.assertTrue(self.record("state.count >= 2", {'state': {'count': 2}}))

    def test_keywords_inside_string_literals_are_left_alone(self):
        self.assertTrue(self.record("event.note == 'A AND B OR NOT IN'", {'event': {'note': 'A AND B OR NOT IN'}}))

    def test_non_boolean_cells_are_refused_in_boolean_context(self):
        with self.assertRaises(ExpressionError):
            self.record("actor.status", {'actor': {'status': 'ACTIVE'}})

    def test_unknown_namespaces_and_code_are_rejected(self):
        for text in ("os.system == 1", "__import__('os')", "event.x.y == 1", "[1, 2] == 1", "event.amount + 1 > 2"):
            with self.assertRaises(ExpressionError, msg=text):
                compile_record(text, {}, self.SPACES)

    def test_rule_dialect_stays_btc_dsl_v1(self):
        for text in ("open_dispute == TRUE OR open_dispute == FALSE", "NOT open_dispute", "'x' == 'x'"):
            with self.assertRaises(ExpressionError, msg=text):
                expressions.evaluate_expr(text, {'open_dispute': False})

    def test_fact_dialect_adds_or_not_and_money_rounding(self):
        fn, names = compile_fact('ROUND_MONEY(x / 3) == 0.33 OR NOT y == 1', 'ROUND_HALF_UP', Decimal('0.01'))
        self.assertTrue(fn({'x': Decimal(1), 'y': Decimal(2)}))
        self.assertEqual(names, {'x', 'y'})


class CliPolicyTests(unittest.TestCase):
    def test_policy_info_and_a_policy_file_option(self):
        info = json.loads(subprocess.run([sys.executable, 'apps/engine/cli.py', '--policy-info'], cwd=ROOT, check=True,
                                         capture_output=True, text=True).stdout)
        self.assertEqual(info['policyId'], 'CASE4_BTC')
        with tempfile.TemporaryDirectory() as folder:
            document = copy.deepcopy(DOCUMENT)
            document['version'] = '2.0.0-copy'
            path = Path(folder) / 'policy.json'
            path.write_text(json.dumps(document), encoding='utf-8')
            summary = json.loads(subprocess.run([sys.executable, 'apps/engine/cli.py', '--policy', str(path)], cwd=ROOT,
                                                check=True, capture_output=True, text=True).stdout)
        self.assertEqual(summary['policy']['version'], '2.0.0-copy')
        self.assertEqual(summary['decisions'], {'RELEASE': 348, 'HOLD': 36, 'PENALTY': 15, 'REJECT': 6})


if __name__ == '__main__':
    unittest.main()
