"""Application adapter around the independently tested specification evaluator."""
import argparse
import csv
import hashlib
import io
import json
import sys
import zipfile
from collections import Counter
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from time import perf_counter

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools'))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import kiem_chung_nghiep_vu as spec
import dataset


def evaluate(as_of=None, data=None):
    """Official Data Pack by default. With `data`, an uploaded dataset: invariant breaks are reported, not raised."""
    if data:
        pack, fingerprint, source = dataset.load(data)
    else:
        pack = spec.Pack.load(spec.DEFAULT_DATA)
        fingerprint = hashlib.sha256(''.join(
            hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted((spec.DEFAULT_DATA / '01_data').glob('*.csv'))
        ).encode()).hexdigest()
        source = {'kind': 'datapack'}
    results, timings = {}, {}
    for mid in pack.milestones:
        start = perf_counter()
        try:
            results[mid] = spec.evaluate(pack, mid, as_of=as_of)
        except (KeyError, ValueError, ArithmeticError) as error:
            raise ValueError(f'EVALUATION_FAILED {mid}: {type(error).__name__} {error}') from error
        timings[mid] = (perf_counter() - start) * 1000
    violations = spec.check_invariants(pack, results) if not as_of else []
    if violations and not data:
        raise ValueError('; '.join(violations))
    now = datetime.now(timezone.utc).isoformat()
    run_id = 'run-' + hashlib.sha256((fingerprint + spec.SPEC_VERSION + str(as_of)).encode()).hexdigest()[:16]
    flags = spec.assumption_flags(pack, results)
    rows, traces = [], []
    for template in pack.template:
        mid = template['milestone_id']
        result = results[mid]
        trace_id = f'{run_id}:{mid}'
        row = dict(template)
        row.update(predicted_decision=result['decision'], predicted_milestone_status=result['status'],
                   conditions_met=';'.join(result['conditions_met']), missing_conditions=';'.join(result['missing_conditions']),
                   payable_amount_vnd_mn=str(result['payable']), penalty_amount_vnd_mn=str(result['penalty']),
                   reason_code=result['reason_code'], decision_reason=result['reason_code'],
                   evidence_event_ids=';'.join(result['evidence']), rule_id_applied=result['rule_id'],
                   confidence_score=str(spec.confidence_score(result, flags.get(mid))), processing_time_ms=f'{timings[mid]:.4f}',
                   evaluated_at=now, engine_name=f'codecash-spec-{spec.SPEC_VERSION}', audit_trace_id=trace_id,
                   notes=';'.join([f'assumptions:{",".join(flags[mid])}' if flags.get(mid) else '', f'as_of:{as_of}' if as_of else 'offline_full_history']).strip(';'))
        rows.append(row)
        traces.append({'id': trace_id, 'inputFingerprint': fingerprint, 'specVersion': spec.SPEC_VERSION,
                       'evaluatedAt': now, 'result': result, 'actors': sorted({pack.event_by_id[e]['actor_party_id'] for e in result['evidence']}),
                       'parameters': pack.milestones[mid]})
    matched, mismatches = spec.compare_samples(pack, results) if not as_of else (None, [])
    # Totals, like the decision counts, cover the output rows (the scope file can narrow them).
    scored = [results[t['milestone_id']] for t in pack.template]
    return {'runId': run_id, 'inputFingerprint': fingerprint, 'rows': rows, 'traces': traces,
            'summary': {'source': source, 'milestones': len(rows), 'contracts': len(pack.contracts),
                        'decisions': dict(Counter(r['decision'] for r in scored)),
                        'sampleMatched': matched, 'sampleTotal': len(pack.decisions), 'sampleMismatches': mismatches,
                        'invariantViolations': violations, 'payableMillion': str(sum(r['payable'] for r in scored)),
                        'penaltyMillion': str(sum(r['penalty'] for r in scored))}}


def encode(value):
    if isinstance(value, Decimal):
        return str(value)
    raise TypeError(type(value).__name__)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--json', action='store_true')
    parser.add_argument('--as-of')
    parser.add_argument('--output', type=Path)
    parser.add_argument('--data', type=Path, help='uploaded dataset folder instead of the official Data Pack')
    parser.add_argument('--inspect', action='store_true', help='only report which files were found in --data')
    args = parser.parse_args()
    try:
        if args.inspect:
            print(json.dumps(dataset.inspect(args.data or spec.DEFAULT_DATA), ensure_ascii=False))
            sys.exit(0)
        result = evaluate(args.as_of, args.data)
    except (ValueError, zipfile.BadZipFile) as error:
        # One line the API can show; a traceback adds nothing for a bad upload.
        print(str(error), file=sys.stderr)
        sys.exit(2)
    if args.output:
        args.output.mkdir(parents=True, exist_ok=True)
        with (args.output / 'submission_output.csv').open('w', encoding='utf-8-sig', newline='') as handle:
            writer = csv.DictWriter(handle, fieldnames=result['rows'][0].keys() if result['rows'] else dataset.TEMPLATE_COLUMNS)
            writer.writeheader()
            writer.writerows(result['rows'])
        (args.output / 'audit.json').write_text(json.dumps(result['traces'], default=encode, ensure_ascii=False, indent=2))
        (args.output / 'metrics.json').write_text(json.dumps(result['summary'], default=encode, ensure_ascii=False, indent=2))
    print(json.dumps(result if args.json else result['summary'], default=encode, ensure_ascii=False))
