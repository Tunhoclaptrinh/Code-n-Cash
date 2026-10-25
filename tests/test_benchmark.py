import importlib.util
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
module_spec = importlib.util.spec_from_file_location('benchmark', ROOT / 'apps/engine/benchmark.py')
benchmark = importlib.util.module_from_spec(module_spec)
# Dataclasses resolve their annotations through sys.modules.
sys.modules['benchmark'] = benchmark
module_spec.loader.exec_module(benchmark)


class SyntheticBenchmarkTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pack = benchmark.spec.Pack.load(benchmark.spec.DEFAULT_DATA)
        cls.results = benchmark.run(cls.pack)
        cls.summary = benchmark.summarise(cls.results)

    def test_every_milestone_and_class_is_covered(self):
        self.assertEqual({c.milestone_id for c, _ in self.results}, set(self.pack.milestones))
        self.assertEqual(set(self.summary['labels']), set(benchmark.DECISIONS))
        self.assertGreaterEqual(len(self.summary['scenarios']), 25)

    def test_splits_are_disjoint_by_contract(self):
        dev = {c.contract_id for c, _ in self.results if c.split == 'dev'}
        test = {c.contract_id for c, _ in self.results if c.split == 'test'}
        self.assertFalse(dev & test)
        self.assertTrue(dev and test)

    def test_no_payment_without_conditions(self):
        for split in ('dev', 'test'):
            self.assertEqual(self.summary[split]['unauthorizedPayment']['count'], 0)

    def test_decisions_reasons_and_amounts_match_construction(self):
        self.assertEqual(self.summary['failureCount'], 0, self.summary['failures'][:3])


if __name__ == '__main__':
    unittest.main()
