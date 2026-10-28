"""Focused unit tests for the stage modules of apps/engine/codecash_engine, on small hand-built inputs.

Run from the repository root:  python3 -m unittest tests.test_engine_stages -v
"""
import sys
import unittest
from datetime import date
from decimal import ROUND_HALF_EVEN, ROUND_HALF_UP, Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'apps/engine'))
from codecash_engine import amounts, bindings, controls, events, requirements, rules, schedule, structure, trace  # noqa: E402
from codecash_engine.pack import Pack  # noqa: E402
from codecash_engine.pipeline import evaluate  # noqa: E402
from codecash_engine.policy import load_policy  # noqa: E402

POLICY = load_policy()

CONTRACT = {'contract_id': 'C1', 'buyer_id': 'B1', 'supplier_id': 'S1'}
PARTIES = {
    'B1': {'party_id': 'B1', 'party_type': 'BUYER', 'status': 'ACTIVE', 'parent_party_id': '', 'approval_role': 'NONE',
           'allowed_event_types': 'CONTRACT_SIGNED;ACCEPTANCE;DISPUTE', 'can_approve_payment': 'FALSE'},
    'S1': {'party_id': 'S1', 'party_type': 'SUPPLIER', 'status': 'ACTIVE', 'parent_party_id': '', 'approval_role': 'NONE',
           'allowed_event_types': 'DELIVERY;INVOICE', 'can_approve_payment': 'FALSE'},
    'S2': {'party_id': 'S2', 'party_type': 'SUPPLIER', 'status': 'ACTIVE', 'parent_party_id': '', 'approval_role': 'NONE',
           'allowed_event_types': 'DELIVERY;INVOICE', 'can_approve_payment': 'FALSE'},
    'A1': {'party_id': 'A1', 'party_type': 'APPROVER', 'status': 'ACTIVE', 'parent_party_id': 'B1',
           'approval_role': 'CONTRACT_OWNER', 'allowed_event_types': 'APPROVAL;REJECTION;DISPUTE',
           'can_approve_payment': 'TRUE'},
    'A2': {'party_id': 'A2', 'party_type': 'APPROVER', 'status': 'ACTIVE', 'parent_party_id': 'B1',
           'approval_role': 'CONTRACT_OWNER', 'allowed_event_types': 'APPROVAL;REJECTION;DISPUTE',
           'can_approve_payment': 'TRUE'},
    'A3': {'party_id': 'A3', 'party_type': 'APPROVER', 'status': 'ACTIVE', 'parent_party_id': 'B1',
           'approval_role': 'FINANCE', 'allowed_event_types': 'APPROVAL;REJECTION;DISPUTE',
           'can_approve_payment': 'TRUE'},
    'A4': {'party_id': 'A4', 'party_type': 'APPROVER', 'status': 'ACTIVE', 'parent_party_id': 'B1',
           'approval_role': 'LEGAL', 'allowed_event_types': 'APPROVAL;REJECTION;DISPUTE',
           'can_approve_payment': 'TRUE'},
    'A9': {'party_id': 'A9', 'party_type': 'APPROVER', 'status': 'ACTIVE', 'parent_party_id': 'B9',
           'approval_role': 'FINANCE', 'allowed_event_types': 'APPROVAL;REJECTION;DISPUTE',
           'can_approve_payment': 'TRUE'},
}
MILESTONE = {
    'milestone_id': 'M1', 'contract_id': 'C1', 'required_event_types': 'DELIVERY;ACCEPTANCE',
    'required_approval_roles': 'CONTRACT_OWNER;FINANCE', 'approval_required': 'TRUE', 'required_approval_quorum': '2',
    'release_rule_code': 'R:T', 'invoice_required': 'FALSE', 'late_penalty_applicable': 'TRUE',
    'due_date': '2026-01-10', 'grace_period_days': '5', 'penalty_rate_pct_per_day': '0.10',
    'max_penalty_pct': '8.00', 'planned_payment_vnd_mn': '100.00',
    'required_condition': 'EVENT:DELIVERY AND EVENT:ACCEPTANCE AND APPROVAL_QUORUM:2 AND NO_OPEN_DISPUTE',
}
STATUS_BY_TYPE = {'APPROVAL': 'APPROVED', 'REJECTION': 'REJECTED', 'DISPUTE_OPENED': 'OPEN',
                  'DISPUTE_RESOLVED': 'RESOLVED'}


def event(event_id, event_type, actor, timestamp='2026-01-01T09:00:00', **kw):
    row = {'event_id': event_id, 'contract_id': 'C1', 'milestone_id': 'M1', 'event_type': event_type,
           'event_status': STATUS_BY_TYPE.get(event_type, 'CONFIRMED'), 'actor_party_id': actor,
           'event_timestamp': timestamp, 'document_id': '', 'reference_event_id': ''}
    row.update(kw)
    return row


