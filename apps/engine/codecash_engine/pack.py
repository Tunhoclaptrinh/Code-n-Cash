"""Data Pack input model and the vocabulary derived from the default policy.

Input: a Data Pack directory (``Pack.load``) or hand-built row lists (``Pack(...)``, used by tests).
Output: a ``Pack`` with the rows indexed by id, events grouped per milestone and ordered by
(timestamp, event_id), and active rules grouped per release_rule_code ordered by priority.
Business rules: none of its own. The constants below (authority per event type, valid status, statuses
per reason, decisions) are read from the default policy (policy/case4_btc.json) for the report and tests;
the engine itself reads the compiled policy.
"""
import csv
from collections import defaultdict
from datetime import date
from decimal import Decimal

from .policy import DEFAULT_DATA, load_policy

SPEC_VERSION = "1.2"
SNAPSHOT = date(2026, 10, 18)
CENT = Decimal("0.01")

_POLICY = load_policy()
# Section 2.1: required (evidence) event type -> party type allowed to create it.
AUTHORITY = {n: _POLICY.sides[k.side]["party_type"] for n, k in _POLICY.kinds.items() if k.category == "EVIDENCE"}
# BR-05: valid event_status per event type.
VALID_STATUS = {n: k.valid_status for n, k in _POLICY.kinds.items()}
SUPPORT_TYPES = {n for n, k in _POLICY.kinds.items() if k.category != "EVIDENCE"}
# Section 9.2: milestone status per reason code.
STATUS = {reason: entry["status"] for reason, entry in _POLICY.reasons.items()}
DECISIONS = set(_POLICY.decisions)


def read(base, rel):
    """Read one CSV file below ``base`` as a list of row dicts (BOM tolerant)."""
    with open(base / rel, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


class Pack:
    """Input data. Built from a Data Pack directory (``load``) or from row lists (used in tests)."""

    def __init__(self, contracts, parties, milestones, events, rules, decisions=(), template=(), base=None):
        self.base = base
        self.contracts = {r["contract_id"]: r for r in contracts}
        self.parties = {r["party_id"]: r for r in parties}
        self.milestones = {r["milestone_id"]: r for r in milestones}
        self.events = list(events)
        self.rules = list(rules)
        self.decisions = list(decisions)
        self.template = list(template)
        self.event_by_id = {e["event_id"]: e for e in self.events}
        self.events_by_ms = defaultdict(list)
        for e in self.events:
            self.events_by_ms[e["milestone_id"]].append(e)
        for lst in self.events_by_ms.values():
            lst.sort(key=lambda e: (e["event_timestamp"], e["event_id"]))
        self.rules_by_scope = defaultdict(list)
        for r in self.rules:
            if r["active"] == "TRUE":
                self.rules_by_scope[r["release_rule_code"]].append(r)
        for lst in self.rules_by_scope.values():
            lst.sort(key=lambda r: int(r["priority"]))

    @classmethod
    def load(cls, base):
        return cls(read(base, "01_data/contracts.csv"), read(base, "01_data/parties.csv"),
                   read(base, "01_data/milestones.csv"), read(base, "01_data/events.csv"),
                   read(base, "01_data/payment_rules.csv"), read(base, "03_labels_sample/decision_sample.csv"),
                   read(base, "04_output_templates/submission_output_template.csv"), base)
