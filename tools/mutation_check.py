"""Mutation check: does the evidence behind the KPIs notice a broken engine?

A perfect score on a benchmark the team built itself says little unless that benchmark fails when the
engine is wrong. Each mutant below plants one realistic bug (most are the "Lỗi" of the Data Pack README
section 20), either by replacing one engine function or by changing one value of the policy pack for the
duration of a run, then counts which evidence notices it:

- the 20 public samples (``compare_samples``: all 17 labelled columns);
- the synthetic benchmark (``apps/engine/benchmark.py``: decision, reason, payable and penalty).

A mutant is killed by a source when at least one of its cases differs from the expected answer. The
kill rate of each source is the share of mutants it kills.

    python3 tools/mutation_check.py            # all 405 milestones, JSON report on stdout
    python3 tools/mutation_check.py --quick    # the first 20 contracts, for the unit test
"""
import argparse
import copy
import json
import sys
from contextlib import contextmanager
from datetime import timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'apps/engine'))
import benchmark  # noqa: E402
import codecash_engine as spec  # noqa: E402
from codecash_engine import controls, expressions, policy as policy_module, requirements, rules, schedule  # noqa: E402

ORIGINAL = {
    'classify_required': requirements.classify_required, 'open_disputes': controls.open_disputes,
    'count_approvals': controls.count_approvals, 'completion_timestamp': schedule.completion_timestamp,
    'select_rule': rules.select_rule, 'evaluate_expr': expressions.evaluate_expr,
}


def _any_status(verdicts):
    """Required events count whatever their status."""
    valid, unauthorized, unrelated = ORIGINAL['classify_required'](verdicts)
    for v in verdicts:
        if v.flags['required'] and v.flags['required_authorized']:
            valid.setdefault(v.event['event_type'], v.event)
    return valid, unauthorized, unrelated


def _latest_copy(verdicts):
    """The latest valid event per type wins instead of the earliest."""
    valid, unauthorized, unrelated = ORIGINAL['classify_required'](verdicts)
    for v in verdicts:
        if v.flags['required'] and v.flags['required_authorized'] and v.flags['status_ok']:
            valid[v.event['event_type']] = v.event
    return valid, unauthorized, unrelated


def _approvals_counted_not_roles(policy, verdicts, planned=None):
    approvals, _, over = ORIGINAL['count_approvals'](policy, verdicts, planned)
    return approvals, len(approvals), over


def _resolution_closes_all(policy, scope, *args):
    if any(e['event_type'] == 'DISPUTE_RESOLVED' for e in scope):
        return []
    return [e for e in scope if e['event_type'] == 'DISPUTE_OPENED']


def _last_match(scope_rules, env, issues, anomalies, policy):
    """The last matching rule before ELSE wins instead of the first."""
    fallback = rules.fallback_rule(scope_rules, policy)
    reordered = [r for r in reversed(scope_rules) if r is not fallback] + ([fallback] if fallback else [])
    return ORIGINAL['select_rule'](reordered, env, issues, anomalies, policy)


def _min_as_max(text, env):
    """MIN behaves as MAX, so the penalty cap stops capping."""
    return ORIGINAL['evaluate_expr'](text.replace('MIN(', 'MAX('), env)


def _set(path, value):
    """A policy mutant: the policy document with one value replaced (``path`` is a dotted key)."""
    def change(document):
        node = document
        keys = path.split('.')
        for key in keys[:-1]:
            node = node[key]
        node[keys[-1]] = value
    return change


# Code mutants replace one engine function; policy mutants (a callable editing the policy document) plant
# the same kind of bug as a wrong policy pack, which is how a business rule would now be broken.
MUTANTS = {
    # README Lỗi 2: a resent event counts again.
    'DEDUPLICATION_OFF': _set('dedupe.fields', ['event_id']),
    # README Lỗi 1: only the event type is checked.
    'AUTHORITY_OFF': _set('requirements.authorized_when', "kind.category == 'EVIDENCE'"),
    'STATUS_IGNORED': (requirements, 'classify_required', _any_status),
    'LATEST_COPY_WINS': (requirements, 'classify_required', _latest_copy),
    # README Lỗi 3: an open dispute is ignored.
    'DISPUTE_IGNORED': (controls, 'open_disputes', lambda *a, **k: []),
    # A resolution closes every dispute of the milestone, whatever it references.
    'RESOLUTION_CLOSES_ALL': (controls, 'open_disputes', _resolution_closes_all),
    'REJECTION_FROM_ANYONE': _set('categories.REJECTION.authority', 'TRUE'),
    # README Lỗi 4: approvals are counted without checking the role.
    'APPROVALS_NOT_ROLES': (controls, 'count_approvals', _approvals_counted_not_roles),
    'APPROVAL_ANY_ROLE': _set('approvals.counts_when', 'TRUE'),
    'INACTIVE_APPROVER_ALLOWED': _set('definitions.buyer_approver',
                                      "actor.party_type == 'APPROVER' AND actor.parent_party_id == contract.buyer_id "
                                      "AND actor.can_approve_payment == TRUE"),
    # README Lỗi 5: penalty before the grace period.
    'GRACE_IGNORED': (schedule, 'days_late_after_grace',
                      lambda done, due, grace: max(0, (done - due).days) if done and due else 0),
    'COMPLETION_INCLUDES_APPROVAL': _set('completion.categories', ['EVIDENCE', 'APPROVAL']),
    'DEADLINE_OFF_BY_ONE': (schedule, 'days_late_after_grace',
                            lambda done, due, grace: max(0, (done - (due + timedelta(days=int(grace)))).days + 1)
                            if done and due else 0),
    'PENALTY_CAP_REMOVED': (expressions, 'evaluate_expr', _min_as_max),
    'FIRST_MATCH_REVERSED': (rules, 'select_rule', _last_match),
    'ROUNDING_HALF_EVEN': _set('amounts.rounding', 'ROUND_HALF_EVEN'),
}


@contextmanager
def planted(name):
    mutant = MUTANTS[name]
    if callable(mutant):
        path = policy_module.DEFAULT_POLICY.resolve()
        original = policy_module.load_policy()
        document = copy.deepcopy(original.document)
        mutant(document)
        policy_module._LOADED[path] = policy_module.Policy(document, original.catalog)
        try:
            yield
        finally:
            policy_module._LOADED[path] = original
        return
    module, attribute, replacement = mutant
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