def verdicts(rows, req=('DELIVERY', 'ACCEPTANCE'), policy=POLICY, milestone=MILESTONE):
    return events.classify_all(policy, PARTIES, CONTRACT, milestone, list(req), rows)


class DedupeTests(unittest.TestCase):
    def test_keeps_the_earliest_copy_and_reports_the_dropped_one(self):
        first = event('E1', 'DELIVERY', 'S1', '2026-01-01T09:00:00', document_id='DN-1')
        second = event('E2', 'DELIVERY', 'S1', '2026-01-01T09:02:00', document_id='DN-1')
        kept, dups = events.dedupe([first, second], POLICY)
        self.assertEqual(kept, [first])
        self.assertEqual(dups, [('E2', 'E1')])

    def test_events_without_a_document_id_are_never_duplicates(self):
        kept, dups = events.dedupe([event('E1', 'DELIVERY', 'S1'), event('E2', 'DELIVERY', 'S1')], POLICY)
        self.assertEqual([e['event_id'] for e in kept], ['E1', 'E2'])
        self.assertEqual(dups, [])

    def test_a_different_actor_is_not_a_copy(self):
        a = event('E1', 'DELIVERY', 'S1', document_id='DN-1')
        b = event('E2', 'DELIVERY', 'S2', document_id='DN-1')
        self.assertEqual(events.dedupe([a, b], POLICY)[1], [])


class RequiredEventTests(unittest.TestCase):
    req = ['DELIVERY', 'ACCEPTANCE']

    def classify(self, rows, switches=()):
        return requirements.classify_required(verdicts(rows, self.req, POLICY.variant(switches)))

    def test_literal_permissions_switch_trusts_allowed_event_types(self):
        foreign = event('E1', 'DELIVERY', 'S2')  # a supplier outside the contract, but DELIVERY is in its list
        self.assertEqual(self.classify([foreign])[1], [foreign])
        valid, unauthorized, _ = self.classify([foreign], ['literal_permissions'])
        self.assertEqual((list(valid), unauthorized), (['DELIVERY'], []))

    def test_unauthorized_required_event_is_counted_and_never_valid(self):
        wrong_side = event('E1', 'DELIVERY', 'B1')  # a buyer cannot create a supplier event
        other_supplier = event('E2', 'DELIVERY', 'S2')  # a supplier outside the contract
        valid, unauthorized, _ = self.classify([wrong_side, other_supplier])
        self.assertEqual(valid, {})
        self.assertEqual([e['event_id'] for e in unauthorized], ['E1', 'E2'])

    def test_authorized_event_with_the_wrong_status_is_neither_valid_nor_unauthorized(self):
        valid, unauthorized, _ = self.classify([event('E1', 'DELIVERY', 'S1', event_status='PENDING')])
        self.assertEqual((valid, unauthorized), ({}, []))

    def test_earliest_valid_event_per_type_wins(self):
        early, late = event('E1', 'DELIVERY', 'S1', '2026-01-01T09:00:00'), event('E2', 'DELIVERY', 'S1', '2026-01-02T09:00:00')
        valid, _, _ = self.classify([early, late])
        self.assertEqual(valid['DELIVERY']['event_id'], 'E1')

    def test_unrelated_business_events_exclude_supporting_types(self):
        invoice = event('E1', 'INVOICE', 'S1')
        approval = event('E2', 'APPROVAL', 'A1')
        _, _, unrelated = self.classify([invoice, approval])
        self.assertEqual([e['event_id'] for e in unrelated], ['E1'])

    def test_missing_events_and_completion_rate(self):
        valid = {'DELIVERY': event('E1', 'DELIVERY', 'S1')}
        missing = requirements.missing_events(self.req, valid)
        self.assertEqual(missing, ['ACCEPTANCE'])
        self.assertEqual(requirements.completion_rate(self.req, missing), Decimal('0.5'))
        self.assertEqual(requirements.completion_rate([], []), Decimal(0))

    def test_conditional_requirement_switch_adds_invoice_when_the_milestone_flags_it(self):
        flagged = dict(MILESTONE, invoice_required='TRUE')
        config, _ = structure.milestone_config(flagged, POLICY.variant(['enforce_invoice_flag']), CONTRACT)
        self.assertEqual(config['req'], ['DELIVERY', 'ACCEPTANCE', 'INVOICE'])
        self.assertEqual(structure.milestone_config(flagged, POLICY, CONTRACT)[0]['req'], ['DELIVERY', 'ACCEPTANCE'])


