"""Policy pack: the business policy of the engine as versioned data.

Input: a policy document (``apps/engine/policy/case4_btc.json`` by default) and the rule vocabulary
(``apps/engine/rule_language.json``), whose variables declare where each value comes from (``binding``).
Output: a validated, compiled ``Policy``. Every predicate is compiled once; ``variant`` applies named
switches (readings of the brief, run profiles) as overlays and returns another compiled policy.
Business rules: section 2.1 (authority per event type), BR-03 (dedupe identity), BR-05 (valid status),
BR-08 (when a dispute is closed), BR-10 (what an approval counts), BR-11 (what completes a milestone),
BR-15 (anomalies), BR-19 (what an exception may void), section 6 (decisions, reasons, statuses, rule scope),
section 8 (confidence) and the payment safety guards.

The engine keeps only the mechanics: the five event categories (EVIDENCE, APPROVAL, REJECTION,
DISPUTE_OPEN, DISPUTE_RESOLVE), first-match rule selection and exact Decimal money. Which event types
exist, who may create them, which statuses are valid, how disputes close, how approvals count, which
reason maps to which status and which payments are safe are all read from the policy.
"""
import copy
import hashlib
import json
from decimal import ROUND_HALF_EVEN, ROUND_HALF_UP, Decimal, InvalidOperation
from pathlib import Path

from . import expressions

ENGINE_DIR = Path(__file__).resolve().parents[1]
DEFAULT_DATA = ENGINE_DIR.parents[1] / "BangD-Case4" / "DataPack-CASE4_SmartContractWorkflow"
DEFAULT_POLICY = ENGINE_DIR / "policy" / "case4_btc.json"
CATALOG = ENGINE_DIR / "rule_language.json"
FORMAT = "CODECASH_POLICY_V1"
CATEGORIES = ("EVIDENCE", "APPROVAL", "REJECTION", "DISPUTE_OPEN", "DISPUTE_RESOLVE")
ROUNDINGS = {"ROUND_HALF_UP": ROUND_HALF_UP, "ROUND_HALF_EVEN": ROUND_HALF_EVEN}
# Facts the engine stages compute; a catalog variable bound to a fact must name one of these.
ENGINE_FACTS = ("open_dispute", "valid_rejection_event_count", "unauthorized_required_event_count",
                "required_event_completion_rate", "valid_approval_count", "actual_completion_date",
                "days_late_after_grace")
CONFIG_KEYS = ("approval_required", "quorum")
BINDING_TYPES = ("boolean", "integer", "decimal", "date")
EVIDENCE_SETS = ("VALID_REQUIRED", "COUNTED_APPROVALS", "OPEN_DISPUTES", "REJECTIONS")
VERDICT = ("authorized", "status_ok", "valid", "required", "required_authorized")
# Columns of the official Data Pack files; record predicates may only read these (plus ``exists``).
SCHEMA_FILES = {"event": "events.csv", "actor": "parties.csv", "contract": "contracts.csv",
                "milestone": "milestones.csv", "referenced": "events.csv"}


class PolicyError(ValueError):
    """The policy document is not valid; ``problems`` lists every finding."""

    def __init__(self, problems):
        super().__init__("POLICY_INVALID " + "; ".join(problems[:10]))
        self.problems = problems


def _schema():
    columns = {}
    for space, name in SCHEMA_FILES.items():
        path = DEFAULT_DATA / "01_data" / name
        if not path.exists():
            return None  # no official Data Pack next to the engine: do not restrict attribute names
        with open(path, encoding="utf-8-sig") as handle:
            columns[space] = frozenset(handle.readline().strip().split(","))
    return columns


def _merge(base, overlay):
    """JSON merge of an overlay: objects merge key by key, every other value replaces."""
    result = copy.deepcopy(base)
    for key, value in overlay.items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = _merge(result[key], value)
        else:
            result[key] = copy.deepcopy(value)
    return result


