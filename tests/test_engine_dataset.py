import csv
import importlib.util
import shutil
import tempfile
import unittest
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
module_spec = importlib.util.spec_from_file_location('engine_adapter', ROOT / 'apps/engine/cli.py')
engine = importlib.util.module_from_spec(module_spec)
module_spec.loader.exec_module(engine)
DATA = engine.spec.DEFAULT_DATA
REQUIRED = ['contracts', 'parties', 'milestones', 'events', 'payment_rules']
VOLATILE = {'processing_time_ms', 'evaluated_at', 'audit_trace_id'}


def stable(rows):
    return [{k: v for k, v in row.items() if k not in VOLATILE} for row in rows]


class UploadedDatasetTests(unittest.TestCase):
    """An upload of the same data must give the same answer as the bundled Data Pack."""

    @classmethod
    def setUpClass(cls):
        cls.official = engine.evaluate()

    def setUp(self):
        self.folder = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.folder)

    def flat(self, names=REQUIRED):
        for name in names:
            shutil.copy(DATA / '01_data' / f'{name}.csv', self.folder)

    def test_flat_files_without_template_match_the_official_run(self):
        self.flat()
        result = engine.evaluate(data=self.folder)
        self.assertTrue(result['summary']['source']['generatedTemplate'])
        self.assertEqual(stable(result['rows']), stable(self.official['rows']))
        self.assertEqual(list(result['rows'][0]), engine.dataset.TEMPLATE_COLUMNS)
        self.assertEqual(result['summary']['sampleTotal'], 0)

    def test_zipped_data_pack_keeps_labels_and_template(self):
        with zipfile.ZipFile(self.folder / 'pack.zip', 'w') as bundle:
            for path in DATA.rglob('*.csv'):
                bundle.write(path, Path('DataPack') / path.relative_to(DATA))
        result = engine.evaluate(data=self.folder)
        self.assertFalse(result['summary']['source']['generatedTemplate'])
        self.assertEqual(result['summary']['sampleMatched'], 20)
        self.assertEqual(stable(result['rows']), stable(self.official['rows']))

    def test_hidden_test_ids_narrow_the_output(self):
        self.flat()
        ids = ['MS0001', 'MS0002', 'MS0404']
        with open(self.folder / 'hidden_test_ids_Case4.csv', 'w', newline='') as handle:
            writer = csv.writer(handle)
            writer.writerow(['milestone_id'])
            writer.writerows([i] for i in ids + ['MS9999'])
        result = engine.evaluate(data=self.folder)
        self.assertEqual([row['milestone_id'] for row in result['rows']], ids)
        self.assertEqual(result['summary']['source']['unknownScopeIds'], ['MS9999'])
        self.assertEqual(sum(result['summary']['decisions'].values()), 3)

    def test_missing_files_and_columns_are_reported_before_evaluation(self):
        self.flat(['contracts', 'parties', 'milestones', 'events'])
        report = engine.dataset.inspect(self.folder)
        self.assertFalse(report['ok'])
        self.assertEqual({f['role']: f['status'] for f in report['files']}['payment_rules'], 'missing')
        with open(DATA / '01_data/payment_rules.csv', encoding='utf-8-sig') as handle:
            rows = list(csv.DictReader(handle))
        with open(self.folder / 'payment_rules.csv', 'w', newline='') as handle:
            writer = csv.DictWriter(handle, [k for k in rows[0] if k != 'priority'], extrasaction='ignore')
            writer.writeheader()
            writer.writerows(rows)
        entry = {f['role']: f for f in engine.dataset.inspect(self.folder)['files']}['payment_rules']
        self.assertEqual((entry['status'], entry['missingColumns']), ('invalid', ['priority']))
        with self.assertRaisesRegex(ValueError, 'DATASET_INVALID payment_rules.csv:invalid'):
            engine.evaluate(data=self.folder)

    def test_zip_entries_cannot_escape_the_folder(self):
        with zipfile.ZipFile(self.folder / 'evil.zip', 'w') as bundle:
            bundle.writestr('../outside.csv', 'a,b\n')
        with self.assertRaisesRegex(ValueError, 'ZIP_UNSAFE_PATH'):
            engine.dataset.inspect(self.folder)
        self.assertFalse((self.folder.parent / 'outside.csv').exists())


if __name__ == '__main__':
    unittest.main()