class ControlTests(unittest.TestCase):
    def resolution_closes(self, resolution, opened, switches=()):
        by_id = {e['event_id']: e for e in [opened, resolution]}
        return controls.open_disputes(POLICY.variant(switches), [opened, resolution], by_id, PARTIES, CONTRACT,
                                      MILESTONE) == []

    def setUp(self):
        self.opened = event('D1', 'DISPUTE_OPENED', 'S1', '2026-01-05T09:00:00')

    def test_dispute_stays_open_without_a_resolution(self):
        by_id = {'D1': self.opened}
        found = controls.open_disputes(POLICY, [self.opened], by_id, PARTIES, CONTRACT, MILESTONE)
        self.assertEqual([e['event_id'] for e in found], ['D1'])

    def test_dispute_is_closed_by_a_resolution_that_references_it(self):
        resolved = event('D2', 'DISPUTE_RESOLVED', 'B1', '2026-01-06T09:00:00', reference_event_id='D1')
        self.assertTrue(self.resolution_closes(resolved, self.opened))

    def test_resolution_with_a_wrong_reference_does_not_close_it(self):
        for reference in ('', 'D404'):
            resolved = event('D2', 'DISPUTE_RESOLVED', 'B1', '2026-01-06T09:00:00', reference_event_id=reference)
            self.assertFalse(self.resolution_closes(resolved, self.opened), reference)

    def test_resolution_older_than_the_dispute_or_with_the_wrong_status_does_not_close_it(self):
        before = event('D2', 'DISPUTE_RESOLVED', 'B1', '2026-01-04T09:00:00', reference_event_id='D1')
        wrong_status = event('D3', 'DISPUTE_RESOLVED', 'B1', '2026-01-06T09:00:00', reference_event_id='D1',
                             event_status='OPEN')
        self.assertFalse(self.resolution_closes(before, self.opened))
        self.assertFalse(self.resolution_closes(wrong_status, self.opened))

    def test_resolution_of_another_milestone_does_not_close_it(self):
        elsewhere = event('D2', 'DISPUTE_RESOLVED', 'B1', '2026-01-06T09:00:00', reference_event_id='D1', milestone_id='M2')
        self.assertFalse(self.resolution_closes(elsewhere, self.opened))

    def test_strict_resolution_needs_a_buyer_side_resolver(self):
        by_supplier = event('D2', 'DISPUTE_RESOLVED', 'S1', '2026-01-06T09:00:00', reference_event_id='D1')
        self.assertTrue(self.resolution_closes(by_supplier, self.opened))
        self.assertFalse(self.resolution_closes(by_supplier, self.opened, ['strict_resolution']))

    def test_ignoring_resolutions_keeps_every_dispute_open(self):
        resolved = event('D2', 'DISPUTE_RESOLVED', 'B1', '2026-01-06T09:00:00', reference_event_id='D1')
        self.assertFalse(self.resolution_closes(resolved, self.opened, ['ignore_resolutions']))

    def test_only_a_valid_approver_rejection_counts(self):
        good = event('R1', 'REJECTION', 'A1')
        by_supplier = event('R2', 'REJECTION', 'S1')
        wrong_status = event('R3', 'REJECTION', 'A1', event_status='APPROVED')
        classified = verdicts([good, by_supplier, wrong_status])
        rejections, anomalies = controls.valid_rejections(classified), events.find_anomalies(POLICY, classified)
        self.assertEqual([e['event_id'] for e in rejections], ['R1'])
        self.assertEqual(anomalies, ['R2: REJECTION không hợp lệ', 'R3: REJECTION không hợp lệ'])

    def count(self, rows, roles=('CONTRACT_OWNER', 'FINANCE')):
        milestone = dict(MILESTONE, required_approval_roles=';'.join(roles))
        return controls.count_approvals(POLICY, verdicts(rows, milestone=milestone))

    def test_quorum_counts_distinct_roles_not_approvals(self):
        same_role = [event('P1', 'APPROVAL', 'A1'), event('P2', 'APPROVAL', 'A2')]
        approvals, count = self.count(same_role)
        self.assertEqual((len(approvals), count), (2, 1))
        approvals, count = self.count(same_role + [event('P3', 'APPROVAL', 'A3')])
        self.assertEqual((len(approvals), count), (3, 2))

    def test_an_approver_counts_once_and_the_earliest_approval_is_kept(self):
        approvals, count = self.count([event('P1', 'APPROVAL', 'A1', '2026-01-01T09:00:00'),
                                       event('P2', 'APPROVAL', 'A1', '2026-01-02T09:00:00')])
        self.assertEqual((list(approvals), approvals['A1']['event_id'], count), (['A1'], 'P1', 1))

    def test_approvals_outside_the_required_roles_or_the_buyer_are_ignored(self):
        _, count = self.count([event('P1', 'APPROVAL', 'A4'),  # LEGAL is not a required role
                               event('P2', 'APPROVAL', 'A9'),  # approver of another buyer
                               event('P3', 'APPROVAL', 'A1', event_status='PENDING')])
        self.assertEqual(count, 0)


