"""Data Pack input model and shared constants.

Input: a Data Pack directory (``Pack.load``) or hand-built row lists (``Pack(...)``, used by tests).
Output: a ``Pack`` with the rows indexed by id, events grouped per milestone and ordered by
(timestamp, event_id), and active rules grouped per release_rule_code ordered by priority.
Business rules: BR-04 and BR-05 (authority matrix, valid status per event type) and the
status mapping of spec section 4 are defined here as constants.
"""
import csv
from collections import defaultdict
from datetime import date
from decimal import Decimal
from pathlib import Path

SPEC_VERSION = "1.1"
DEFAULT_DATA = Path(__file__).resolve().parents[3] / "BangD-Case4" / "DataPack-CASE4_SmartContractWorkflow"
SNAPSHOT = date(2026, 10, 18)
CENT = Decimal("0.01")

# Spec section 2.1: required event type -> party type allowed to create it.
AUTHORITY = {
    "CONTRACT_SIGNED": "BUYER", "KICKOFF_CONFIRMED": "BUYER", "REQUIREMENTS_APPROVED": "BUYER",
    "UAT_PASSED": "BUYER", "ACCEPTANCE": "BUYER",
    "DELIVERY": "SUPPLIER", "INVOICE": "SUPPLIER", "GO_LIVE": "SUPPLIER",
    "SERVICE_ACTIVATED": "SUPPLIER", "SERVICE_COMPLETED": "SUPPLIER", "WARRANTY_COMPLETED": "SUPPLIER",
}
# BR-05: valid event_status per event type.
VALID_STATUS = {t: "CONFIRMED" for t in AUTHORITY}
VALID_STATUS.update(APPROVAL="APPROVED", REJECTION="REJECTED", DISPUTE_OPENED="OPEN", DISPUTE_RESOLVED="RESOLVED")
SUPPORT_TYPES = {"APPROVAL", "REJECTION", "DISPUTE_OPENED", "DISPUTE_RESOLVED"}

# Spec section 4: milestone status per reason code, named as in README section 15.
STATUS = {
    "ALL_CONDITIONS_MET": "ELIGIBLE_FOR_PAYMENT", "LATE_COMPLETION": "PAID_WITH_PENALTY",
    "REJECTION_PRESENT": "REJECTED", "MISSING_REQUIRED_EVENT": "WAITING_EVIDENCE",
    "APPROVAL_QUORUM_NOT_MET": "WAITING_APPROVAL", "OPEN_DISPUTE": "ON_HOLD",
    "UNAUTHORIZED_EVENT": "ON_HOLD", "UNRESOLVED_CONDITION": "ON_HOLD",
}
DECISIONS = {"RELEASE", "HOLD", "REJECT", "PENALTY"}
PRIORITIES = [10, 20, 30, 40, 50, 60, 70, 80]


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
