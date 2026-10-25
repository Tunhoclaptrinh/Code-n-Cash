"""Organizer clarifications and generalization checks, never hidden ground-truth claims."""
import copy
import sys
import unittest
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_dac_ta_nghiep_vu import Case, PACK, approver, spec


class OrganizerClarificationTests(unittest.TestCase):
    def test_else_is_the_last_default_rule_without_an_else_event(self):
        case = Case().delivered()
        scope = case.milestone['release_rule_code']
        rules = [dict(rule, condition_expression='FALSE')
                 if rule['release_rule_code'] == scope and rule['condition_expression'] != 'ELSE'
                 else dict(rule) for rule in PACK.rules]
        pack = spec.Pack([case.contract], case.parties, [case.milestone], case.events, rules)
        result = spec.evaluate(pack, 'MS9001')
        fallback = next(rule for rule in rules if rule['release_rule_code'] == scope and rule['condition_expression'] == 'ELSE')
        self.assertEqual(result['rule_id'], fallback['rule_id'])
        self.assertEqual((result['decision'], result['reason_code'], result['payable'], result['penalty']),
                         ('HOLD', 'UNRESOLVED_CONDITION', Decimal('0.00'), Decimal('0.00')))
        self.assertTrue(all(event['event_type'] != 'ELSE' for event in case.events))

    def test_completion_excludes_later_approval_and_dispute_resolution(self):
        case = Case(required='DELIVERY;INVOICE;ACCEPTANCE', roles='CONTRACT_OWNER', due='2026-10-10', grace=2, rate='0.25')
        case.ev('DELIVERY', Case.SUPPLIER, '2026-10-10T09:00:00')
        case.ev('INVOICE', Case.SUPPLIER, '2026-10-11T09:00:00')
        case.ev('ACCEPTANCE', Case.BUYER, '2026-10-14T09:00:00')
        case.ev('APPROVAL', approver(Case.BUYER, 'CONTRACT_OWNER'), '2026-10-16T09:00:00')
        opened = case.ev('DISPUTE_OPENED', Case.SUPPLIER, '2026-10-15T09:00:00')
        case.ev('DISPUTE_RESOLVED', Case.BUYER, '2026-10-20T09:00:00', ref=opened)
        result = case.run()
        self.assertEqual(result['completion_ts'], '2026-10-14T09:00:00')
        self.assertEqual(result['days_late'], 2)
        self.assertEqual((result['decision'], result['penalty'], result['payable']), ('PENALTY', Decimal('5.00'), Decimal('995.00')))

    def test_confidence_is_bounded_and_cannot_override_a_dispute(self):
        case = Case().delivered()
        case.ev('DISPUTE_OPENED', Case.SUPPLIER, '2026-06-06T09:00:00')
        result = case.run()
        before = copy.deepcopy(result)
        self.assertEqual(result['decision'], 'HOLD')
        self.assertEqual(spec.confidence_score(result, []), '1.00')
        for issues, flags in [([], []), ([], ['A05']), (['bad evidence'], [])]:
            score = Decimal(spec.confidence_score(dict(result, issues=issues), flags))
            self.assertGreaterEqual(score, 0)
            self.assertLessEqual(score, 1)
        self.assertEqual(result, before)

    def test_full_pack_has_identical_decisions_without_labels_or_event_order(self):
        baseline = spec.evaluate_all(PACK)
        pack = spec.Pack(PACK.contracts.values(), PACK.parties.values(), PACK.milestones.values(), reversed(PACK.events), PACK.rules)
        self.assertFalse(pack.decisions)
        self.assertEqual(spec.evaluate_all(pack), baseline)

    def test_identifiers_are_not_a_lookup_table_for_public_scenarios(self):
        maps = {key: {row[key]: f'NEW_{row[key]}' for row in rows} for key, rows in [
            ('contract_id', list(PACK.contracts.values())), ('party_id', list(PACK.parties.values())),
            ('milestone_id', list(PACK.milestones.values())), ('event_id', PACK.events), ('rule_id', PACK.rules)]}
        aliases = {'buyer_id': 'party_id', 'supplier_id': 'party_id', 'parent_party_id': 'party_id',
                   'actor_party_id': 'party_id', 'reference_event_id': 'event_id'}
        def rename(row):
            return {key: maps.get(aliases.get(key, key), {}).get(value, value) for key, value in row.items()}
        renamed = spec.Pack(*[[rename(row) for row in rows] for rows in [PACK.contracts.values(), PACK.parties.values(), PACK.milestones.values(), PACK.events, PACK.rules]])
        baseline = spec.evaluate_all(PACK)
        actual = spec.evaluate_all(renamed)
        self.assertEqual(len(actual), 405)
        for mid, before in baseline.items():
            after = actual[maps['milestone_id'][mid]]
            for field in ['decision', 'reason_code', 'status', 'payable', 'penalty', 'completion_ts', 'days_late']:
                self.assertEqual(after[field], before[field], (mid, field))
            self.assertEqual(after['rule_id'], maps['rule_id'][before['rule_id']])
            self.assertEqual(after['evidence'], sorted(maps['event_id'][value] for value in before['evidence']))


if __name__ == '__main__':
    unittest.main()