class ScheduleTests(unittest.TestCase):
    def test_completion_is_the_latest_valid_required_event_and_approvals_are_excluded(self):
        valid = {'DELIVERY': event('E1', 'DELIVERY', 'S1', '2026-01-03T08:00:00'),
                 'ACCEPTANCE': event('E2', 'ACCEPTANCE', 'B1', '2026-01-09T17:30:00')}
        approvals = {'A1': event('P1', 'APPROVAL', 'A1', '2026-01-20T09:00:00')}
        self.assertEqual(schedule.completion_timestamp(valid, approvals, []), '2026-01-09T17:30:00')
        self.assertEqual(schedule.completion_timestamp(valid, approvals, [], ('EVIDENCE', 'APPROVAL')),
                         '2026-01-20T09:00:00')

    def test_no_completion_while_something_is_missing(self):
        valid = {'DELIVERY': event('E1', 'DELIVERY', 'S1')}
        self.assertIsNone(schedule.completion_timestamp(valid, {}, ['ACCEPTANCE']))
        self.assertIsNone(schedule.completion_timestamp({}, {}, []))
        self.assertIsNone(schedule.completion_date(None))
        self.assertEqual(schedule.completion_date('2026-01-09T17:30:00'), date(2026, 1, 9))

    def test_days_late_only_after_due_date_plus_grace(self):
        due, grace = date(2026, 1, 10), 5  # limit is 2026-01-15
        late = lambda day: schedule.days_late_after_grace(date(2026, 1, day), due, grace)
        self.assertEqual([late(5), late(10), late(15)], [0, 0, 0])
        self.assertEqual([late(16), late(20)], [1, 5])
        self.assertEqual(schedule.days_late_after_grace(None, due, grace), 0)
        self.assertEqual(schedule.days_late_after_grace(date(2026, 3, 1), None, grace), 0)

    def test_unreadable_terms_become_neutral_zero_terms_with_an_issue(self):
        values, issues = bindings.bind(POLICY, dict(MILESTONE, penalty_rate_pct_per_day='abc'), CONTRACT)
        self.assertEqual(issues, ['tham số ngày/tiền của milestone không đọc được'])
        terms = [values[k] for k in ('due_date', 'grace_period_days', 'penalty_rate_pct_per_day', 'max_penalty_pct',
                                     'planned_payment_vnd_mn')]
        self.assertEqual(terms, [None, Decimal(0), Decimal(0), Decimal(0), Decimal(0)])
        values, issues = bindings.bind(POLICY, MILESTONE, CONTRACT)
        self.assertEqual((issues, values['grace_period_days'], values['planned_payment_vnd_mn']), ([], 5, Decimal('100.00')))

    def test_bound_cells_are_typed_and_strict(self):
        values, issues = bindings.bind(POLICY, MILESTONE, CONTRACT)
        self.assertEqual((values['due_date'], values['late_penalty_applicable']), (date(2026, 1, 10), True))
        self.assertTrue(values['hold_on_open_dispute'])  # absent column: the declared default TRUE
        self.assertIsNone(values['contract_value_vnd_mn'])  # absent column without default: missing, no issue
        _, issues = bindings.bind(POLICY, dict(MILESTONE, late_penalty_applicable='yes'), CONTRACT)
        self.assertEqual(issues, ['late_penalty_applicable không đọc được'])


def rule(priority, condition, decision, reason, penalty='0', payable='0'):
    return {'rule_id': f'PR{priority}', 'priority': str(priority), 'condition_expression': condition,
            'decision': decision, 'reason_code': reason, 'penalty_amount_formula': penalty,
            'payable_amount_formula': payable}


RELEASE = rule(70, 'all_required_conditions_met == TRUE', 'RELEASE', 'ALL_CONDITIONS_MET',
               payable='planned_payment_vnd_mn')
ELSE = rule(80, 'ELSE', 'HOLD', 'UNRESOLVED_CONDITION')
DISPUTE = rule(10, 'open_dispute == TRUE', 'HOLD', 'OPEN_DISPUTE')


def env_for(**changes):
    """A rule environment of the policy vocabulary for the hand-built milestone (all conditions met)."""
    facts = dict(open_dispute=False, valid_rejection_event_count=0, unauthorized_required_event_count=0,
                 required_event_completion_rate=Decimal(1), valid_approval_count=0, actual_completion_date=date(2026, 1, 9),
                 days_late_after_grace=0)
    config = {'approval_required': False, 'quorum': 0}
    bound, _ = bindings.bind(POLICY, MILESTONE, CONTRACT)
    for key, value in changes.items():
        target = facts if key in facts else config if key in config else bound
        target[key] = value
    return rules.build_env(POLICY, config, bound, facts)


