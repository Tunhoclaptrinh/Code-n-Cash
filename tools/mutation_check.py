"""Mutation check: does the evidence behind the KPIs notice a broken engine?

A perfect score on a benchmark the team built itself says little unless that benchmark fails when the
engine is wrong. Each mutant below plants one realistic bug (most are the "Lỗi" of the Data Pack README
section 20) by replacing one engine function for the duration of a run, then counts which evidence
notices it:

- the 20 public samples (``compare_samples``: all 17 labelled columns);
- the synthetic benchmark (``apps/engine/benchmark.py``: decision, reason, payable and penalty).

A mutant is killed by a source when at least one of its cases differs from the expected answer. The
kill rate of each source is the share of mutants it kills.

    python3 tools/mutation_check.py            # all 405 milestones, JSON report on stdout
    python3 tools/mutation_check.py --quick    # the first 20 contracts, for the unit test
"""
import argparse
import ast
import json
import sys
from contextlib import contextmanager
from datetime import timedelta
from decimal import ROUND_HALF_EVEN
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'apps/engine'))
import benchmark  # noqa: E402
import codecash_engine as spec  # noqa: E402
from codecash_engine import amounts, controls, events, expressions, requirements, rules, schedule  # noqa: E402
from codecash_engine.pack import SUPPORT_TYPES  # noqa: E402

ORIGINAL = {
    'dedupe': events.dedupe, 'required_authorized': requirements.required_authorized,
    'classify_required': requirements.classify_required, 'valid_resolution': controls.valid_resolution,
    'open_disputes': controls.open_disputes, 'valid_rejections': controls.valid_rejections,
    'count_approvals': controls.count_approvals, 'approver_of_contract': controls.approver_of_contract,
    'days_late_after_grace': schedule.days_late_after_grace,
    'completion_timestamp': schedule.completion_timestamp, 'select_rule': rules.select_rule,
    'rule_amounts': amounts.rule_amounts, 'eval': expressions._eval,
}


def _any_status(parties, contract, evts, required_types, literal_permissions=False):
    """Required events count whatever their status."""
    valid, unauthorized, unrelated = {}, [], []
    for e in evts:
        if e['event_type'] in required_types:
            if ORIGINAL['required_authorized'](parties, contract, e, literal_permissions):
                valid.setdefault(e['event_type'], e)
            else:
                unauthorized.append(e)
        elif e['event_type'] not in SUPPORT_TYPES:
            unrelated.append(e)
    return valid, unauthorized, unrelated


def _latest_copy(parties, contract, evts, required_types, literal_permissions=False):
    """The latest valid event per type wins instead of the earliest."""
    valid, unauthorized, unrelated = ORIGINAL['classify_required'](parties, contract, evts, required_types,
                                                                   literal_permissions)
    for e in evts:
        if e['event_type'] in valid and e['event_status'] == valid[e['event_type']]['event_status'] \
                and ORIGINAL['required_authorized'](parties, contract, e, literal_permissions):
            valid[e['event_type']] = e
    return valid, unauthorized, unrelated


def _approvals_counted_not_roles(parties, contract, evts, roles, planned=None):
    approvals, _, over = ORIGINAL['count_approvals'](parties, contract, evts, roles, planned)
    return approvals, len(approvals), over


def _approvals_any_role(parties, contract, evts, roles, planned=None):
    every_role = sorted({p['approval_role'] for p in parties.values()})
    approvals, _, over = ORIGINAL['count_approvals'](parties, contract, evts, every_role, planned)
    return approvals, len({parties[a]['approval_role'] for a in approvals}), over


def _rejections_from_anyone(parties, contract, evts):
    return [e for e in evts if e['event_type'] == 'REJECTION'], []


def _last_match(scope_rules, env, issues, anomalies):
    fallback = rules.fallback_rule(scope_rules)
    if issues:
        return fallback
    matching = [r for r in scope_rules if r is not fallback and expressions.evaluate_expr(r['condition_expression'], env)]
    return matching[-1] if matching else fallback


def _min_as_max(node, env, source=None):
    """MIN behaves as MAX, so the penalty cap stops capping. The original evaluator recurses through the
    module-level name ``_eval``, which is this function while the mutant is planted."""
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == 'MIN':
        return max(_min_as_max(a, env, source) for a in node.args)
    return ORIGINAL['eval'](node, env, source)


