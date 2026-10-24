"""Reproducible Bronze review on public inputs; no hidden split or hidden labels are assumed."""
import argparse
import hashlib
import json
import sys
from collections import Counter
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'apps/engine'))
import cli as engine


def review():
    pack = engine.spec.Pack.load(engine.spec.DEFAULT_DATA)
    output = engine.evaluate()
    results = engine.spec.evaluate_all(pack)
    labelled_ids = {row['milestone_id'] for row in pack.decisions}
    labelled_types = {pack.milestones[mid]['milestone_type'] for mid in labelled_ids}
    labelled_scopes = {pack.milestones[mid]['release_rule_code'] for mid in labelled_ids}
    fields = ('decision', 'reason_code', 'payable', 'penalty')
    key = lambda row: tuple(row[field] for field in fields)
    variants = {}
    for name, options in [('literal_permissions', {'literal_permissions': True}),
                          ('contract_scope_dispute', {'contract_scope_dispute': True}),
                          ('completion_includes_approval', {'completion_includes_approval': True}),
                          ('invoice_flag_as_extra_requirement', {'enforce_invoice_flag': True}),
                          ('strict_silver_resolution', {'strict_resolution': True})]:
        actual = engine.spec.evaluate_all(pack, **options)
        changed = [mid for mid in results if key(actual[mid]) != key(results[mid])]
        variants[name] = {'changed': len(changed), 'milestones': changed,
                          'publicMatched': engine.spec.compare_samples(pack, actual)[0]}
    # Independent sample comparisons include evidence, required events and quorum: 17 columns.
    matched, mismatches = engine.spec.compare_samples(pack, results)
    template_ids = [row['milestone_id'] for row in pack.template]
    row_ids = [row['milestone_id'] for row in output['rows']]
    fingerprints = {path.name: hashlib.sha256(path.read_bytes()).hexdigest()
                    for path in sorted((engine.spec.DEFAULT_DATA / '01_data').glob('*.csv'))}
    manifest = {row['file_name']: row for row in engine.spec.read(engine.spec.DEFAULT_DATA, '02_metadata/dataset_manifest_final.csv')}
    checks = {'sourceHashesMatchManifest': all(value == manifest[name]['sha256'] for name, value in fingerprints.items()),
              'fullTemplateOrder': row_ids == template_ids,
              'uniqueOutputIds': len(row_ids) == len(set(row_ids)),
              'exact22Columns': all(list(row) == engine.dataset.TEMPLATE_COLUMNS for row in output['rows']),
              'prefilledFieldsPreserved': all(all(row[key] == original[key] for key in list(original)[:6])
                                             for row, original in zip(output['rows'], pack.template)),
              'confidenceInRange': all(0 <= Decimal(row['confidence_score']) <= 1 for row in output['rows']),
              'noPaymentWhenBlocked': all(row['payable'] == 0 and row['penalty'] == 0 for row in results.values()
                                         if row['decision'] in ('HOLD', 'REJECT')),
              'noInvariantViolations': not output['summary']['invariantViolations'],
              'public17ColumnMatch': matched == len(pack.decisions),
              'allTraceIdsResolve': {row['audit_trace_id'] for row in output['rows']} == {row['id'] for row in output['traces']}}
    per_type = {kind: {'count': sum(m['milestone_type'] == kind for m in pack.milestones.values()),
                       'publicLabels': sum(pack.milestones[mid]['milestone_type'] == kind for mid in labelled_ids),
                       'decisions': dict(Counter(results[mid]['decision'] for mid, m in pack.milestones.items()
                                                 if m['milestone_type'] == kind))}
                for kind in sorted({m['milestone_type'] for m in pack.milestones.values()})}
    return {'specVersion': engine.spec.SPEC_VERSION, 'source': 'public BTC Data Pack + organizer replies supplied by team',
            'groundTruth': {'public': len(pack.decisions), 'hiddenKnownCount': 250, 'holdoutKnownCount': 135,
                            'hiddenMembershipAvailable': False, 'hiddenLabelsAvailable': False},
            'fingerprints': fingerprints, 'checks': checks, 'passed': all(checks.values()),
            'summary': output['summary'], 'publicComparedColumns': 17, 'sampleMismatches': mismatches,
            'coverage': {'milestones': len(results), 'unlabelled': len(results) - len(labelled_ids),
                         'types': len(per_type), 'typesWithPublicLabels': len(labelled_types),
                         'ruleScopes': len(pack.rules_by_scope), 'scopesWithPublicLabels': len(labelled_scopes)},
            'perType': per_type, 'confidenceCounts': dict(Counter(row['confidence_score'] for row in output['rows'])),
            'sensitivity': variants,
            'limits': ['Matching public labels does not establish hidden-test accuracy.',
                       'Baseline-compatible dynamic rules are not independently verified hidden ground truth.',
                       'The 385 unlabelled milestone IDs cannot be classified as HIDDEN versus HOLDOUT.']}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, default=ROOT / 'artifacts/btc-review/review.json')
    args = parser.parse_args()
    result = review()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, default=engine.encode, indent=2) + '\n')
    print(json.dumps({'passed': result['passed'], 'coverage': result['coverage'],
                      'decisions': result['summary']['decisions'], 'confidence': result['confidenceCounts'],
                      'output': str(args.output)}, ensure_ascii=False))
    sys.exit(0 if result['passed'] else 1)