class RuleSelectionTests(unittest.TestCase):
    scope = [DISPUTE, RELEASE, ELSE]

    def select(self, env, issues=(), anomalies=(), scope=None):
        return rules.select_rule(scope or self.scope, env, list(issues), list(anomalies), POLICY)

    def test_first_matching_rule_wins(self):
        self.assertEqual(self.select(env_for()).rule['rule_id'], 'PR70')
        self.assertEqual(self.select(env_for(open_dispute=True)).rule['rule_id'], 'PR10')

    def test_else_rule_catches_what_no_rule_matches(self):
        chosen = self.select(env_for(required_event_completion_rate=Decimal('0.5'))).rule
        self.assertEqual((chosen['decision'], chosen['reason_code']), ('HOLD', 'UNRESOLVED_CONDITION'))

    def test_structural_issues_force_the_else_rule(self):
        selection = self.select(env_for(), ['required_event_types trống'])
        self.assertEqual((selection.rule['rule_id'], selection.mode, selection.trace), ('PR80', 'STRUCTURE_FALLBACK', []))

    def test_anomalies_only_downgrade_a_paying_rule(self):
        self.assertEqual(self.select(env_for(), [], ['E1: actor không tồn tại']).rule['rule_id'], 'PR80')
        held = self.select(env_for(open_dispute=True), [], ['E1: actor không tồn tại'])
        self.assertEqual(held.rule['rule_id'], 'PR10')

    def test_rule_trace_lists_the_rules_evaluated_up_to_the_winner(self):
        trace = self.select(env_for()).trace
        self.assertEqual(trace, [{'rule_id': 'PR10', 'priority': '10', 'matched': False},
                                 {'rule_id': 'PR70', 'priority': '70', 'matched': True}])

    def test_without_an_else_rule_there_is_no_rule_and_the_milestone_is_held(self):
        self.assertIsNone(self.select(env_for(), ['issue'], scope=[DISPUTE, RELEASE]).rule)
        pack = Pack([CONTRACT], PARTIES.values(), [dict(MILESTONE, release_rule_code='R:EMPTY')], [], [])
        result = evaluate(pack, 'M1')
        self.assertEqual((result['decision'], result['reason_code'], result['rule_id']),
                         ('HOLD', 'UNRESOLVED_CONDITION', ''))
        self.assertEqual((result['payable'], result['penalty']), (Decimal('0.00'), Decimal('0.00')))
        self.assertIn('phạm vi rule trống', result['issues'])

    def test_all_conditions_met_is_a_derived_fact_of_the_policy(self):
        met = lambda **kw: env_for(**kw)['all_required_conditions_met']  # noqa: E731
        self.assertTrue(met(approval_required=True, quorum=2, valid_approval_count=2))
        self.assertTrue(met(approval_required=False, quorum=2))
        self.assertFalse(met(required_event_completion_rate=Decimal('0.5')))
        self.assertFalse(met(unauthorized_required_event_count=1))
        self.assertFalse(met(approval_required=True, quorum=2, valid_approval_count=1))

    def test_environment_holds_only_decimals_booleans_dates_and_none(self):
        env = env_for(actual_completion_date=None)
        self.assertEqual(list(env), [n for n in POLICY.variables if n != 'penalty_amount_vnd_mn'])
        for name, value in env.items():
            self.assertIn(type(value), (Decimal, bool, date, type(None)), name)


PENALTY_FORMULA = ('MIN(days_late_after_grace * penalty_rate_pct_per_day / 100 * planned_payment_vnd_mn, '
                   'max_penalty_pct / 100 * planned_payment_vnd_mn)')
PAYABLE_AFTER_PENALTY = 'MAX(0, planned_payment_vnd_mn - penalty_amount_vnd_mn)'


