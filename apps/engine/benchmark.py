"""Synthetic benchmark: labelled cases built from every milestone of the Data Pack.

The 20 public samples are too few to measure generalisation, and the engine was written while
reading them. This module builds a much larger labelled set without touching the engine:

1. For every one of the 405 milestones and every scenario below, it writes a fresh event history
   from the milestone's own parameters (required events, approval roles, due date, grace, penalty
   terms) and the contract's own parties.
2. The expected decision, reason and amounts come from the facts the scenario constructed (how many
   valid required events, valid approvals, open disputes, ...) run through the official rule table
   (first match by priority, ELSE last), never from the engine's own event processing.
3. Cases are split by contract into a development half and a test half, so variants of one milestone
   never sit on both sides. Only the test half is reported as the result.

Every scenario cites the brief, the Data Pack README or an organiser answer as its basis.

    python3 apps/engine/benchmark.py              # summary JSON on stdout
    python3 apps/engine/benchmark.py --report out # also writes cases.csv and metrics.json
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import random
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools'))
import kiem_chung_nghiep_vu as spec  # noqa: E402

DECISIONS = ('RELEASE', 'PENALTY', 'HOLD', 'REJECT')
PAID = ('RELEASE', 'PENALTY')
CENT = Decimal('0.01')
# README section 6: who creates each required event type.
BUYER_EVENTS = {'CONTRACT_SIGNED', 'KICKOFF_CONFIRMED', 'REQUIREMENTS_APPROVED', 'UAT_PASSED', 'ACCEPTANCE'}
SUPPLIER_EVENTS = {'DELIVERY', 'INVOICE', 'GO_LIVE', 'SERVICE_ACTIVATED', 'SERVICE_COMPLETED', 'WARRANTY_COMPLETED'}


@dataclass
class Facts:
    """What a scenario put in the history, in the vocabulary of the rule table."""
    required: int
    valid_required: int
    unauthorized: int = 0
    open_dispute: bool = False
    valid_rejections: int = 0
    approval_required: bool = False
    valid_approvals: int = 0
    quorum: int = 0
    completion: date | None = None
    data_error: bool = False
    anomaly: bool = False


@dataclass
class Case:
    scenario: str
    milestone_id: str
    contract_id: str
    split: str
    expected: dict
    events: list = field(default_factory=list)
    milestone: dict | None = None


def expected_outcome(m, f):
    """Rule table PR*: first match by priority (10..70), ELSE (80) last, amounts by the rule formulas."""
    planned = Decimal(m['planned_payment_vnd_mn'])
    due = date.fromisoformat(m['due_date'])
    grace = int(m['grace_period_days'])
    late_applicable = m['late_penalty_applicable'] == 'TRUE'
    rate, cap = Decimal(m['penalty_rate_pct_per_day']), Decimal(m['max_penalty_pct'])
    complete = f.valid_required == f.required
    days_late = max(0, (f.completion - (due + timedelta(days=grace))).days) if complete and f.completion else 0
    quorum_short = f.approval_required and f.valid_approvals < f.quorum
    unresolved = dict(decision='HOLD', reason='UNRESOLVED_CONDITION', payable=Decimal('0.00'), penalty=Decimal('0.00'))
    if f.data_error:
        # BTC: ELSE is the final default branch and holds the milestone when nothing can be decided.
        return unresolved
    if f.open_dispute:
        return dict(decision='HOLD', reason='OPEN_DISPUTE', payable=Decimal('0.00'), penalty=Decimal('0.00'))
    if f.valid_rejections > 0:
        return dict(decision='REJECT', reason='REJECTION_PRESENT', payable=Decimal('0.00'), penalty=Decimal('0.00'))
    if f.unauthorized > 0:
        return dict(decision='HOLD', reason='UNAUTHORIZED_EVENT', payable=Decimal('0.00'), penalty=Decimal('0.00'))
    if not complete:
        return dict(decision='HOLD', reason='MISSING_REQUIRED_EVENT', payable=Decimal('0.00'), penalty=Decimal('0.00'))
    if quorum_short:
        return dict(decision='HOLD', reason='APPROVAL_QUORUM_NOT_MET', payable=Decimal('0.00'), penalty=Decimal('0.00'))
    if late_applicable and days_late > 0:
        if f.anomaly:
            return unresolved
        penalty = min(Decimal(days_late) * rate / 100 * planned, cap / 100 * planned).quantize(CENT, ROUND_HALF_UP)
        return dict(decision='PENALTY', reason='LATE_COMPLETION', payable=max(Decimal(0), planned - penalty).quantize(CENT, ROUND_HALF_UP),
                    penalty=penalty)
    if f.anomaly:
        # Brief principle: a payment is never made on a record that is not fully clear.
        return unresolved
    return dict(decision='RELEASE', reason='ALL_CONDITIONS_MET', payable=planned.quantize(CENT), penalty=Decimal('0.00'))


class Builder:
    """Writes one milestone history. Timestamps are spaced one hour apart from a chosen start."""

    def __init__(self, pack, m, start):
        self.pack, self.m = pack, m
        self.c = pack.contracts[m['contract_id']]
        self.at = start
        self.events = []
        self.n = 0

    def add(self, event_type, actor, status, document_id='', reference='', at=None):
        self.n += 1
        when = at or self.at
        self.at = when + timedelta(hours=1)
        party = self.pack.parties.get(actor, {'party_type': 'UNKNOWN'})
        event = {
            'event_id': f"BM-{self.m['milestone_id']}-{self.n:02d}", 'contract_id': self.m['contract_id'],
            'milestone_id': self.m['milestone_id'], 'contract_event_sequence': str(self.n),
            'event_timestamp': when.isoformat(timespec='seconds'), 'event_type': event_type, 'event_status': status,
            'actor_party_id': actor, 'actor_party_type': party['party_type'], 'actor_role': party['party_type'],
            'event_source': 'BENCHMARK', 'document_id': document_id, 'amount_vnd_mn': '', 'reference_event_id': reference,
            'event_note': '', 'data_is_synthetic': 'TRUE',
        }
        self.events.append(event)
        return event

    def owner(self, event_type):
        return self.c['buyer_id'] if event_type in BUYER_EVENTS else self.c['supplier_id']

    def wrong_side(self, event_type):
        return self.c['supplier_id'] if event_type in BUYER_EVENTS else self.c['buyer_id']

    def required(self, event_type, *, actor=None, status='CONFIRMED', at=None, document_id=None):
        doc = document_id or f"DOC-{self.m['milestone_id']}-{event_type}"
        return self.add(event_type, actor or self.owner(event_type), status, doc, at=at)


def approvers(pack, buyer_id):
    return {p['approval_role']: p['party_id'] for p in pack.parties.values()
            if p['party_type'] == 'APPROVER' and p['parent_party_id'] == buyer_id and p['status'] == 'ACTIVE'
            and p['can_approve_payment'] == 'TRUE'}


def scenarios(pack, m, extra_parties):
    """Yields (scenario, events, facts, milestone_override) for one milestone; skips what does not apply."""
    req = [t for t in m['required_event_types'].split(';') if t]
    roles = [r for r in m['required_approval_roles'].split(';') if r]
    approval_required = m['approval_required'] == 'TRUE'
    quorum = int(m['required_approval_quorum'])
    c = pack.contracts[m['contract_id']]
    by_role = approvers(pack, c['buyer_id'])
    if any(r not in by_role for r in roles) or not req:
        return
    due = date.fromisoformat(m['due_date'])
    grace = int(m['grace_period_days'])
    on_time = datetime.combine(due - timedelta(days=3), datetime.min.time()).replace(hour=9)
    rng = random.Random(m['milestone_id'])
    pick = rng.choice(req)
    base = dict(required=len(req), approval_required=approval_required, quorum=quorum)

    def history(start=on_time, *, skip=(), approvals_at=None, approval_roles=None):
        b = Builder(pack, m, start)
        for t in req:
            if t not in skip:
                b.required(t)
        b.at = approvals_at or b.at
        for role in (roles if approval_roles is None else approval_roles):
            b.add('APPROVAL', by_role[role], 'APPROVED', f"APR-{m['milestone_id']}-{role}")
        return b

    def done(b, **facts):
        stamps = [datetime.fromisoformat(e['event_timestamp']) for e in b.events if e['event_type'] in req]
        f = Facts(**{**base, 'valid_required': len(req), 'valid_approvals': len(roles),
                     'completion': max(stamps).date() if stamps else None, **facts})
        return b.events, f

    # README 11: CLEAN_RELEASE.
    yield ('CLEAN_RELEASE', *done(history()), None)

    # README 7: a resent copy of the same document is one piece of evidence.
    b = history()
    first = next(e for e in b.events if e['event_type'] == pick)
    b.required(pick, document_id=first['document_id'])
    yield ('DUPLICATE_EVENT_RELEASE', *done(b), None)

    # README 6.5: duplicate approvals by one approver count once.
    if approval_required and quorum >= 2:
        b = history(approval_roles=roles[:1])
        b.add('APPROVAL', by_role[roles[0]], 'APPROVED', f"APR-{m['milestone_id']}-{roles[0]}")
        yield ('DUPLICATE_APPROVAL_HOLD', *done(b, valid_approvals=1), None)

    # README 11: MISSING_EVENT_HOLD.
    yield ('MISSING_EVENT_HOLD', *done(history(skip={pick}), valid_required=len(req) - 1, completion=None), None)

    # README 6.2: an event without a valid status is not evidence.
    b = history(skip={pick})
    b.required(pick, status='PENDING')
    yield ('INVALID_STATUS_HOLD', *done(b, valid_required=len(req) - 1, completion=None), None)

    # README 6.3 and rule PR*30: the wrong side created the required event.
    b = history(skip={pick})
    b.required(pick, actor=b.wrong_side(pick))
    yield ('UNAUTHORIZED_EVENT_HOLD', *done(b, valid_required=len(req) - 1, unauthorized=1, completion=None), None)

    # Rule PR*30 also holds when a valid copy exists next to an unauthorized one.
    b = history()
    b.required(pick, actor=b.wrong_side(pick), document_id=f"DOC-{m['milestone_id']}-{pick}-X")
    yield ('UNAUTHORIZED_BESIDE_VALID_HOLD', *done(b, unauthorized=1), None)

    # README 6.3: a party of the right type but outside this contract has no authority.
    other = next(p['party_id'] for p in pack.parties.values()
                 if p['party_type'] == ('BUYER' if pick in BUYER_EVENTS else 'SUPPLIER')
                 and p['party_id'] not in (c['buyer_id'], c['supplier_id']))
    b = history(skip={pick})
    b.required(pick, actor=other)
    yield ('FOREIGN_PARTY_HOLD', *done(b, valid_required=len(req) - 1, unauthorized=1, completion=None), None)

    if approval_required:
        # README 11: APPROVAL_PENDING_HOLD.
        yield ('APPROVAL_PENDING_HOLD', *done(history(approval_roles=roles[:-1]), valid_approvals=len(roles) - 1), None)
        # README 6: APPROVAL must come from an approver with authority for this buyer.
        foreign = next(p['party_id'] for p in pack.parties.values() if p['party_type'] == 'APPROVER'
                       and p['parent_party_id'] != c['buyer_id'] and p['approval_role'] == roles[-1])
        b = history(approval_roles=roles[:-1])
        b.add('APPROVAL', foreign, 'APPROVED', f"APR-{m['milestone_id']}-FOREIGN")
        yield ('FOREIGN_APPROVER_HOLD', *done(b, valid_approvals=len(roles) - 1), None)
        # An approver that is no longer active cannot approve.
        b = history(approval_roles=roles[:-1])
        b.add('APPROVAL', extra_parties[by_role[roles[-1]]], 'APPROVED', f"APR-{m['milestone_id']}-INACTIVE")
        yield ('INACTIVE_APPROVER_HOLD', *done(b, valid_approvals=len(roles) - 1), None)

    # README 8: OPEN_DISPUTE_HOLD.
    b = history()
    b.add('DISPUTE_OPENED', c['buyer_id'], 'OPEN', f"DSP-{m['milestone_id']}")
    yield ('OPEN_DISPUTE_HOLD', *done(b, open_dispute=True), None)

    # README 11: RESOLVED_DISPUTE_RELEASE; BTC answer 2: the resolution must reference the dispute.
    b = history()
    opened = b.add('DISPUTE_OPENED', c['buyer_id'], 'OPEN', f"DSP-{m['milestone_id']}")
    b.add('DISPUTE_RESOLVED', c['buyer_id'], 'RESOLVED', f"DSP-{m['milestone_id']}", reference=opened['event_id'])
    yield ('RESOLVED_DISPUTE_RELEASE', *done(b), None)

    b = history()
    b.add('DISPUTE_OPENED', c['buyer_id'], 'OPEN', f"DSP-{m['milestone_id']}")
    b.add('DISPUTE_RESOLVED', c['buyer_id'], 'RESOLVED', f"DSP-{m['milestone_id']}", reference='EV-UNKNOWN')
    yield ('RESOLUTION_WITHOUT_REFERENCE_HOLD', *done(b, open_dispute=True), None)

    # README 11: REJECTION by an approver of this buyer.
    b = history()
    b.add('REJECTION', by_role['CONTRACT_OWNER'], 'REJECTED', f"REJ-{m['milestone_id']}")
    yield ('REJECTION', *done(b, valid_rejections=1), None)

    # Rule priority: an open dispute (10) wins over a rejection (20).
    b = history()
    b.add('REJECTION', by_role['CONTRACT_OWNER'], 'REJECTED', f"REJ-{m['milestone_id']}")
    b.add('DISPUTE_OPENED', c['buyer_id'], 'OPEN', f"DSP-{m['milestone_id']}")
    yield ('DISPUTE_OVER_REJECTION_HOLD', *done(b, valid_rejections=1, open_dispute=True), None)

    # A supplier cannot reject the buyer's milestone; the invalid record still blocks an automatic payment.
    b = history()
    b.add('REJECTION', c['supplier_id'], 'REJECTED', f"REJ-{m['milestone_id']}")
    yield ('UNAUTHORIZED_REJECTION_HOLD', *done(b, anomaly=True), None)

    # README 10: completion exactly at due date + grace is on time.
    edge = datetime.combine(due + timedelta(days=grace), datetime.min.time()).replace(hour=8)
    yield ('COMPLETED_AT_GRACE_END', *done(history(edge - timedelta(hours=len(req)))), None)

    # README 10 and BTC answer 1: lateness counts from due date + grace, penalty capped.
    for days in (1, rng.randint(2, 9), 400):
        start = datetime.combine(due + timedelta(days=grace + days), datetime.min.time()).replace(hour=9)
        name = {1: 'LATE_BY_ONE_DAY', 400: 'LATE_BEYOND_CAP'}.get(days, 'LATE_BY_DAYS')
        yield (name, *done(history(start)), None)

    # BTC answer 1: approvals do not move the completion date.
    if approval_required:
        late = datetime.combine(due + timedelta(days=grace + 15), datetime.min.time()).replace(hour=9)
        yield ('LATE_APPROVAL_ON_TIME_WORK', *done(history(approvals_at=late)), None)

    # BTC answer 1: DISPUTE_RESOLVED does not move the completion date.
    b = history()
    late = datetime.combine(due + timedelta(days=grace + 20), datetime.min.time()).replace(hour=9)
    opened = b.add('DISPUTE_OPENED', c['buyer_id'], 'OPEN', f"DSP-{m['milestone_id']}")
    b.add('DISPUTE_RESOLVED', c['buyer_id'], 'RESOLVED', f"DSP-{m['milestone_id']}", reference=opened['event_id'], at=late)
    yield ('LATE_RESOLUTION_ON_TIME_WORK', *done(b), None)

    # Rule priority: missing approval (50) is decided before lateness (60).
    if approval_required:
        start = datetime.combine(due + timedelta(days=grace + 5), datetime.min.time()).replace(hour=9)
        yield ('LATE_AND_APPROVAL_PENDING_HOLD', *done(history(start, approval_roles=roles[:-1]),
                                                        valid_approvals=len(roles) - 1), None)

    # Brief principle: a record that cannot be trusted holds the payment.
    b = history()
    b.add('APPROVAL', 'P-UNKNOWN', 'APPROVED', f"APR-{m['milestone_id']}-UNKNOWN")
    yield ('UNKNOWN_ACTOR_HOLD', *done(b, anomaly=True), None)

    # Rule PR*30: an unknown actor cannot provide a required event either.
    b = history(skip={pick})
    b.required(pick, actor='P-UNKNOWN')
    yield ('UNKNOWN_ACTOR_REQUIRED_HOLD', *done(b, valid_required=len(req) - 1, unauthorized=1, completion=None), None)

    b = history()
    stray = b.required(pick, document_id=f"DOC-{m['milestone_id']}-STRAY")
    stray['contract_id'] = next(k for k in pack.contracts if k != m['contract_id'])
    yield ('CONTRACT_MISMATCH_HOLD', *done(b, data_error=True), None)

    # BTC: ELSE holds what cannot be decided, here an unreadable approval quorum.
    broken = dict(m, required_approval_quorum='?')
    yield ('UNREADABLE_PARAMETER_HOLD', *done(history(), data_error=True), broken)


def split_of(contract_id):
    return 'dev' if int(hashlib.sha256(contract_id.encode()).hexdigest(), 16) % 2 == 0 else 'test'


def build(pack):
    """All cases, grouped by scenario so each scenario becomes one pack with one history per milestone."""
    extra = {}
    for p in list(pack.parties.values()):
        if p['party_type'] == 'APPROVER':
            clone = dict(p, party_id=p['party_id'] + 'X', status='INACTIVE')
            extra[p['party_id']] = clone['party_id']
    parties = list(pack.parties.values()) + [dict(p, party_id=extra[p['party_id']], status='INACTIVE')
                                             for p in pack.parties.values() if p['party_id'] in extra]
    pack_with = spec.Pack(pack.contracts.values(), parties, pack.milestones.values(), (), pack.rules)
    cases = defaultdict(list)
    for mid, m in pack.milestones.items():
        for name, events, facts, override in scenarios(pack_with, m, extra):
            assert all(case.milestone_id != mid for case in cases[name]), (name, mid)
            cases[name].append(Case(name, mid, m['contract_id'], split_of(m['contract_id']),
                                    expected_outcome(m, facts), events, override))
    return cases, parties


def run(pack):
    cases, parties = build(pack)
    results = []
    for name, group in cases.items():
        milestones = dict(pack.milestones)
        for case in group:
            if case.milestone:
                milestones[case.milestone_id] = case.milestone
        events = [e for case in group for e in case.events]
        scenario_pack = spec.Pack(pack.contracts.values(), parties, milestones.values(), events, pack.rules)
        for case in group:
            got = spec.evaluate(scenario_pack, case.milestone_id)
            results.append((case, got))
    return results


def wilson(k, n, z=1.96):
    if n == 0:
        return None
    p = k / n
    centre = (p + z * z / (2 * n)) / (1 + z * z / n)
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / (1 + z * z / n)
    return [max(0.0, round(centre - half, 4)), min(1.0, round(centre + half, 4))]


def f1_scores(pairs):
    scores = {}
    for d in DECISIONS:
        tp = sum(e == d and g == d for e, g in pairs)
        fp = sum(e != d and g == d for e, g in pairs)
        fn = sum(e == d and g != d for e, g in pairs)
        if tp + fp + fn:
            scores[d] = dict(precision=round(tp / (tp + fp), 4) if tp + fp else None,
                             recall=round(tp / (tp + fn), 4) if tp + fn else None,
                             f1=round(2 * tp / (2 * tp + fp + fn), 4), support=tp + fn)
    return scores


def metrics(results):
    pairs = [(c.expected['decision'], g['decision']) for c, g in results]
    n = len(results)
    correct = sum(e == g for e, g in pairs)
    full = sum(c.expected['decision'] == g['decision'] and c.expected['reason'] == g['reason_code']
               and c.expected['payable'] == g['payable'] and c.expected['penalty'] == g['penalty'] for c, g in results)
    amounts = sum(c.expected['payable'] == g['payable'] and c.expected['penalty'] == g['penalty'] for c, g in results)
    held = [(c, g) for c, g in results if c.expected['decision'] not in PAID]
    paid = [(c, g) for c, g in results if c.expected['decision'] in PAID]
    per_class = f1_scores(pairs)
    macro = sum(s['f1'] for s in per_class.values()) / len(per_class) if per_class else None
    # Bootstrap over contracts: variants of one contract move together.
    by_contract = defaultdict(list)
    for e, g in zip(pairs, results):
        by_contract[g[0].contract_id].append(e)
    keys = sorted(by_contract)
    rng = random.Random(2026)
    draws = []
    for _ in range(300):
        sample = [p for k in rng.choices(keys, k=len(keys)) for p in by_contract[k]]
        scores = f1_scores(sample)
        draws.append(sum(s['f1'] for s in scores.values()) / len(scores))
    draws.sort()
    confusion = Counter(f'{e}->{g}' for e, g in pairs)
    return {
        'cases': n,
        'decisionAccuracy': dict(correct=correct, total=n, wilson95=wilson(correct, n)),
        'fullMatch': dict(correct=full, total=n, wilson95=wilson(full, n)),
        'amountAccuracy': dict(correct=amounts, total=n),
        'macroF1': round(macro, 4) if macro is not None else None,
        'macroF1Bootstrap95': [round(draws[7], 4), round(draws[292], 4)] if draws else None,
        'perClass': per_class,
        'unauthorizedPayment': dict(count=sum(g['decision'] in PAID for _, g in held), total=len(held),
                                    wilson95=wilson(sum(g['decision'] in PAID for _, g in held), len(held))),
        'overHold': dict(count=sum(g['decision'] not in PAID for _, g in paid), total=len(paid)),
        'confusion': dict(sorted(confusion.items())),
    }


def summarise(results):
    by_split = defaultdict(list)
    for item in results:
        by_split[item[0].split].append(item)
    scenarios_seen = Counter(c.scenario for c, _ in results)
    failures = [dict(scenario=c.scenario, milestone=c.milestone_id, split=c.split,
                     expected={k: str(v) for k, v in c.expected.items()},
                     got=dict(decision=g['decision'], reason=g['reason_code'], payable=str(g['payable']), penalty=str(g['penalty'])))
                for c, g in results if (c.expected['decision'], c.expected['reason'], c.expected['payable'], c.expected['penalty'])
                != (g['decision'], g['reason_code'], g['payable'], g['penalty'])]
    return {
        'scenarios': dict(sorted(scenarios_seen.items())),
        'labels': dict(Counter(c.expected['decision'] for c, _ in results)),
        'dev': metrics(by_split['dev']),
        'test': metrics(by_split['test']),
        'failures': failures[:50],
        'failureCount': len(failures),
    }


def public_split(pack):
    """The 20 public samples, split per scenario type into two halves of 10."""
    labels = {r['milestone_id']: r for r in spec.read(pack.base, '03_labels_sample/scenario_labels_sample.csv')}
    halves = {'dev': [], 'test': []}
    groups = defaultdict(list)
    for d in pack.decisions:
        groups[labels[d['milestone_id']]['scenario_type']].append(d)
    turn = 0
    for name in sorted(groups):
        for d in groups[name]:
            halves['dev' if turn % 2 == 0 else 'test'].append(d)
            turn += 1
    out = {}
    for half, rows in halves.items():
        pairs = [(d['expected_decision'], spec.evaluate(pack, d['milestone_id'])['decision']) for d in rows]
        per_class = f1_scores(pairs)
        correct = sum(e == g for e, g in pairs)
        out[half] = dict(cases=len(rows), correct=correct, wilson95=wilson(correct, len(rows)),
                         macroF1=round(sum(s['f1'] for s in per_class.values()) / len(per_class), 4), perClass=per_class)
    return out


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--report', type=Path, help='folder for cases.csv and metrics.json')
    args = parser.parse_args()
    pack = spec.Pack.load(spec.DEFAULT_DATA)
    results = run(pack)
    summary = {'publicSamples': public_split(pack), 'synthetic': summarise(results)}
    if args.report:
        args.report.mkdir(parents=True, exist_ok=True)
        (args.report / 'metrics.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2))
        with (args.report / 'cases.csv').open('w', encoding='utf-8', newline='') as handle:
            writer = csv.writer(handle)
            writer.writerow(['scenario', 'milestone_id', 'contract_id', 'split', 'expected_decision', 'expected_reason',
                             'expected_payable', 'expected_penalty', 'decision', 'reason', 'payable', 'penalty'])
            for c, g in results:
                writer.writerow([c.scenario, c.milestone_id, c.contract_id, c.split, c.expected['decision'], c.expected['reason'],
                                 c.expected['payable'], c.expected['penalty'], g['decision'], g['reason_code'], g['payable'], g['penalty']])
    print(json.dumps(summary, ensure_ascii=False, indent=2))
