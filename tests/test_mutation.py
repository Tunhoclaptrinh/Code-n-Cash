"""The synthetic benchmark must notice every planted engine bug (tools/mutation_check.py).

Runs on the first 20 contracts to stay fast; ``python3 tools/mutation_check.py`` reports all 405 milestones.
"""
import importlib.util
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
module_spec = importlib.util.spec_from_file_location('mutation_check', ROOT / 'tools/mutation_check.py')
mutation = importlib.util.module_from_spec(module_spec)
module_spec.loader.exec_module(mutation)


class MutationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.report = mutation.check(mutation.subset(mutation.spec.Pack.load(mutation.spec.DEFAULT_DATA), 20))

    def test_the_unmutated_engine_passes_everything(self):
        self.assertEqual(self.report['baselineFailures'], {'benchmark': 0, 'samples': 0})

    def test_the_benchmark_kills_every_mutant(self):
        self.assertEqual(self.report['survivors']['benchmark'], [])
        self.assertEqual(self.report['killedByBenchmark'], len(mutation.MUTANTS))

    def test_mutants_are_restored_after_each_run(self):
        engine = mutation.spec
        pack = mutation.subset(engine.Pack.load(engine.DEFAULT_DATA), 3)
        before = {mid: engine.evaluate(pack, mid) for mid in pack.milestones}
        with mutation.planted('FIRST_MATCH_REVERSED'):
            pass
        self.assertEqual(before, {mid: engine.evaluate(pack, mid) for mid in pack.milestones})


if __name__ == '__main__':
    unittest.main()