class AmountTests(unittest.TestCase):
    PENALTY = rule(60, 'TRUE', 'PENALTY', 'LATE_COMPLETION', penalty=PENALTY_FORMULA, payable=PAYABLE_AFTER_PENALTY)

    def penalty_env(self, days_late, rate, cap, planned):
        return env_for(grace_period_days=Decimal(0), penalty_rate_pct_per_day=Decimal(rate), max_penalty_pct=Decimal(cap),
                       planned_payment_vnd_mn=Decimal(planned), days_late_after_grace=days_late)

    def test_penalty_is_capped_at_the_maximum_percentage(self):
        env = self.penalty_env(100, '0.10', '8.00', '100.00')  # uncapped would be 10.00
        penalty, payable = amounts.rule_amounts(self.PENALTY, env)
        self.assertEqual((penalty, payable), (Decimal('8.00'), Decimal('92.00')))
        self.assertEqual(amounts.reference_penalty(POLICY, env), Decimal('8.0000'))

    def test_penalty_below_the_cap_is_proportional_to_days_late(self):
        penalty, payable = amounts.rule_amounts(self.PENALTY, self.penalty_env(3, '0.10', '8.00', '100.00'))
        self.assertEqual((penalty, payable), (Decimal('0.30'), Decimal('99.70')))

    def test_rounding_is_half_up_by_default_and_never_a_float(self):
        env = self.penalty_env(1, '0.10', '8.00', '25.00')  # exactly 0.025
        penalty, payable = amounts.rule_amounts(self.PENALTY, env)
        self.assertEqual((penalty, payable), (Decimal('0.03'), Decimal('24.97')))
        half_even, _ = amounts.rule_amounts(self.PENALTY, env, ROUND_HALF_EVEN)
        self.assertEqual(half_even, Decimal('0.02'))
        self.assertEqual(amounts.rule_amounts(self.PENALTY, env, ROUND_HALF_UP)[0], Decimal('0.03'))
        for value in (penalty, payable, amounts.reference_penalty(POLICY, env)):
            self.assertIs(type(value), Decimal)

    def test_payable_formula_sees_the_rounded_penalty_without_mutating_the_environment(self):
        env = self.penalty_env(1, '0.10', '8.00', '25.00')
        amounts.rule_amounts(self.PENALTY, env)
        self.assertNotIn('penalty_amount_vnd_mn', env)

    def test_release_pays_the_planned_amount_and_no_rule_pays_nothing(self):
        env = env_for()
        self.assertEqual(amounts.rule_amounts(RELEASE, env), (Decimal('0.00'), Decimal('100.00')))
        self.assertEqual(amounts.rule_amounts(None, env), (Decimal('0.00'), Decimal('0.00')))

    def test_amount_contract_of_the_decision_is_checked(self):
        values = amounts.amount_env(env_for(), Decimal('0.00'), Decimal('100.00'), Decimal(0))
        self.assertEqual(amounts.failed_checks(POLICY, 'RELEASE', values), [])
        over = amounts.amount_env(env_for(), Decimal('0.00'), Decimal('150.00'), Decimal(0))
        self.assertEqual(amounts.failed_checks(POLICY, 'RELEASE', over),
                         ['payable_amount_vnd_mn <= planned_payment_vnd_mn',
                          'payable_amount_vnd_mn == planned_payment_vnd_mn'])


class VoidAndAnomalyTests(unittest.TestCase):
    req = ['DELIVERY', 'ACCEPTANCE']

    def test_only_unauthorized_or_anomalous_events_can_be_voided(self):
        wrong_side = event('E1', 'DELIVERY', 'B1')
        fine = event('E2', 'DELIVERY', 'S1')
        ghost = event('E3', 'DELIVERY', 'NOBODY')
        rows = [wrong_side, fine, ghost]
        kept, applied, notes = events.apply_voids(POLICY, verdicts(rows, self.req), rows, {'E1', 'E2', 'E3', 'E404'})
        self.assertEqual([v.event['event_id'] for v in applied], ['E1', 'E3'])
        self.assertEqual([v.event['event_id'] for v in kept], ['E2'])
        self.assertEqual(notes, ['yêu cầu vô hiệu không hợp lệ, bị bỏ qua: E2'])

    def test_unknown_actor_and_unknown_type_are_anomalies(self):
        anomalies = events.find_anomalies(POLICY, verdicts([event('E1', 'DELIVERY', 'NOBODY'), event('E2', 'MYSTERY', 'S1')]))
        self.assertEqual(anomalies, ['E1: actor không tồn tại', 'E2: event_type lạ'])

    def test_as_of_cut_keeps_events_up_to_the_timestamp(self):
        rows = [event('E1', 'DELIVERY', 'S1', '2026-01-01T09:00:00'), event('E2', 'DELIVERY', 'S1', '2026-01-02T09:00:00')]
        self.assertEqual([e['event_id'] for e in events.up_to(rows, '2026-01-01T23:59:59')], ['E1'])
        self.assertEqual(events.up_to(rows, None), rows)


