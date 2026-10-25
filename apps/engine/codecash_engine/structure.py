"""Structural validation of one milestone against the Data Pack.

Input: the milestone row, its contract lookup result, its rule scope and its (deduplicated) events.
Output: plain data, the parsed requirement configuration and a list of issue strings.
Business rule: BR-15 (structural errors push the milestone to the fallback rule instead of crashing).
The issue strings are part of the engine output and are kept verbatim.
"""


def resolve_contract(contracts, milestone):
    """Return (contract, issues). A missing contract is replaced by an empty stand-in plus an issue."""
    contract = contracts.get(milestone["contract_id"])
    if contract is None:
        stand_in = {"contract_id": milestone["contract_id"], "buyer_id": "", "supplier_id": ""}
        return stand_in, ["milestone trỏ tới hợp đồng không tồn tại"]
    return contract, []


def structural_issues(milestone, scope_rules, events, priorities):
    """BR-15: return (config, issues).

    config: required_event_types ``req``, required approval ``roles``, ``approval_required`` and ``quorum``.
    issues: unreadable or inconsistent quorum, empty required events, a rule scope that is not exactly
    the expected priorities, and events whose contract differs from the milestone's contract.
    """
    issues = []
    req = [t for t in milestone["required_event_types"].split(";") if t]
    roles = [r for r in milestone["required_approval_roles"].split(";") if r]
    approval_required = milestone["approval_required"] == "TRUE"
    try:
        quorum = int(milestone["required_approval_quorum"])
    except ValueError:
        issues.append("required_approval_quorum không đọc được")
        quorum = 0
    if not req:
        issues.append("required_event_types trống")
    if approval_required and quorum != len(roles):
        issues.append("quorum khác số vai trò bắt buộc")
    if not approval_required and quorum != 0:
        issues.append("approval_required=FALSE nhưng quorum > 0")
    if [int(r["priority"]) for r in scope_rules] != priorities:
        issues.append("phạm vi rule không đủ 8 rule priority 10..80")
    for e in events:
        if e["contract_id"] != milestone["contract_id"]:
            issues.append(f"{e['event_id']}: contract_id lệch milestone")
    config = {"req": req, "roles": roles, "approval_required": approval_required, "quorum": quorum}
    return config, issues
