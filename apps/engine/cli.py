"""Application adapter around the independently tested specification evaluator."""
import argparse
import csv
import hashlib
import io
import json
import math
import os
import platform
import statistics
import sys
import zipfile
from collections import Counter
from datetime import datetime, timezone
from decimal import ROUND_HALF_UP, Decimal
from fractions import Fraction
from pathlib import Path
from time import perf_counter

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools'))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import kiem_chung_nghiep_vu as spec
import dataset
import validate_rules


PAID = ('RELEASE', 'PENALTY')
# Cells the output checklist (spec 14.6) allows to be empty.
OPTIONAL_CELLS = {'missing_conditions', 'evidence_event_ids'}


def share(count, total):
    return {'count': count, 'total': total}


def kpi(pack, results, rows, traces, timings, matched, started):
    """Spec section 15. Labelled metrics use decision_sample.csv only; coverage, trace and time cover every output row."""
    labelled = [(d, results[d['milestone_id']]) for d in pack.decisions] if matched is not None else []
    scores = []
    for decision in sorted(spec.DECISIONS):
        tp = sum(d['expected_decision'] == decision and r['decision'] == decision for d, r in labelled)
        fp = sum(d['expected_decision'] != decision and r['decision'] == decision for d, r in labelled)
        fn = sum(d['expected_decision'] == decision and r['decision'] != decision for d, r in labelled)
        if tp + fp + fn:
            scores.append(Fraction(2 * tp, 2 * tp + fp + fn))
    macro = sum(scores) / len(scores) if scores else None
    held = [r for d, r in labelled if d['expected_decision'] not in PAID]
    paid = [r for d, r in labelled if d['expected_decision'] in PAID]
    errors = [abs(Decimal(d[column]) - r[key]) for d, r in labelled
              for column, key in (('payable_amount_vnd_mn', 'payable'), ('penalty_amount_vnd_mn', 'penalty'))]
    trace_ids = {t['id'] for t in traces}
    # A decision is traceable when every cell is filled and it cites its evidence or names what is missing.
    traced = sum(all(v != '' for k, v in row.items() if k not in OPTIONAL_CELLS)
                 and bool(row['evidence_event_ids'] or row['missing_conditions'])
                 and row['audit_trace_id'] in trace_ids for row in rows)
    expected = {t['milestone_id'] for t in pack.template}
    once = sum(n == 1 for n in Counter(row['milestone_id'] for row in rows).values())
    times = sorted(timings[mid] for mid in expected)
    return {
        'labelled': len(labelled),
        'decisionAccuracy': share(sum(d['expected_decision'] == r['decision'] for d, r in labelled), len(labelled)) if labelled else None,
        'scenarioAccuracy': share(matched, len(labelled)) if labelled else None,
        'macroF1': str((Decimal(macro.numerator) / macro.denominator).quantize(Decimal('0.0001'), ROUND_HALF_UP)) if macro is not None else None,
        'unauthorizedPayment': share(sum(r['decision'] in PAID for r in held), len(held)) if labelled else None,
        'overHold': share(sum(r['decision'] not in PAID for r in paid), len(paid)) if labelled else None,
        'amountAccuracy': dict(share(sum(Decimal(d['payable_amount_vnd_mn']) == r['payable'] and Decimal(d['penalty_amount_vnd_mn']) == r['penalty']
                                         for d, r in labelled), len(labelled)), maxAbsError=str(max(errors))) if labelled else None,
        'coverage': share(once, len(expected)),
        'traceability': share(traced, len(rows)),
        'processing': {'totalMs': f'{(perf_counter() - started) * 1000:.1f}',
                       'medianMs': f'{statistics.median(times):.4f}' if times else None,
                       'p95Ms': f'{times[math.ceil(0.95 * len(times)) - 1]:.4f}' if times else None,
                       'machine': f'{platform.system()} {platform.machine()}, Python {platform.python_version()}, {os.cpu_count()} CPU'},
    }


def evaluate(as_of=None, data=None):
    """Official Data Pack by default. With `data`, an uploaded dataset: invariant breaks are reported, not raised."""
    started = perf_counter()
    voided = frozenset()
    if data:
        pack, fingerprint, source, voided = dataset.load(data)
    else:
        pack = spec.Pack.load(spec.DEFAULT_DATA)
        fingerprint = hashlib.sha256(''.join(
            hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted((spec.DEFAULT_DATA / '01_data').glob('*.csv'))
        ).encode()).hexdigest()
        source = {'kind': 'datapack'}
    validate_rules.validate(pack.rules)
    results, timings = {}, {}
    for mid in pack.milestones:
        start = perf_counter()
        try:
            results[mid] = spec.evaluate(pack, mid, as_of=as_of, voided=voided)
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
                        'penaltyMillion': str(sum(r['penalty'] for r in scored)),
                        'kpi': kpi(pack, results, rows, traces, timings, matched, started)}}


TIMELINE_FIELDS = ('decision', 'reason_code', 'rule_id', 'status', 'payable', 'penalty', 'days_late', 'missing',
                   'valid_approval_count', 'quorum', 'open_dispute_ids')


def timeline(milestone_id, data=None):
    """Decision of one milestone right after each moment of its history (as-of, BR-16), oldest first."""
    if data:
        pack, _, _, voided = dataset.load(data)
    else:
        pack, voided = spec.Pack.load(spec.DEFAULT_DATA), frozenset()
    validate_rules.validate(pack.rules)
    if milestone_id not in pack.milestones:
        raise ValueError(f'UNKNOWN_MILESTONE {milestone_id}')
    events = pack.events_by_ms[milestone_id]
    points = []
    for at in sorted({e['event_timestamp'] for e in events}):
        result = spec.evaluate(pack, milestone_id, as_of=at, voided=voided)
        points.append({'at': at, 'eventIds': [e['event_id'] for e in events if e['event_timestamp'] == at],
                       **{field: result[field] for field in TIMELINE_FIELDS}})
    return points


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
    parser.add_argument('--timeline', metavar='MILESTONE_ID', help='decision of one milestone after each of its events')
    args = parser.parse_args()
    try:
        if args.inspect:
            print(json.dumps(dataset.inspect(args.data or spec.DEFAULT_DATA), ensure_ascii=False))
            sys.exit(0)
        if args.timeline:
            print(json.dumps(timeline(args.timeline, args.data), default=encode, ensure_ascii=False))
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