class StructureAndTraceTests(unittest.TestCase):
    def test_a_well_formed_milestone_has_no_structural_issue(self):
        scope = PipelineTests.scope()
        config, issues = structure.structural_issues(MILESTONE, scope, [event('E1', 'DELIVERY', 'S1')], POLICY)
        self.assertEqual(issues, [])
        self.assertEqual((config['req'], config['roles'], config['quorum'], config['approval_required']),
                         (['DELIVERY', 'ACCEPTANCE'], ['CONTRACT_OWNER', 'FINANCE'], 2, True))

    def test_inconsistent_quorum_incomplete_scope_and_foreign_events_are_reported(self):
        milestone = dict(MILESTONE, required_approval_quorum='1')
        foreign = event('E9', 'DELIVERY', 'S1', contract_id='C2')
        _, issues = structure.structural_issues(milestone, [], [foreign], POLICY)
        self.assertEqual(issues, ['quorum khác số vai trò bắt buộc', 'phạm vi rule trống',
                                  'E9: contract_id lệch milestone'])

    def test_any_rule_scope_shape_is_accepted_when_it_is_safe_to_apply(self):
        scope = PipelineTests.scope()
        extra = rule(65, 'planned_payment_vnd_mn > 1000', 'HOLD', 'APPROVAL_QUORUM_NOT_MET')
        self.assertEqual(structure.scope_issues(sorted(scope + [extra], key=lambda r: int(r['priority'])), POLICY), [])
        self.assertEqual(structure.scope_issues(scope[:-1], POLICY), ['phạm vi rule cần đúng một nhánh ELSE ở cuối',
                                                                     'phạm vi rule thiếu mã lý do: UNRESOLVED_CONDITION'])
        twice = scope[:2] + [dict(scope[2], priority='20')] + scope[3:]
        self.assertEqual(structure.scope_issues(twice, POLICY), ['phạm vi rule trùng priority: 20'])
        without = [r for r in scope if r['reason_code'] != 'UNAUTHORIZED_EVENT']
        self.assertEqual(structure.scope_issues(without, POLICY), ['phạm vi rule thiếu mã lý do: UNAUTHORIZED_EVENT'])
        odd = scope[:-1] + [dict(scope[-1], decision='PAY_LATER', reason_code='LATER')]
        self.assertEqual(structure.scope_issues(odd, POLICY), [
            'PR80: quyết định không có trong chính sách: PAY_LATER', 'PR80: mã lý do không có trong chính sách: LATER',
            'phạm vi rule thiếu mã lý do: UNRESOLVED_CONDITION'])

    def test_unsupported_condition_logic_and_unreadable_flags_are_structural(self):
        _, issues = structure.milestone_config(dict(MILESTONE, condition_logic='ANY', approval_required='yes'), POLICY)
        self.assertEqual(issues, ['approval_required không đọc được', 'approval_required=FALSE nhưng quorum > 0',
                                  'condition_logic không được hỗ trợ: ANY'])

    def test_missing_contract_gets_a_stand_in_and_an_issue(self):
        contract, issues = structure.resolve_contract({}, MILESTONE)
        self.assertEqual((contract['buyer_id'], issues), ('', ['milestone trỏ tới hợp đồng không tồn tại']))

    def test_condition_tokens_split_into_met_and_missing(self):
        valid = {'DELIVERY': event('E1', 'DELIVERY', 'S1')}
        met, missing = trace.condition_tokens(POLICY, MILESTONE['required_condition'], valid, 1, True)
        self.assertEqual(met, ['EVENT:DELIVERY'])
        self.assertEqual(missing, ['EVENT:ACCEPTANCE', 'APPROVAL_QUORUM:2', 'NO_OPEN_DISPUTE'])

    def test_evidence_is_sorted_unique_and_adds_the_deciding_events(self):
        valid = {'DELIVERY': event('E2', 'DELIVERY', 'S1')}
        approvals = {'A1': event('P1', 'APPROVAL', 'A1')}
        sets = {'VALID_REQUIRED': valid.values(), 'COUNTED_APPROVALS': approvals.values(),
                'OPEN_DISPUTES': [event('D1', 'DISPUTE_OPENED', 'S1')], 'REJECTIONS': [event('R1', 'REJECTION', 'A1')]}
        self.assertEqual(trace.collect_evidence(POLICY, 'ALL_CONDITIONS_MET', sets), ['E2', 'P1'])
        self.assertEqual(trace.collect_evidence(POLICY, 'OPEN_DISPUTE', sets), ['D1', 'E2', 'P1'])
        self.assertEqual(trace.collect_evidence(POLICY, 'REJECTION_PRESENT', sets), ['E2', 'P1', 'R1'])

    def test_status_follows_the_reason_and_as_of_adds_planned_and_in_progress(self):
        status = lambda *args: trace.milestone_status(POLICY, *args)  # noqa: E731
        self.assertEqual(status('LATE_COMPLETION'), 'PAID_WITH_PENALTY')
        self.assertEqual(status('OPEN_DISPUTE'), 'ON_HOLD')
        as_of, due = '2026-01-05T00:00:00', date(2026, 1, 10)
        self.assertEqual(status('MISSING_REQUIRED_EVENT', as_of, False, due), 'PLANNED')
        self.assertEqual(status('MISSING_REQUIRED_EVENT', as_of, True, due), 'IN_PROGRESS')
        self.assertEqual(status('MISSING_REQUIRED_EVENT', '2026-01-11T00:00:00', True, due), 'WAITING_EVIDENCE')
        self.assertEqual(status('MISSING_REQUIRED_EVENT'), 'WAITING_EVIDENCE')


