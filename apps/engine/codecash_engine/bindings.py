"""Milestone and contract values bound to rule variables.

Input: the policy (its rule vocabulary declares a ``binding`` for every variable), the milestone row and
the contract row.
Output: typed values (Decimal, bool, date or None) for the variables bound to a ``milestone`` or ``contract``
cell, plus issue strings for unreadable cells.
Business rules: BR-12 (milestone terms), BR-15 (an unreadable parameter is a structural issue and the
milestone falls back to the ELSE rule). Variables of one ``group`` are trusted together: when one cell of
the group is unreadable, every value of the group becomes neutral (0, FALSE or no date).

A new milestone or contract column becomes a rule variable by declaring it in rule_language.json; no code
change is needed.
"""
from datetime import date
from decimal import Decimal, InvalidOperation

NEUTRAL = {"boolean": False, "integer": Decimal(0), "decimal": Decimal(0), "date": None}


def parse(kind, text):
    """One cell as the declared type; raises ValueError when it cannot be read."""
    if kind == "boolean":
        if text not in ("TRUE", "FALSE"):
            raise ValueError(text)
        return text == "TRUE"
    if kind == "integer":
        return Decimal(int(text))
    if kind == "decimal":
        try:
            value = Decimal(text)
        except InvalidOperation as error:
            raise ValueError(text) from error
        if not value.is_finite():
            raise ValueError(text)
        return value
    return date.fromisoformat(text)


def bind(policy, milestone, contract):
    """Return (values, issues) for every variable bound to a milestone or contract cell."""
    rows = {"milestone": milestone, "contract": contract or {}}
    values, issues, failed = {}, [], set()
    for name, variable in policy.variables.items():
        binding = variable["binding"]
        source = binding.get("source")
        if source not in rows:
            continue
        row, kind = rows[source], binding["type"]
        text = row.get(binding["field"])
        if text is None or text == "":
            text = binding.get("default", text)
        if text is None:
            values[name] = None  # the column is not in this dataset; no rule of the Data Pack reads it
            continue
        try:
            values[name] = parse(kind, text)
        except ValueError:
            values[name] = NEUTRAL[kind]
            message = binding.get("issue") or f"{binding['field']} không đọc được"
            if message not in issues:
                issues.append(message)
            failed.add(binding.get("group") or name)
    if failed:
        for name, variable in policy.variables.items():
            binding = variable["binding"]
            if binding.get("source") in rows and binding.get("group") in failed:
                values[name] = NEUTRAL[binding["type"]]
    return values, issues
