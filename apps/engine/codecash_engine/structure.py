"""Structural validation of one milestone against the Data Pack and the policy.

Input: the milestone row, its contract lookup result, its rule scope, its (deduplicated) events and the policy.
Output: plain data, the parsed requirement configuration and a list of issue strings.
Business rule: BR-15 (structural errors push the milestone to the fallback rule instead of crashing).
The rule scope may have any number of rules: priorities must be unique, the fallback (ELSE) must be the
last rule, every decision and reason must exist in the policy, and the reasons the policy requires must
be present. The issue strings are part of the engine output.
"""


def resolve_contract(contracts, milestone):
    """Return (contract, issues). A missing contract is replaced by an empty stand-in plus an issue."""
    contract = contracts.get(milestone["contract_id"])
    if contract is None:
        stand_in = {"contract_id": milestone["contract_id"], "buyer_id": "", "supplier_id": ""}
        return stand_in, ["milestone trỏ tới hợp đồng không tồn tại"]
    return contract, []


def split_list(value, separator=";"):
    return [item for item in (value or "").split(separator) if item]


def milestone_config(milestone, policy, contract=None):
    """Return (config, issues): required event types, approval roles, approval_required and quorum.

    Conditional requirements of the policy (for example INVOICE when ``invoice_required``) are appended
    to the required event types.
    """
    issues = []
    req = split_list(milestone["required_event_types"], policy.separator)
    scope = {"milestone": milestone, "contract": contract}
    for when, event_type in policy.conditional:
        if when(scope) and event_type not in req:
            req.append(event_type)
    roles = split_list(milestone["required_approval_roles"], policy.separator)
    flag = milestone.get("approval_required")
    approval_required = flag == "TRUE"
    try:
        quorum = int(milestone["required_approval_quorum"])
    except ValueError:
        issues.append("required_approval_quorum không đọc được")
        quorum = 0
    if flag not in ("TRUE", "FALSE"):
        issues.append("approval_required không đọc được")
    if not req:
        issues.append("required_event_types trống")
    if approval_required and quorum != len(roles):
        issues.append("quorum khác số vai trò bắt buộc")
    if not approval_required and quorum != 0:
        issues.append("approval_required=FALSE nhưng quorum > 0")
    logic = milestone.get(policy.logic_field) or policy.logic_default
    if logic not in policy.logic_supported:
        issues.append(f"{policy.logic_field} không được hỗ trợ: {logic}")
    config = {"req": req, "roles": roles, "approval_required": approval_required, "quorum": quorum}
    return config, issues


def scope_issues(scope_rules, policy):
    """BR-15: a rule scope the engine cannot apply safely. ``scope_rules`` is ordered by priority."""
    if not scope_rules:
        return ["phạm vi rule trống"]
    issues = []
    priorities = [int(r["priority"]) for r in scope_rules]
    repeated = sorted({p for p in priorities if priorities.count(p) > 1})
    if repeated:
        issues.append("phạm vi rule trùng priority: " + ";".join(map(str, repeated)))
    fallbacks = [i for i, r in enumerate(scope_rules)
                 if r["condition_expression"].strip() == policy.fallback_condition]
    if fallbacks != [len(scope_rules) - 1]:
        issues.append(f"phạm vi rule cần đúng một nhánh {policy.fallback_condition} ở cuối")
    for r in scope_rules:
        if r["decision"] not in policy.decisions:
            issues.append(f"{r['rule_id']}: quyết định không có trong chính sách: {r['decision']}")
        if r["reason_code"] not in policy.reasons:
            issues.append(f"{r['rule_id']}: mã lý do không có trong chính sách: {r['reason_code']}")
    present = {r["reason_code"] for r in scope_rules}
    absent = [code for code in policy.required_reasons if code not in present]
    if absent:
        issues.append("phạm vi rule thiếu mã lý do: " + ";".join(absent))
    return issues


def structural_issues(milestone, scope_rules, events, policy, contract=None):
    """BR-15: return (config, issues) for the milestone configuration, its rule scope and its events."""
    config, issues = milestone_config(milestone, policy, contract)
    issues += scope_issues(scope_rules, policy)
    for e in events:
        if e["contract_id"] != milestone["contract_id"]:
            issues.append(f"{e['event_id']}: contract_id lệch milestone")
    return config, issues