MUTANTS = {
    # README Lỗi 2: a resent event counts again.
    'DEDUPLICATION_OFF': (events, 'dedupe', lambda evts: (list(evts), [])),
    # README Lỗi 1: only the event type is checked.
    'AUTHORITY_OFF': (requirements, 'required_authorized', lambda *a, **k: True),
    'STATUS_IGNORED': (requirements, 'classify_required', _any_status),
    'LATEST_COPY_WINS': (requirements, 'classify_required', _latest_copy),
    # README Lỗi 3: an open dispute is ignored.
    'DISPUTE_IGNORED': (controls, 'open_disputes', lambda *a, **k: []),
    # A resolution closes every dispute of the milestone, whatever it references.
    'RESOLUTION_CLOSES_ALL': (controls, 'open_disputes',
                              lambda scope, *a, **k: [] if any(e['event_type'] == 'DISPUTE_RESOLVED' for e in scope)
                              else [e for e in scope if e['event_type'] == 'DISPUTE_OPENED']),
    'REJECTION_FROM_ANYONE': (controls, 'valid_rejections', _rejections_from_anyone),
    # README Lỗi 4: approvals are counted without checking the role.
    'APPROVALS_NOT_ROLES': (controls, 'count_approvals', _approvals_counted_not_roles),
    'APPROVAL_ANY_ROLE': (controls, 'count_approvals', _approvals_any_role),
    'INACTIVE_APPROVER_ALLOWED': (controls, 'approver_of_contract',
                                  lambda parties, contract, e: (parties.get(e['actor_party_id']) or {}).get(
                                      'parent_party_id') == contract['buyer_id']
                                  and parties[e['actor_party_id']]['can_approve_payment'] == 'TRUE'),
    # README Lỗi 5: penalty before the grace period.
    'GRACE_IGNORED': (schedule, 'days_late_after_grace',
                      lambda done, due, grace: max(0, (done - due).days) if done and due else 0),
    'COMPLETION_INCLUDES_APPROVAL': (schedule, 'completion_timestamp',
                                     lambda valid, approvals, missing, includes_approval=False:
                                     ORIGINAL['completion_timestamp'](valid, approvals, missing, True)),
    'DEADLINE_OFF_BY_ONE': (schedule, 'days_late_after_grace',
                            lambda done, due, grace: max(0, (done - (due + timedelta(days=grace))).days + 1)
                            if done and due else 0),
    'PENALTY_CAP_REMOVED': (expressions, '_eval', _min_as_max),
    'FIRST_MATCH_REVERSED': (rules, 'select_rule', _last_match),
    'ROUNDING_HALF_EVEN': (amounts, 'rule_amounts',
                           lambda rule, env, rounding=None: ORIGINAL['rule_amounts'](rule, env, ROUND_HALF_EVEN)),
}


@contextmanager
def planted(name):
    module, attribute, replacement = MUTANTS[name]
    original = getattr(module, attribute)
    setattr(module, attribute, replacement)
    try:
        yield
    finally:
        setattr(module, attribute, original)


def subset(pack, contracts):
    """The pack restricted to its first ``contracts`` contracts (all parties and rules kept)."""
    keep = sorted(pack.contracts)[:contracts]
    return spec.Pack([pack.contracts[c] for c in keep], pack.parties.values(),
                     [m for m in pack.milestones.values() if m['contract_id'] in keep],
                     [e for e in pack.events if e['contract_id'] in keep], pack.rules,
                     [d for d in pack.decisions if d['contract_id'] in keep])


def outcome(result):
    return result['decision'], result['reason_code'], result['payable'], result['penalty']


def benchmark_failures(pack):
    return sum(outcome(got) != (case.expected['decision'], case.expected['reason'], case.expected['payable'],
                                case.expected['penalty']) for case, got in benchmark.run(pack))


def sample_failures(pack):
    if not pack.decisions:
        return 0
    results = {d['milestone_id']: spec.evaluate(pack, d['milestone_id']) for d in pack.decisions}
    return len(spec.compare_samples(pack, results)[1])


def check(pack):
    baseline = {'benchmark': benchmark_failures(pack), 'samples': sample_failures(pack)}
    rows = []
    for name in MUTANTS:
        with planted(name):
            rows.append({'mutant': name, 'benchmarkFailures': benchmark_failures(pack),
                         'sampleFailures': sample_failures(pack)})
    killed = lambda key: [r['mutant'] for r in rows if r[key] > 0]
    return {
        'mutants': len(rows), 'baselineFailures': baseline,
        'killedBySamples': len(killed('sampleFailures')), 'killedByBenchmark': len(killed('benchmarkFailures')),
        'survivors': {'samples': [r['mutant'] for r in rows if not r['sampleFailures']],
                      'benchmark': [r['mutant'] for r in rows if not r['benchmarkFailures']]},
        'rows': rows,
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--quick', action='store_true', help='first 20 contracts only')
    args = parser.parse_args()
    data = spec.Pack.load(spec.DEFAULT_DATA)
    print(json.dumps(check(subset(data, 20) if args.quick else data), indent=1))