class PipelineTests(unittest.TestCase):
    """The orchestrator wires the stages in order; one hand-built milestone from event to payable amount."""

    @staticmethod
    def scope():
        """The eight rules of the official table, as one scope."""
        return [rule(p, c, d, r, pen, pay) for p, c, d, r, pen, pay in [
            (10, 'open_dispute == TRUE', 'HOLD', 'OPEN_DISPUTE', '0', '0'),
            (20, 'valid_rejection_event_count > 0', 'REJECT', 'REJECTION_PRESENT', '0', '0'),
            (30, 'unauthorized_required_event_count > 0', 'HOLD', 'UNAUTHORIZED_EVENT', '0', '0'),
            (40, 'required_event_completion_rate < 1.0', 'HOLD', 'MISSING_REQUIRED_EVENT', '0', '0'),
            (50, 'approval_required == TRUE AND valid_approval_count < required_approval_quorum', 'HOLD',
             'APPROVAL_QUORUM_NOT_MET', '0', '0'),
            (60, 'late_penalty_applicable == TRUE AND actual_completion_date > due_date + grace_period_days',
             'PENALTY', 'LATE_COMPLETION', PENALTY_FORMULA, PAYABLE_AFTER_PENALTY),
            (70, 'all_required_conditions_met == TRUE AND open_dispute == FALSE AND valid_rejection_event_count == 0',
             'RELEASE', 'ALL_CONDITIONS_MET', '0', 'planned_payment_vnd_mn'),
            (80, 'ELSE', 'HOLD', 'UNRESOLVED_CONDITION', '0', '0')]]

    def run_milestone(self, rows, milestone=MILESTONE, scope=None):
        scope = scope or self.scope()
        rule_rows = [dict(r, release_rule_code=milestone['release_rule_code'], active='TRUE') for r in scope]
        return evaluate(Pack([CONTRACT], PARTIES.values(), [milestone], rows, rule_rows), 'M1')

    def complete_events(self, delivered='2026-01-03T08:00:00', accepted='2026-01-09T17:30:00'):
        return [event('E1', 'DELIVERY', 'S1', delivered), event('E2', 'ACCEPTANCE', 'B1', accepted),
                event('P1', 'APPROVAL', 'A1', '2026-01-10T09:00:00'), event('P2', 'APPROVAL', 'A3', '2026-01-10T10:00:00')]

    def test_on_time_milestone_with_quorum_is_released(self):
        result = self.run_milestone(self.complete_events())
        self.assertEqual((result['decision'], result['reason_code'], result['payable'], result['penalty']),
                         ('RELEASE', 'ALL_CONDITIONS_MET', Decimal('100.00'), Decimal('0.00')))
        self.assertEqual(result['evidence'], ['E1', 'E2', 'P1', 'P2'])
        self.assertEqual((result['days_late'], result['valid_approval_count'], result['missing']), (0, 2, []))

    def test_milestone_after_the_grace_period_pays_with_a_penalty(self):
        result = self.run_milestone(self.complete_events(accepted='2026-01-18T09:00:00'))
        self.assertEqual((result['decision'], result['days_late'], result['penalty'], result['payable']),
                         ('PENALTY', 3, Decimal('0.30'), Decimal('99.70')))

    def test_one_role_twice_does_not_reach_the_quorum(self):
        rows = self.complete_events()[:3] + [event('P2', 'APPROVAL', 'A2', '2026-01-10T10:00:00')]
        result = self.run_milestone(rows)
        self.assertEqual((result['decision'], result['reason_code'], result['valid_approval_count']),
                         ('HOLD', 'APPROVAL_QUORUM_NOT_MET', 1))

    def test_unauthorized_required_event_holds_the_milestone(self):
        rows = self.complete_events() + [event('E3', 'DELIVERY', 'S2', '2026-01-02T08:00:00')]
        result = self.run_milestone(rows)
        self.assertEqual((result['reason_code'], result['unauthorized']), ('UNAUTHORIZED_EVENT', ['E3']))

    def test_anomaly_downgrades_a_release_to_hold(self):
        rows = self.complete_events() + [event('E9', 'MYSTERY', 'S1')]
        result = self.run_milestone(rows)
        self.assertEqual((result['decision'], result['reason_code']), ('HOLD', 'UNRESOLVED_CONDITION'))
        self.assertEqual(result['issues'], ['E9: event_type lạ'])


if __name__ == '__main__':
    unittest.main()
