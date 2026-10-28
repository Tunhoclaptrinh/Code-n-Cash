"""Expression compiler shared by the rule table and the policy pack.

Input: an expression text, its dialect and (for policy predicates) the named definitions and namespaces.
Output: a compiled callable (cached per text), never ``eval``. Numbers are read from the source token as
Decimal, never through a binary float.
Business rules: BR-02 (rules are data, evaluated in priority order), BR-12 (money formulas) and the policy
pack (docs/NGHIEP_VU.md section 6.1), whose predicates decide who may create an event, when a dispute is
closed, which events are anomalies and which payments are safe.

Three dialects over one whitelisted AST:
- RULE: BTC_DSL_V1, the language of payment_rules.csv: AND, one comparison per operand, + - * /, MIN, MAX,
  TRUE/FALSE and the rule variables. Its text handling matches validate_rules.py exactly.
- FACT: policy expressions over rule variables (derived facts, payment and amount guards): RULE plus OR,
  NOT, parentheses and ROUND_MONEY (quantize with the policy rounding).
- RECORD: policy predicates over records (``event.event_type``, ``actor.status``, ...): attribute access,
  string literals, IN / NOT IN over ';' lists, AND / OR / NOT, comparisons and named definitions.
A comparison with a missing value is false; arithmetic with a missing value is missing.
"""
import ast
import io
import operator
import tokenize
from datetime import date, timedelta
from decimal import Decimal, DecimalException, InvalidOperation

RULE, FACT, RECORD = "RULE", "FACT", "RECORD"
KEYWORDS = {"AND": "and", "OR": "or", "NOT": "not", "IN": "in"}
_CMP = {ast.Eq: operator.eq, ast.NotEq: operator.ne, ast.Lt: operator.lt,
        ast.LtE: operator.le, ast.Gt: operator.gt, ast.GtE: operator.ge}
_ARITH = {ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul, ast.Div: operator.truediv}
_FUNCTIONS = {RULE: ("MIN", "MAX"), FACT: ("MIN", "MAX", "ROUND_MONEY"), RECORD: ()}


class ExpressionError(ValueError):
    """A rule or policy expression that cannot be compiled or evaluated; ``code`` is a stable identifier."""

    def __init__(self, code, detail=""):
        super().__init__(code if not detail else f"{code}: {detail}")
        self.code = code


def _source(text, dialect):
    if dialect == RULE:
        return text.replace(" AND ", " and ")
    # Replace the upper-case keywords as tokens, so a string literal that contains them is left alone.
    # The replacements have the same length, so token positions (and number literals) are preserved.
    chars = list(text)
    lines = text.split("\n")
    offsets = [0]
    for line in lines:
        offsets.append(offsets[-1] + len(line) + 1)
    try:
        for token in tokenize.generate_tokens(io.StringIO(text).readline):
            if token.type == tokenize.NAME and token.string in KEYWORDS:
                row, col = token.start
                start = offsets[row - 1] + col
                chars[start:start + len(token.string)] = KEYWORDS[token.string]
    except (tokenize.TokenError, IndentationError) as error:
        raise ExpressionError("SYNTAX_ERROR", text) from error
    return "".join(chars)


def _number(node, source):
    token = ast.get_source_segment(source, node) if source is not None else str(node.value)
    try:
        value = Decimal(token)
    except (DecimalException, TypeError) as error:
        raise ExpressionError("RULE_NON_FINITE_NUMBER", str(token)) from error
    if not value.is_finite():
        raise ExpressionError("RULE_NON_FINITE_NUMBER", str(token))
    return value


def _truth(value):
    """Boolean value of a RECORD operand: real booleans, the Data Pack 'TRUE'/'FALSE' cells, or missing."""
    if value is True or value is False:
        return value
    if value is None:
        return False
    if value == "TRUE":
        return True
    if value == "FALSE":
        return False
    raise ExpressionError("POLICY_BOOLEAN_REQUIRED", repr(value))


def _coerce(left, right):
    """Align RECORD comparison operands: 'TRUE'/'FALSE' cells against booleans, number cells against numbers."""
    if isinstance(left, bool) and isinstance(right, str):
        return left, {"TRUE": True, "FALSE": False}.get(right)
    if isinstance(right, bool) and isinstance(left, str):
        return {"TRUE": True, "FALSE": False}.get(left), right
    if isinstance(left, Decimal) and isinstance(right, str) or isinstance(right, Decimal) and isinstance(left, str):
        try:
            return (left if isinstance(left, Decimal) else Decimal(left),
                    right if isinstance(right, Decimal) else Decimal(right))
        except InvalidOperation:
            return None, None
    return left, right