def canonical_hash(document):
    return hashlib.sha256(json.dumps(document, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
                          .encode("utf-8")).hexdigest()


class Kind:
    """One event type of the policy."""
    __slots__ = ("name", "category", "side", "valid_status", "authority", "record")

    def __init__(self, name, category, side, valid_status, authority):
        self.name, self.category, self.side, self.valid_status, self.authority = name, category, side, valid_status, authority
        self.record = {"name": name, "category": category, "side": side, "valid_status": valid_status}


class Reading:
    """An Open reading of the brief: the switch that evaluates it, its confidence weight and candidates."""
    __slots__ = ("code", "switch", "weight", "flag", "candidates")

    def __init__(self, code, switch, weight, flag, candidates):
        self.code, self.switch, self.weight, self.flag, self.candidates = code, switch, weight, flag, candidates


class Policy:
    """A validated and compiled policy document. Build with ``load_policy`` or ``Policy(document)``."""

    def __init__(self, document, catalog=None, *, switches=(), base=None):
        self.document = document
        self.catalog = catalog if catalog is not None else json.loads(CATALOG.read_text(encoding="utf-8"))
        self.switches_applied = tuple(switches)
        self.base = base or self
        self.hash = canonical_hash({"policy": document, "catalog": self.catalog})
        self._variants = {} if base is None else base._variants
        problems = []
        self._compile(problems)
        if problems:
            raise PolicyError(problems)

    # ----- compilation -----

    def _compile(self, problems):
        d = self.document

        def need(path, kind=dict):
            node = d
            for key in path.split("."):
                if not isinstance(node, dict) or key not in node:
                    problems.append(f"{path}: thiếu")
                    return kind()
                node = node[key]
            if not isinstance(node, kind):
                problems.append(f"{path}: sai kiểu")
                return kind()
            return node

        if d.get("format") != FORMAT:
            problems.append(f"format: cần {FORMAT}")
        self.id, self.version = str(d.get("policy_id", "")), str(d.get("version", ""))
        if not self.id or not self.version:
            problems.append("policy_id/version: thiếu")
        self.separator = d.get("list_separator", ";")
        self.definitions = need("definitions")
        schema = _schema()
        self.schema = schema

        def columns(space):
            return schema[space] if schema else None

        sides = need("sides")
        self.sides = {}
        for name, side in sides.items():
            if not isinstance(side, dict) or not side.get("party_type") or not side.get("contract_field"):
                problems.append(f"sides.{name}: cần party_type và contract_field")
                continue
            if schema and side["contract_field"] not in schema["contract"]:
                problems.append(f"sides.{name}.contract_field: không có trong contracts.csv")
            self.sides[name] = dict(side)

        def record(path, text, spaces, on_error=False):
            """Compile a record predicate; ``spaces`` names the namespaces it may read."""
            if not isinstance(text, str):
                problems.append(f"{path}: cần biểu thức")
                return lambda scope: on_error
            namespaces = {}
            for space in spaces:
                # ``verdict_basic`` is the verdict before the requirement check: it cannot read its own result.
                name = "verdict" if space == "verdict_basic" else space
                namespaces[name] = columns(space) if space in SCHEMA_FILES else STATIC_SPACES[space]
            try:
                fn = expressions.compile_record(text, self.definitions, namespaces, self.separator)
            except expressions.ExpressionError as error:
                problems.append(f"{path}: {error}")
                return lambda scope: on_error

            def guarded(scope):
                try:
                    return fn(scope)
                except expressions.ExpressionError:
                    return on_error
            return guarded

        event_spaces = ("event", "actor", "contract", "milestone", "side", "kind")
        categories = need("categories")
        category_authority = {}
        for name in CATEGORIES:
            entry = categories.get(name)
            if not isinstance(entry, dict):
                problems.append(f"categories.{name}: thiếu")
                continue
            category_authority[name] = record(f"categories.{name}.authority", entry.get("authority"), event_spaces)
        for name in categories:
            if name not in CATEGORIES:
                problems.append(f"categories.{name}: loại không được engine hỗ trợ")
        self.kinds = {}
        for name, entry in need("event_types").items():
            if not isinstance(entry, dict) or entry.get("category") not in CATEGORIES:
                problems.append(f"event_types.{name}.category: cần một trong {', '.join(CATEGORIES)}")
                continue
            side = entry.get("side")
            if entry["category"] == "EVIDENCE" and side not in self.sides:
                problems.append(f"event_types.{name}.side: cần một bên trong sides")
            if side is not None and entry["category"] != "EVIDENCE":
                problems.append(f"event_types.{name}.side: chỉ dùng cho EVIDENCE")
            if not isinstance(entry.get("valid_status"), str) or not entry["valid_status"]:
                problems.append(f"event_types.{name}.valid_status: thiếu")
            authority = (record(f"event_types.{name}.authority", entry["authority"], event_spaces)
                         if "authority" in entry else category_authority.get(entry["category"], lambda scope: False))
            self.kinds[name] = Kind(name, entry["category"], side, entry.get("valid_status", ""), authority)
        self.evidence_types = tuple(n for n, k in self.kinds.items() if k.category == "EVIDENCE")

        dedupe = need("dedupe")
        self.dedupe_fields = tuple(dedupe.get("fields", ()))
        self.dedupe_required = tuple(dedupe.get("only_when_present", ()))
        if not self.dedupe_fields:
            problems.append("dedupe.fields: thiếu")
        if schema:
            for field in self.dedupe_fields + self.dedupe_required:
                if field not in schema["event"]:
                    problems.append(f"dedupe: {field} không có trong events.csv")

        logic = need("milestone").get("condition_logic", {})
        self.logic_field = logic.get("field", "condition_logic")
        self.logic_supported = tuple(logic.get("supported", ("ALL",)))
        self.logic_default = logic.get("default", "ALL")

        verdict_spaces = event_spaces + ("verdict",)
        requirements = need("requirements")
        self.required_authorized = record("requirements.authorized_when", requirements.get("authorized_when"),
                                          event_spaces + ("verdict_basic",))
        self.conditional = []
        for index, item in enumerate(requirements.get("conditional", [])):
            if not isinstance(item, dict) or self.kinds.get(item.get("event_type")) is None \
                    or self.kinds[item["event_type"]].category != "EVIDENCE":
                problems.append(f"requirements.conditional[{index}]: event_type phải là loại EVIDENCE")
                continue
            self.conditional.append((record(f"requirements.conditional[{index}].when", item.get("when"),
                                            ("milestone", "contract")), item["event_type"]))

        approvals = need("approvals")
        self.approval_counts = record("approvals.counts_when", approvals.get("counts_when"), verdict_spaces)
        self.approval_one_per = approvals.get("one_per", "actor_party_id")
        self.approval_covers = approvals.get("covers", "approval_role")
        self.approval_limit = approvals.get("limit_field")
        if schema and self.approval_limit and self.approval_limit not in schema["actor"]:
            problems.append("approvals.limit_field: không có trong parties.csv")
        if schema and self.approval_one_per not in schema["event"]:
            problems.append("approvals.one_per: không có trong events.csv")
        if schema and self.approval_covers not in schema["actor"]:
            problems.append("approvals.covers: không có trong parties.csv")

        disputes = need("disputes")
        self.dispute_scope = disputes.get("scope")
        if self.dispute_scope not in ("MILESTONE", "CONTRACT"):
            problems.append("disputes.scope: cần MILESTONE hoặc CONTRACT")
        self.dispute_closes = record("disputes.closes_when", disputes.get("closes_when"),
                                     ("event", "actor", "contract", "milestone", "referenced"))

        self.completion_categories = tuple(need("completion").get("categories", ()))
        if "EVIDENCE" not in self.completion_categories or any(
                c not in ("EVIDENCE", "APPROVAL") for c in self.completion_categories):
            problems.append("completion.categories: cần EVIDENCE, có thể thêm APPROVAL")

        amounts = need("amounts")
        try:
            self.quantum = Decimal(amounts.get("quantum", "0.01"))
        except InvalidOperation:
            problems.append("amounts.quantum: không đọc được")
            self.quantum = Decimal("0.01")
        if amounts.get("rounding") not in ROUNDINGS:
            problems.append(f"amounts.rounding: cần một trong {', '.join(ROUNDINGS)}")
        self.rounding = ROUNDINGS.get(amounts.get("rounding"), ROUND_HALF_UP)

        self.anomaly_passes = []
        for i, group in enumerate(need("anomalies", list)):
            checks = []
            for j, item in enumerate(group if isinstance(group, list) else []):
                if not isinstance(item, dict) or not isinstance(item.get("message"), str):
                    problems.append(f"anomalies[{i}][{j}]: cần when và message")
                    continue
                checks.append((record(f"anomalies[{i}][{j}].when", item.get("when"), verdict_spaces, on_error=True),
                               item["message"]))
            self.anomaly_passes.append(checks)
        self.voidable = record("exceptions.voidable", need("exceptions").get("voidable"), verdict_spaces)

        self.statuses = tuple(need("statuses", list))
        self.decisions = {}
        variables = self._variables(problems)
        # Amount checks read only milestone and contract cells and the amounts, so the output check
        # (checks.py) can evaluate them without the engine's own facts.
        amount_names = {n for n, v in variables.items() if v["binding"].get("source") in ("milestone", "contract")} \
            | {"payable_amount_vnd_mn", "penalty_amount_vnd_mn", "reference_penalty_vnd_mn"}

        def fact(path, text, names):
            if not isinstance(text, str):
                problems.append(f"{path}: cần biểu thức")
                return None
            try:
                fn, used = expressions.compile_fact(text, self.rounding, self.quantum)
            except expressions.ExpressionError as error:
                problems.append(f"{path}: {error}")
                return None
            unknown = sorted(used - set(names))
            if unknown:
                problems.append(f"{path}: biến không có: {', '.join(unknown)}")
            return text, fn

        for name, entry in need("decisions").items():
            if not isinstance(entry, dict) or not isinstance(entry.get("pays"), bool):
                problems.append(f"decisions.{name}.pays: cần true/false")
                continue
            checks = [fact(f"decisions.{name}.amounts[{i}]", text, amount_names)
                      for i, text in enumerate(entry.get("amounts", []))]
            self.decisions[name] = {"pays": entry["pays"], "amounts": [c for c in checks if c]}
        self.reasons = {}
        for name, entry in need("reasons").items():
            if not isinstance(entry, dict) or entry.get("status") not in self.statuses:
                problems.append(f"reasons.{name}.status: cần một trạng thái trong statuses")
                continue
            extra = tuple(entry.get("evidence", ()))
            if any(e not in EVIDENCE_SETS for e in extra):
                problems.append(f"reasons.{name}.evidence: cần một trong {', '.join(EVIDENCE_SETS)}")
            as_of = entry.get("as_of", {})
            if any(s not in self.statuses for s in as_of.values()):
                problems.append(f"reasons.{name}.as_of: trạng thái không có trong statuses")
            self.reasons[name] = {"status": entry["status"], "evidence": extra, "as_of": dict(as_of)}
        fallback = need("fallback")
        self.fallback_decision, self.fallback_reason = fallback.get("decision"), fallback.get("reason_code")
        if self.fallback_decision not in self.decisions or self.decisions[self.fallback_decision]["pays"]:
            problems.append("fallback.decision: cần một quyết định không trả tiền")
        if self.fallback_reason not in self.reasons:
            problems.append("fallback.reason_code: không có trong reasons")
        scope = need("rule_scope")
        self.fallback_condition = scope.get("fallback_condition", "ELSE")
        self.required_reasons = tuple(scope.get("required_reason_codes", ()))
        for reason in self.required_reasons:
            if reason not in self.reasons:
                problems.append(f"rule_scope.required_reason_codes: {reason} không có trong reasons")

        self.derived = []
        known = set(variables)
        for name, text in need("derived_facts").items():
            if variables.get(name, {}).get("binding", {}).get("source") != "derived":
                problems.append(f"derived_facts.{name}: biến phải khai báo binding derived trong rule_language.json")
            compiled = fact(f"derived_facts.{name}", text, known)
            if compiled:
                self.derived.append((name, compiled[1]))
        for name, variable in variables.items():
            if variable["binding"].get("source") == "derived" and name not in need("derived_facts"):
                problems.append(f"{name}: binding derived nhưng không có trong derived_facts")
        guards = need("guards")
        self.payment_guards = [g for g in (fact(f"guards.payment[{i}]", t, known)
                                           for i, t in enumerate(guards.get("payment", []))) if g]
        self.amount_guards = [g for g in (fact(f"guards.amounts[{i}]", t, amount_names)
                                          for i, t in enumerate(guards.get("amounts", []))) if g]
        reference = fact("amounts.reference_penalty", amounts.get("reference_penalty"), known)
        self.reference_penalty = reference[1] if reference else (lambda env: None)

        tokens = need("condition_tokens")
        self.token_separator = tokens.get("separator", " AND ")
        self.token_kinds = {kind: record(f"condition_tokens.kinds.{kind}", text, ("token", "state"))
                            for kind, text in tokens.get("kinds", {}).items()}

        self.switches = need("switches")
        for name, overlay in self.switches.items():
            if not isinstance(overlay, dict):
                problems.append(f"switches.{name}: cần một overlay")
        self.profiles = {}
        for name, items in need("profiles").items():
            if not isinstance(items, list) or any(s not in self.switches for s in items):
                problems.append(f"profiles.{name}: switch không có")
                continue
            self.profiles[name] = tuple(items)
        self.readings = {}
        for code, entry in need("readings").items():
            try:
                weight = Decimal(entry.get("weight"))
                assert Decimal(0) <= weight <= Decimal(1)
            except (AssertionError, InvalidOperation, TypeError):
                problems.append(f"readings.{code}.weight: cần số trong [0, 1]")
                continue
            if entry.get("switch") not in self.switches:
                problems.append(f"readings.{code}.switch: không có trong switches")
                continue
            candidates = dict(entry.get("candidates", {}))
            if "milestone" in candidates:
                candidates["milestone"] = record(f"readings.{code}.candidates.milestone", candidates["milestone"],
                                                 ("milestone", "contract"))
            self.readings[code] = Reading(code, entry["switch"], weight, bool(entry.get("flag")), candidates)
        confidence = need("confidence")
        try:
            self.confidence = {key: Decimal(str(confidence[key])) for key in
                               ("issue_cap", "duplicate_factor", "unrelated_factor", "sequence_factor",
                                "boundary_factor")}
            self.confidence["duplicate_limit"] = int(confidence["duplicate_limit"])
            self.confidence["boundary_days"] = int(confidence["boundary_days"])
        except (KeyError, InvalidOperation, ValueError, TypeError):
            problems.append("confidence: cần issue_cap, duplicate_factor, duplicate_limit, unrelated_factor, "
                            "sequence_factor, boundary_factor, boundary_days")
            self.confidence = {}

    def _variables(self, problems):
        """Rule variables in catalog order with their bindings, checked against the engine and the schema."""
        variables = {}
        for row in self.catalog.get("variables", []):
            binding = row.get("binding")
            name = row.get("name")
            if not isinstance(binding, dict):
                problems.append(f"rule_language.{name}: thiếu binding")
                continue
            source = binding.get("source")
            if source == "fact" and name not in ENGINE_FACTS:
                problems.append(f"rule_language.{name}: engine không tính fact này")
            elif source == "config" and binding.get("key") not in CONFIG_KEYS:
                problems.append(f"rule_language.{name}: config key không có")
            elif source in ("milestone", "contract"):
                if binding.get("type") not in BINDING_TYPES:
                    problems.append(f"rule_language.{name}: type cần một trong {', '.join(BINDING_TYPES)}")
                if self.schema and binding.get("field") not in self.schema[source]:
                    problems.append(f"rule_language.{name}: {binding.get('field')} không có trong {SCHEMA_FILES[source]}")
            elif source not in ("fact", "config", "derived", "amount", "milestone", "contract"):
                problems.append(f"rule_language.{name}: binding.source không hợp lệ")
            variables[name] = row
        self.variables = variables
        return variables

    # ----- lookups -----

    def status_for(self, reason):
        entry = self.reasons.get(reason)
        return entry["status"] if entry else None

    def pays(self, decision):
        entry = self.decisions.get(decision)
        return bool(entry and entry["pays"])

    def variant(self, switches=(), rounding=None):
        """The policy with these switches applied (and an explicit rounding mode), compiled once and cached."""
        names = tuple(sorted(set(self.switches_applied) | set(switches)))
        root = self.base
        if rounding is not None and rounding != root.rounding:
            names += (f"rounding:{rounding}",)
        if names == tuple(sorted(root.switches_applied)):
            return root
        cached = root._variants.get(names)
        if cached is None:
            document = root.document
            for name in names:
                if name.startswith("rounding:"):
                    document = _merge(document, {"amounts": {"rounding": name.split(":", 1)[1]}})
                elif name not in root.switches:
                    raise PolicyError([f"switch {name} không có"])
                else:
                    document = _merge(document, root.switches[name])
            cached = Policy(document, root.catalog, switches=names, base=root)
            root._variants[names] = cached
        return cached

    def describe(self):
        """The vocabulary other components read: event types, sides, statuses, reasons and decisions."""
        return {"policyId": self.id, "version": self.version, "hash": self.hash,
                "eventTypes": {n: k.record for n, k in self.kinds.items()},
                "sides": self.sides, "statuses": list(self.statuses),
                "reasons": {n: r["status"] for n, r in self.reasons.items()},
                "decisions": {n: {"pays": d["pays"]} for n, d in self.decisions.items()},
                "profiles": {n: list(s) for n, s in self.profiles.items()},
                "readings": {c: {"weight": str(r.weight), "switch": r.switch} for c, r in self.readings.items()}}


# Attributes of the namespaces that are not Data Pack rows.
STATIC_SPACES = {
    "side": frozenset(("name", "party_type", "party_id", "contract_field")),
    "kind": frozenset(("name", "category", "side", "valid_status")),
    "verdict": frozenset(VERDICT),
    "verdict_basic": frozenset(VERDICT[:4]),
    "token": frozenset(("kind", "argument", "number")),
    "state": frozenset(("valid_required_types", "valid_approval_count", "open_dispute")),
}

_LOADED = {}


def load_policy(path=None):
    """Load and compile a policy file (cached per path); the default is the Case 4 policy of the organiser."""
    path = Path(path or DEFAULT_POLICY).resolve()
    if path not in _LOADED:
        _LOADED[path] = Policy(json.loads(path.read_text(encoding="utf-8")))
    return _LOADED[path]
