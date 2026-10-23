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

    def test_voided_events_apply_br19_only_to_eligible_events(self):
        self.flat()
        held = next(t['result'] for t in self.official['traces'] if t['result']['reason_code'] == 'UNAUTHORIZED_EVENT')
        valid = held['evidence'][0] if held['evidence'] else None
        with open(self.folder / engine.dataset.VOIDED, 'w', newline='') as handle:
            writer = csv.writer(handle)
            writer.writerow(['event_id'])
            writer.writerows([e] for e in held['unauthorized'] + ([valid] if valid else []))
        result = engine.evaluate(data=self.folder)
        after = next(t['result'] for t in result['traces'] if t['result']['milestone_id'] == held['milestone_id'])
        # Voiding removes the block but never creates evidence (T40b); valid events cannot be voided (T41).
        self.assertEqual(after['voided'], held['unauthorized'])
        self.assertNotEqual(after['reason_code'], 'UNAUTHORIZED_EVENT')
        if valid:
            self.assertIn(valid, after['evidence'])
            self.assertTrue(any('bị bỏ qua' in note for note in after['notes']))

    def test_kpi_follow_spec_section_15(self):
        kpi = self.official['summary']['kpi']
        self.assertEqual(kpi['decisionAccuracy'], {'count': 20, 'total': 20})
        self.assertEqual(kpi['macroF1'], '1.0000')
        self.assertEqual(kpi['unauthorizedPayment'], {'count': 0, 'total': 10})
        self.assertEqual(kpi['overHold'], {'count': 0, 'total': 10})
        self.assertEqual((kpi['amountAccuracy']['count'], kpi['amountAccuracy']['maxAbsError']), (20, '0.00'))
        self.assertEqual(kpi['coverage'], {'count': 405, 'total': 405})
        self.assertEqual(kpi['traceability'], {'count': 405, 'total': 405})
        # Without its dispute event a labelled HOLD milestone would be paid: UPR must count it.
        self.flat(['contracts', 'parties', 'milestones', 'payment_rules'])
        shutil.copy(DATA / '03_labels_sample/decision_sample.csv', self.folder)
        with open(DATA / '03_labels_sample/decision_sample.csv', encoding='utf-8-sig') as handle:
            disputed = next(d['milestone_id'] for d in csv.DictReader(handle) if d['reason_code'] == 'OPEN_DISPUTE')
        with open(DATA / '01_data/events.csv', encoding='utf-8-sig') as handle:
            events = list(csv.DictReader(handle))
        with open(self.folder / 'events.csv', 'w', newline='') as handle:
            writer = csv.DictWriter(handle, list(events[0]))
            writer.writeheader()
            writer.writerows(e for e in events if not (e['milestone_id'] == disputed and e['event_type'] == 'DISPUTE_OPENED'))
        changed = engine.evaluate(data=self.folder)['summary']['kpi']
        self.assertEqual(changed['unauthorizedPayment'], {'count': 1, 'total': 10})
        self.assertEqual(changed['decisionAccuracy'], {'count': 19, 'total': 20})
        # Labels describe the full history, so an as-of run reports only coverage, trace and time.
        snapshot = engine.evaluate(data=self.folder, as_of='2026-10-18')['summary']['kpi']
        self.assertIsNone(snapshot['unauthorizedPayment'])
        self.assertEqual(snapshot['coverage'], {'count': 405, 'total': 405})

    def test_timeline_replays_a_milestone_event_by_event(self):
        # MS0020 is the penalty example of spec 8.3: evidence, then approval, then the late payment.
        points = engine.timeline('MS0020')
        self.assertEqual([p['reason_code'] for p in points],
                         ['MISSING_REQUIRED_EVENT', 'APPROVAL_QUORUM_NOT_MET', 'LATE_COMPLETION'])
        self.assertEqual([p['at'] for p in points], sorted(p['at'] for p in points))
        final = next(t['result'] for t in self.official['traces'] if t['result']['milestone_id'] == 'MS0020')
        self.assertEqual((points[-1]['decision'], points[-1]['penalty']), (final['decision'], final['penalty']))
        with self.assertRaisesRegex(ValueError, 'UNKNOWN_MILESTONE'):
            engine.timeline('MS9999')

    def test_zip_entries_cannot_escape_the_folder(self):
        with zipfile.ZipFile(self.folder / 'evil.zip', 'w') as bundle:
            bundle.writestr('../outside.csv', 'a,b\n')
        with self.assertRaisesRegex(ValueError, 'ZIP_UNSAFE_PATH'):
            engine.dataset.inspect(self.folder)
        self.assertFalse((self.folder.parent / 'outside.csv').exists())


if __name__ == '__main__':
    unittest.main()
