"""CodeCash decision engine: the Case 4 specification evaluator split into small stage modules.

Public API (re-exported here): Data Pack loading (``Pack``, ``read``), the rule expression evaluator,
``evaluate`` / ``evaluate_all`` (the orchestration of the stages in ``pipeline.py``), output checks and
the confidence helpers. Every stage module states its input, output and the business rules (BR-xx) it
implements; ``docs/NGHIEP_VU.md`` is the source of truth;
section numbers in the module docstrings refer to it.
"""
from .checks import check_invariants, compare_samples
from .confidence import assumption_flags, confidence_score, confidence_scores
from .pipeline import evaluate, evaluate_all
from .expressions import _eval, evaluate_expr
from .pack import (AUTHORITY, CENT, DECISIONS, DEFAULT_DATA, PRIORITIES, SNAPSHOT, SPEC_VERSION, STATUS,
                   SUPPORT_TYPES, VALID_STATUS, Pack, read)

__all__ = [
    "AUTHORITY", "CENT", "DECISIONS", "DEFAULT_DATA", "PRIORITIES", "SNAPSHOT", "SPEC_VERSION", "STATUS",
    "SUPPORT_TYPES", "VALID_STATUS", "Pack", "assumption_flags", "check_invariants", "compare_samples",
    "confidence_score", "confidence_scores", "evaluate", "evaluate_all", "evaluate_expr", "read",
]
