"""Profile of the official Data Pack and of the data the team adds, for the round 3 pitch deck.

Every number on the deck's data slides comes from this script, not from hand counts:

    python tools/pitch/datapack_profile.py --engine-output out/submission_output.csv

writes docs/pitch/data/datapack_profile.json. Run `python apps/engine/cli.py --output out` first.
"""
import argparse
import csv
import json
import statistics
from collections import Counter, defaultdict
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PACK = ROOT / 'BangD-Case4/DataPack-CASE4_SmartContractWorkflow'
SNAPSHOT = date(2026, 10, 18)  # README of the Data Pack: "Snapshot 18/10/2026"


def table(name, folder='01_data'):
    with open(PACK / folder / f'{name}.csv', encoding='utf-8-sig', newline='') as handle:
        return list(csv.DictReader(handle))


def spread(values):
    values = sorted(values)
    return {'min': values[0], 'median': statistics.median(values), 'max': values[-1]}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--engine-output', type=Path, required=True)
    parser.add_argument('--out', type=Path, default=ROOT / 'docs/pitch/data/datapack_profile.json')
    args = parser.parse_args()

    contracts, milestones, events = table('contracts'), table('milestones'), table('events')
    parties, rules = table('parties'), table('payment_rules')
    labels = table('decision_sample', '03_labels_sample')
    party = {p['party_id']: p for p in parties}

    tables = {name: {'rows': len(rows), 'columns': len(rows[0])}
              for name, rows in [('contracts', contracts), ('milestones', milestones), ('events', events),
                                 ('parties', parties), ('payment_rules', rules)]}

    by_contract = defaultdict(list)
    for m in milestones:
        by_contract[m['contract_id']].append(m)
    events_per_milestone = Counter(e['milestone_id'] for e in events if e['milestone_id'])

    # Relationship checks: every foreign key resolves.
    foreign_keys = {
        'milestones.contract_id -> contracts': all(m['contract_id'] in {c['contract_id'] for c in contracts} for m in milestones),
        'events.milestone_id -> milestones': all(e['milestone_id'] in {m['milestone_id'] for m in milestones}
                                                 for e in events if e['milestone_id']),
        'events.actor_party_id -> parties': all(e['actor_party_id'] in party for e in events),
        'contracts.buyer_id/supplier_id -> parties': all(c['buyer_id'] in party and c['supplier_id'] in party for c in contracts),
        'parties.parent_party_id -> parties (approvers)': all(p['parent_party_id'] in party
                                                             for p in parties if p['party_type'] == 'APPROVER'),
    }

    # Patterns the team read out of the data.
    end_dates = {c['contract_id']: c['end_date'] for c in contracts}
    last_due_is_end = sum(max(ms, key=lambda m: int(m['milestone_sequence']))['due_date'] == end_dates[cid]
                          for cid, ms in by_contract.items())
    percent_100 = sum(sum(Decimal(m['payment_percent']) for m in ms) == 100 for ms in by_contract.values())
    value = {c['contract_id']: Decimal(c['contract_value_vnd_mn']) for c in contracts}
    amount_matches = sum(Decimal(m['planned_payment_vnd_mn']) == (value[m['contract_id']] * Decimal(m['payment_percent'])
                                                               / 100).quantize(Decimal('0.01')) for m in milestones)
    approvers_per_buyer = Counter(p['parent_party_id'] for p in parties if p['party_type'] == 'APPROVER')

    # Data quality findings.
    seen, exact_duplicates = set(), 0
    for e in sorted(events, key=lambda e: e['event_timestamp']):
        key = (e['milestone_id'], e['event_type'], e['actor_party_id'], e['document_id'])
        if e['document_id'] and key in seen:
            exact_duplicates += 1
        seen.add(key)
    after_snapshot = sum(datetime.fromisoformat(e['event_timestamp']).date() > SNAPSHOT for e in events)
    # parties.allowed_event_types is incomplete (no KICKOFF_CONFIRMED, GO_LIVE, ...; DISPUTE instead of
    # DISPUTE_OPENED), so it cannot decide authority: the engine checks the side that must record each event type.
    outside_column = sum(e['event_type'] not in party[e['actor_party_id']]['allowed_event_types'].split(';')
                         for e in events if e['event_type'] != 'APPROVAL')
    invoice_conflict = sum(m['invoice_required'] == 'TRUE' and 'INVOICE' not in m['required_event_types'].split(';')
                           for m in milestones)
    disputes = Counter(e['event_type'] for e in events if e['event_type'].startswith('DISPUTE'))

    with open(args.engine_output, encoding='utf-8-sig', newline='') as handle:
        output = list(csv.DictReader(handle))
    decisions = Counter(r['predicted_decision'] for r in output)
    held = [r for r in output if r['predicted_decision'] in ('HOLD', 'REJECT')]

    # Directory the team derives from parties.csv (apps/api/src/domain/accounts.ts buildDirectory).
    kinds = Counter(p['party_type'] for p in parties)
    accounts = {
        'approver accounts (1 per APPROVER party)': kinds['APPROVER'],
        'buyer legal + controller (2 per BUYER)': 2 * kinds['BUYER'],
        'supplier + supplier controller (2 per SUPPLIER)': 2 * kinds['SUPPLIER'],
        'platform sysadmin + auditor': 2,
    }

    profile = {
        'source': {'dataPack': PACK.relative_to(ROOT).as_posix(), 'snapshot': SNAPSHOT.isoformat(),
                   'engineOutput': args.engine_output.name},
        'tables': tables,
        'categories': {
            'contractTypes': dict(Counter(c['contract_type'] for c in contracts).most_common()),
            'milestoneTypes': dict(Counter(m['milestone_type'] for m in milestones).most_common()),
            'eventTypes': dict(Counter(e['event_type'] for e in events).most_common()),
            'partyTypes': dict(kinds.most_common()),
            'ruleSets': len({r['rule_set_id'] for r in rules}),
            'releaseRuleCodes': len({r['release_rule_code'] for r in rules}),
        },
        'relationships': {
            'milestonesPerContract': spread([len(ms) for ms in by_contract.values()]),
            'eventsPerMilestone': spread([events_per_milestone.get(m['milestone_id'], 0) for m in milestones]),
            'approverRolesPerBuyer': spread(list(approvers_per_buyer.values())),
            'foreignKeysResolve': foreign_keys,
        },
        'patterns': {
            'lastMilestoneDueEqualsEndDate': {'count': last_due_is_end, 'total': len(contracts)},
            'paymentPercentSumsTo100': {'count': percent_100, 'total': len(contracts)},
            'plannedAmountEqualsValueTimesPercent': {'count': amount_matches, 'total': len(milestones)},
        },
        'quality': {
            'exactDuplicateEvents': exact_duplicates,
            'eventsAfterSnapshot': after_snapshot,
            'eventsOutsideAllowedEventTypesColumn': outside_column,
            'milestonesHeldForWrongSideEvidence': sum(r['reason_code'] == 'UNAUTHORIZED_EVENT' for r in output),
            'invoiceFlagConflictsWithRequiredEvents': invoice_conflict,
            'disputeEvents': dict(disputes),
            'rejectionEvents': sum(e['event_type'] == 'REJECTION' for e in events),
        },
        'labels': {'sample': len(labels), 'decisions': dict(Counter(d['expected_decision'] for d in labels).most_common())},
        'engine': {
            'decisions': dict(decisions.most_common()),
            'heldReasons': dict(Counter(r['reason_code'] for r in held).most_common()),
            'heldValueMillion': str(sum(Decimal(r['planned_payment_vnd_mn']) for r in held)),
            'payableMillion': str(sum(Decimal(r['payable_amount_vnd_mn']) for r in output)),
            'penaltyMillion': str(sum(Decimal(r['penalty_amount_vnd_mn']) for r in output)),
        },
        'enrichment': {
            'organizations': {'fromParties': kinds['BUYER'] + kinds['SUPPLIER'], 'platform': 1},
            'accounts': accounts,
            'accountsTotal': sum(accounts.values()),
            'signingRecords': sum(any(e['contract_id'] == c['contract_id'] and e['event_type'] == 'CONTRACT_SIGNED'
                                      for e in events) for c in contracts),
            'demoContracts': ['CT0101', 'CT0102', 'CT0103', 'CT0104'],
        },
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(profile, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(profile, ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main()
