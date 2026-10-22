import importlib.util
import unittest
from pathlib import Path
from decimal import Decimal

ROOT = Path(__file__).resolve().parents[1]
module_spec = importlib.util.spec_from_file_location('engine_adapter', ROOT / 'apps/engine/cli.py')
engine = importlib.util.module_from_spec(module_spec)
module_spec.loader.exec_module(engine)


class EngineAdapterTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.result = engine.evaluate()
        cls.pack = engine.spec.Pack.load(engine.spec.DEFAULT_DATA)

    def test_submission_schema_and_prefilled_fields(self):
        rows = self.result['rows']
        self.assertEqual(len(rows), 405)
        self.assertEqual(list(rows[0]), list(self.pack.template[0]))
        self.assertEqual(len(rows[0]), 22)
        for original, row in zip(self.pack.template, rows):
            for key in list(original)[:6]:
                self.assertEqual(original[key], row[key])

    def test_public_labels_and_invariants(self):
        self.assertEqual(self.result['summary']['sampleMatched'], 20)
        self.assertEqual(self.result['summary']['invariantViolations'], [])

    def test_no_payment_when_blocked_and_exact_amounts(self):
        for row in self.result['rows']:
            if row['predicted_decision'] in ('HOLD', 'REJECT'):
                self.assertEqual(Decimal(row['payable_amount_vnd_mn']), 0)
        self.assertEqual(self.result['summary']['payableMillion'], '365785.87')

    def test_trace_references_and_semantic_replay(self):
        traces = {trace['id']: trace for trace in self.result['traces']}
        for row in self.result['rows']:
            trace = traces[row['audit_trace_id']]
            self.assertEqual(trace['result']['rule_id'], row['rule_id_applied'])
        again = engine.evaluate()
        volatile = {'processing_time_ms', 'evaluated_at'}
        normalize = lambda rows: [{k: v for k, v in row.items() if k not in volatile} for row in rows]
        self.assertEqual(normalize(self.result['rows']), normalize(again['rows']))
