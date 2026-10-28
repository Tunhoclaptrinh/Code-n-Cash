"""CodeCash decision engine: the Case 4 specification evaluator, driven by a policy pack.

Public API (re-exported here): Data Pack loading (``Pack``, ``read``), the policy pack (``Policy``,
``load_policy``), the expression compiler, ``evaluate`` / ``evaluate_all`` (the orchestration of the stages
in ``pipeline.py``), output checks and the confidence helpers. Every stage module states its input, output
and the business rules (BR-xx) it implements; ``docs/NGHIEP_VU.md`` is the source of truth.
"""
from .checks import check_invariants, compare_samples
from .confidence import assumption_flags, confidence_score, confidence_scores, reading_changes
from .pipeline import evaluate, evaluate_all, resolve_policy
from .expressions import ExpressionError, _eval, evaluate_expr
from .pack import (AUTHORITY, CENT, DECISIONS, SNAPSHOT, SPEC_VERSION, STATUS, SUPPORT_TYPES, VALID_STATUS,
                   Pack, read)
from .policy import DEFAULT_DATA, DEFAULT_POLICY, Policy, PolicyError, load_policy

__all__ = [
    "AUTHORITY", "CENT", "DECISIONS", "DEFAULT_DATA", "DEFAULT_POLICY", "ExpressionError", "Pack", "Policy",
    "PolicyError", "SNAPSHOT", "SPEC_VERSION", "STATUS", "SUPPORT_TYPES", "VALID_STATUS", "assumption_flags",
    "check_invariants", "compare_samples", "confidence_score", "confidence_scores", "evaluate", "evaluate_all",
    "evaluate_expr", "load_policy", "read", "reading_changes", "resolve_policy",
]