class _Compiler:
    def __init__(self, dialect, source, definitions=None, namespaces=None, rounding=None, quantum=None, separator=";",
                 compiling=()):
        self.dialect, self.source = dialect, source
        self.definitions = definitions or {}
        self.namespaces = namespaces
        self.rounding, self.quantum, self.separator = rounding, quantum, separator
        self.compiling = compiling
        self.names = set()

    def fail(self, node, code="UNSUPPORTED_EXPRESSION"):
        if code == "UNSUPPORTED_EXPRESSION":
            raise ExpressionError(code, f"Biểu thức không được hỗ trợ: {ast.dump(node)}")
        raise ExpressionError(code)

    def compile(self, node):
        method = getattr(self, "_" + type(node).__name__, None)
        if method is None:
            self.fail(node)
        return method(node)

    def _Expression(self, node):
        body = self.compile(node.body)
        if self.dialect == RECORD:
            return lambda scope: _truth(body(scope))
        return body

    def _BoolOp(self, node):
        values = [self.compile(v) for v in node.values]
        if isinstance(node.op, ast.And):
            if self.dialect == RECORD:
                return lambda scope: all(_truth(f(scope)) for f in values)
            return lambda env: all(f(env) for f in values)
        if isinstance(node.op, ast.Or) and self.dialect != RULE:
            if self.dialect == RECORD:
                return lambda scope: any(_truth(f(scope)) for f in values)
            return lambda env: any(f(env) for f in values)
        self.fail(node)

    def _UnaryOp(self, node):
        if isinstance(node.op, ast.Not) and self.dialect != RULE:
            operand = self.compile(node.operand)
            if self.dialect == RECORD:
                return lambda scope: not _truth(operand(scope))
            return lambda env: not operand(env)
        self.fail(node)

    def _Compare(self, node):
        if len(node.ops) != 1:
            self.fail(node)
        op_type = type(node.ops[0])
        left, right = self.compile(node.left), self.compile(node.comparators[0])
        if op_type in (ast.In, ast.NotIn):
            if self.dialect != RECORD:
                self.fail(node)
            negate, separator = op_type is ast.NotIn, self.separator

            def member(scope):
                value, container = left(scope), right(scope)
                if isinstance(container, str):
                    container = [item for item in container.split(separator) if item]
                if value is None or not isinstance(container, (list, tuple, set, frozenset)):
                    return False
                return (value not in container) if negate else (value in container)
            return member
        compare = _CMP.get(op_type)
        if compare is None:
            self.fail(node)
        if self.dialect == RECORD:
            def record_compare(scope):
                a, b = _coerce(left(scope), right(scope))
                if a is None or b is None:
                    return False
                try:
                    return compare(a, b)
                except TypeError:
                    return False
            return record_compare

        def value_compare(env):
            a, b = left(env), right(env)
            if a is None or b is None:
                return False
            try:
                return compare(a, b)
            except TypeError as error:
                raise ExpressionError("RULE_TYPE_MISMATCH") from error
        return value_compare

    def _BinOp(self, node):
        if self.dialect == RECORD or type(node.op) not in _ARITH:
            self.fail(node)
        left, right = self.compile(node.left), self.compile(node.right)
        op_type, apply = type(node.op), _ARITH[type(node.op)]

        def arithmetic(env):
            a, b = left(env), right(env)
            if a is None or b is None:
                return None
            if isinstance(a, date):
                if op_type is not ast.Add:
                    raise ExpressionError("RULE_TYPE_MISMATCH")
                if not isinstance(b, Decimal) or not b.is_finite() or b != b.to_integral_value():
                    raise ExpressionError("RULE_NON_INTEGER_DAYS")
                return a + timedelta(days=int(b))
            if op_type is ast.Div and b == 0:
                raise ExpressionError("RULE_DIVISION_BY_ZERO")
            try:
                return apply(a, b)
            except (TypeError, DecimalException) as error:
                raise ExpressionError("RULE_TYPE_MISMATCH") from error
        return arithmetic

    def _Call(self, node):
        if (not isinstance(node.func, ast.Name) or node.func.id not in _FUNCTIONS[self.dialect]
                or node.keywords or not node.args):
            self.fail(node)
        args = [self.compile(a) for a in node.args]
        name = node.func.id
        if name == "ROUND_MONEY":
            if len(args) != 1:
                self.fail(node)
            quantum, rounding, inner = self.quantum, self.rounding, args[0]
            return lambda env: None if (v := inner(env)) is None else Decimal(v).quantize(quantum, rounding=rounding)
        pick = min if name == "MIN" else max

        def extreme(env):
            values = [f(env) for f in args]
            return None if any(v is None for v in values) else pick(values)
        return extreme

    def _Name(self, node):
        if node.id in ("TRUE", "FALSE"):
            constant = node.id == "TRUE"
            return lambda _: constant
        if self.dialect == RECORD:
            if node.id not in self.definitions:
                raise ExpressionError("POLICY_UNKNOWN_NAME", node.id)
            if node.id in self.compiling:
                raise ExpressionError("POLICY_DEFINITION_CYCLE", node.id)
            inner = compile_record(self.definitions[node.id], self.definitions, self.namespaces, self.separator,
                                   self.compiling + (node.id,))
            return inner
        name = node.id
        self.names.add(name)

        def variable(env):
            try:
                return env[name]
            except KeyError:
                raise ExpressionError("RULE_UNKNOWN_VARIABLE", name) from None
        return variable

    def _Attribute(self, node):
        if self.dialect != RECORD or not isinstance(node.value, ast.Name):
            self.fail(node)
        space, attribute = node.value.id, node.attr
        if self.namespaces is not None:
            if space not in self.namespaces:
                raise ExpressionError("POLICY_UNKNOWN_NAMESPACE", space)
            allowed = self.namespaces[space]
            if allowed is not None and attribute != "exists" and attribute not in allowed:
                raise ExpressionError("POLICY_UNKNOWN_ATTRIBUTE", f"{space}.{attribute}")
        self.names.add(f"{space}.{attribute}")
        if attribute == "exists":
            return lambda scope: scope.get(space) is not None

        def read(scope):
            record = scope.get(space)
            return None if record is None else record.get(attribute)
        return read

    def _Constant(self, node):
        value = node.value
        if isinstance(value, bool) or value is None:
            self.fail(node)
        if isinstance(value, str):
            if self.dialect != RECORD:
                self.fail(node)
            return lambda _: value
        if type(value) in (int, float):
            number = _number(node, self.source)
            return lambda _: number
        self.fail(node)


