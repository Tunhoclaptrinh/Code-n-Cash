"""Golden output of the official Data Pack: refactors must not change any decision, fact or output cell.

Regenerate only for an intended behaviour change:
    CODECASH_UPDATE_GOLDEN=1 python3 -m unittest tests.test_golden_output
"""
import importlib.util
import json
import os
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GOLDEN = ROOT / 'tests/golden/datapack_output.json'
# Cells that change on every run.
VOLATILE = ('processing_time_ms', 'evaluated_at')

module_spec = importlib.util.spec_from_file_location('engine_adapter', ROOT / 'apps/engine/cli.py')
engine = importlib.util.module_from_spec(module_spec)
module_spec.loader.exec_module(engine)


def snapshot():
    result = engine.evaluate()
    rows = [{k: v for k, v in row.items() if k not in VOLATILE} for row in result['rows']]
    facts = {trace['result']['milestone_id']: trace['result'] for trace in result['traces']}
    return json.loads(json.dumps({'rows': rows, 'facts': facts}, default=engine.encode, ensure_ascii=False))


class GoldenOutputTests(unittest.TestCase):
    def test_output_matches_golden(self):
        current = snapshot()
        if os.environ.get('CODECASH_UPDATE_GOLDEN') == '1':
            GOLDEN.write_text(json.dumps(current, ensure_ascii=False, indent=1, sort_keys=True) + '\n', encoding='utf-8')
        golden = json.loads(GOLDEN.read_text(encoding='utf-8'))
        self.assertEqual(len(current['rows']), 405)
        for expected, row in zip(golden['rows'], current['rows']):
            self.assertEqual(expected, row, expected['milestone_id'])
        self.assertEqual(golden['facts'], current['facts'])


if __name__ == '__main__':
    unittest.main()
