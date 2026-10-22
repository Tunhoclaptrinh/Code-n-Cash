"""Application adapter around the independently tested specification evaluator."""
import argparse
import csv
import hashlib
import io
import json
import sys
from collections import Counter
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from time import perf_counter

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools'))
import kiem_chung_nghiep_vu as spec


def evaluate(as_of=None):
    pack = spec.Pack.load(spec.DEFAULT_DATA)
    results, timings = {}, {}
    for mid in pack.milestones:
        start = perf_counter()
        results[mid] = spec.evaluate(pack, mid, as_of=as_of)
        timings[mid] = (perf_counter() - start) * 1000
    violations = spec.check_invariants(pack, results) if not as_of else []
    if violations:
        raise ValueError('; '.join(violations))
    now = datetime.now(timezone.utc).isoformat()
    fingerprint = hashlib.sha256(''.join(
        hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted((spec.DEFAULT_DATA / '01_data').glob('*.csv'))
    ).encode()).hexdigest()
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
    return {'runId': run_id, 'inputFingerprint': fingerprint, 'rows': rows, 'traces': traces,
            'summary': {'milestones': len(rows), 'contracts': len(pack.contracts), 'decisions': dict(Counter(r['decision'] for r in results.values())),
                        'sampleMatched': matched, 'sampleTotal': len(pack.decisions), 'sampleMismatches': mismatches,
                        'invariantViolations': violations, 'payableMillion': str(sum(r['payable'] for r in results.values())),
                        'penaltyMillion': str(sum(r['penalty'] for r in results.values()))}}


def encode(value):
    if isinstance(value, Decimal):
        return str(value)
    raise TypeError(type(value).__name__)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--json', action='store_true')
    parser.add_argument('--as-of')
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    result = evaluate(args.as_of)
    if args.output:
        args.output.mkdir(parents=True, exist_ok=True)
        with (args.output / 'submission_output.csv').open('w', encoding='utf-8-sig', newline='') as handle:
            writer = csv.DictWriter(handle, fieldnames=result['rows'][0].keys())
            writer.writeheader()
            writer.writerows(result['rows'])
        (args.output / 'audit.json').write_text(json.dumps(result['traces'], default=encode, ensure_ascii=False, indent=2))
        (args.output / 'metrics.json').write_text(json.dumps(result['summary'], default=encode, ensure_ascii=False, indent=2))
    print(json.dumps(result if args.json else result['summary'], default=encode, ensure_ascii=False))