def _parse(text, dialect):
    if not isinstance(text, str) or not text.strip():
        raise ExpressionError("EXPRESSION_REQUIRED")
    source = _source(text, dialect)
    try:
        return ast.parse(source, mode="eval"), source
    except SyntaxError as error:
        raise ExpressionError("SYNTAX_ERROR", text) from error


_RULE_CACHE = {}


def compile_rule(text):
    """Compile one payment_rules.csv expression (BTC_DSL_V1). The literal ``ELSE`` is always true."""
    compiled = _RULE_CACHE.get(text)
    if compiled is None:
        if text.strip() == "ELSE":
            compiled = lambda _: True  # noqa: E731
        else:
            tree, source = _parse(text, RULE)
            compiled = _Compiler(RULE, source).compile(tree)
        _RULE_CACHE[text] = compiled
    return compiled


def compile_fact(text, rounding, quantum):
    """Compile a policy expression over rule variables; returns (callable, variable names used)."""
    tree, source = _parse(text, FACT)
    compiler = _Compiler(FACT, source, rounding=rounding, quantum=quantum)
    return compiler.compile(tree), compiler.names


def compile_record(text, definitions, namespaces, separator=";", compiling=()):
    """Compile a policy predicate over records; ``namespaces`` maps namespace -> allowed attributes (or None)."""
    tree, source = _parse(text, RECORD)
    compiler = _Compiler(RECORD, source, definitions, namespaces, separator=separator, compiling=compiling)
    return compiler.compile(tree)


def evaluate_expr(text, env):
    """Evaluate one rule expression against ``env``; the literal ``ELSE`` is always true."""
    return compile_rule(text)(env)


def _eval(node, env, source=None):
    """Evaluate an already parsed BTC_DSL_V1 tree (kept for the specification check command)."""
    return _Compiler(RULE, source).compile(node)(env)
