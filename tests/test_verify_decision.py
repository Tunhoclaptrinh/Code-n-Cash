"""The decision verifier (tools/verify_decision.py) on a bundle the API exported for CT0005."""
import copy
import importlib.util
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
module_spec = importlib.util.spec_from_file_location('verify_decision', ROOT / 'tools/verify_decision.py')
verify = importlib.util.module_from_spec(module_spec)
module_spec.loader.exec_module(verify)
BUNDLE = json.loads((ROOT / 'tests/golden/verification_CT0005.json').read_text(encoding='utf-8'))


def outcomes(report):
    return [(d['seal'], d.get('rerun')) for d in report['decisions']]


class VerifyDecisionTests(unittest.TestCase):
    def test_exported_decisions_match_their_seals_and_a_rerun(self):
        report = verify.verify(BUNDLE)
        self.assertTrue(report['ok'])
        self.assertEqual(outcomes(report), [('MATCH', 'MATCH')] * 4)

    def test_an_edited_stored_decision_breaks_its_seal(self):
        bundle = copy.deepcopy(BUNDLE)
        bundle['decisions'][0]['evaluation']['payableMillion'] = '999.00'
        report = verify.verify(bundle, run=False)
        self.assertFalse(report['ok'])
        self.assertEqual(report['decisions'][0]['seal'], 'MISMATCH')

    def test_changed_input_is_caught_by_the_rerun_unless_the_milestone_is_frozen(self):
        bundle = copy.deepcopy(BUNDLE)
        events = bundle['data']['events.csv'].splitlines()
        bundle['data']['events.csv'] = '\n'.join(events[:-1]) + '\n'
        report = verify.verify(bundle)
        self.assertFalse(report['ok'])
        self.assertEqual(report['decisions'][-1]['rerun'], 'DIFFERS')
        bundle['decisions'][-1]['frozen'] = True
        report = verify.verify(bundle)
        self.assertTrue(report['ok'])
        self.assertEqual(report['decisions'][-1]['rerun'], 'FROZEN_DIFFERS')

    def test_only_plain_csv_names_are_written(self):
        bundle = copy.deepcopy(BUNDLE)
        bundle['data']['../x.csv'] = ''
        with self.assertRaises(ValueError):
            verify.verify(bundle)


if __name__ == '__main__':
    unittest.main()
