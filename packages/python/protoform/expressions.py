"""
Safe recursive-descent expression parser for ProtoForm.

A Python mirror of the TypeScript engine's parser
(packages/core/src/parser.ts). The two must stay semantically identical;
the conformance suite verifies this.

Handles the ProtoForm expression grammar without eval/exec:
value('fieldId'), env('key'), bare field identifiers, isEmpty(), regex
literals, array literals, comparisons, logic, arithmetic, and the
round/min/max and count/sum/total_pct builtins.

Semantics notes (mirroring the TS engine):
- Missing values normalize to None, and `undefined` is the same value as
  `null`, so value('missing') === null is true in both engines.
- && / || short-circuit and return operand values (JS style).
- Ordering comparisons: string-vs-string is lexicographic; anything else
  coerces via strict float rules (non-numeric makes the comparison false).
- Arithmetic (+ - * /) is numeric only. Non-numeric operands and division
  by zero raise, which makes a boolean expression false and a computed
  value None (fail closed).
- Unknown characters, functions, or members raise; the caller treats a
  raising expression as false (fail closed).
"""

from __future__ import annotations

import json
import math
import re
from typing import Any

# ---------------------------------------------------------------------------
# Tokenizer
# ---------------------------------------------------------------------------

TOKEN_SPEC = [
    ("NUMBER",    r"\d+(?:\.\d+)?"),
    ("STRING",    r"'(?:[^'\\]|\\.)*'|\"(?:[^\"\\]|\\.)*\""),
    ("REGEX",     r"/(?:[^/\\\n]|\\.)+/"),
    ("TRUE",      r"\btrue\b"),
    ("FALSE",     r"\bfalse\b"),
    ("NULL",      r"\bnull\b"),
    ("UNDEFINED", r"\bundefined\b"),
    ("IDENT",     r"[a-zA-Z_]\w*"),
    ("STRICT_EQ", r"==="),
    ("STRICT_NE", r"!=="),
    ("GE",        r">="),
    ("LE",        r"<="),
    ("AND",       r"&&"),
    ("OR",        r"\|\|"),
    ("NOT",       r"!"),
    ("GT",        r">"),
    ("LT",        r"<"),
    ("PLUS",      r"\+"),
    ("MINUS",     r"-"),
    ("STAR",      r"\*"),
    ("SLASH",     r"/"),
    ("LPAREN",    r"\("),
    ("RPAREN",    r"\)"),
    ("LBRACKET",  r"\["),
    ("RBRACKET",  r"\]"),
    ("DOT",       r"\."),
    ("COMMA",     r","),
    ("SKIP",      r"[ \t\r\n]+"),
    ("MISMATCH",  r"."),
]

_COMPILED_SPEC = [(name, re.compile(pattern)) for name, pattern in TOKEN_SPEC]

# Token kinds after which a `/` means division, not a regex literal.
# Mirrors how JS lexers disambiguate the two.
_OPERAND_ENDINGS = {
    "NUMBER", "STRING", "IDENT", "RPAREN", "RBRACKET",
    "TRUE", "FALSE", "NULL", "UNDEFINED",
}


class Token:
    __slots__ = ("kind", "value")

    def __init__(self, kind: str, value: str):
        self.kind = kind
        self.value = value

    def __repr__(self) -> str:
        return f"Token({self.kind}, {self.value!r})"


def tokenize(source: str) -> list[Token]:
    tokens: list[Token] = []
    pos = 0
    while pos < len(source):
        for kind, pattern in _COMPILED_SPEC:
            # In operand position `/` starts a regex; after an operand it divides
            if kind == "REGEX" and tokens and tokens[-1].kind in _OPERAND_ENDINGS:
                continue
            m = pattern.match(source, pos)
            if not m:
                continue
            pos = m.end()
            if kind == "SKIP":
                break
            if kind == "MISMATCH":
                raise ValueError(f"Unexpected character {m.group()!r} in expression")
            tokens.append(Token(kind, m.group()))
            break
    return tokens


# ---------------------------------------------------------------------------
# Parser — recursive descent
# ---------------------------------------------------------------------------

class _Parser:
    """Parses token stream into an AST (nested tuples)."""

    def __init__(self, tokens: list[Token]):
        self.tokens = tokens
        self.pos = 0

    def peek(self) -> Token | None:
        if self.pos < len(self.tokens):
            return self.tokens[self.pos]
        return None

    def advance(self) -> Token:
        tok = self.tokens[self.pos]
        self.pos += 1
        return tok

    def expect(self, kind: str) -> Token:
        tok = self.peek()
        if tok is None or tok.kind != kind:
            got = tok.kind if tok else "EOF"
            raise ValueError(f"Expected {kind}, got {got}")
        return self.advance()

    # --- Grammar rules (lowest to highest precedence) ---

    def parse(self) -> Any:
        result = self.expr_or()
        if self.pos < len(self.tokens):
            raise ValueError(f"Unexpected token: {self.tokens[self.pos]}")
        return result

    def expr_or(self) -> Any:
        left = self.expr_and()
        while self.peek() and self.peek().kind == "OR":
            self.advance()
            left = ("or", left, self.expr_and())
        return left

    def expr_and(self) -> Any:
        left = self.expr_not()
        while self.peek() and self.peek().kind == "AND":
            self.advance()
            left = ("and", left, self.expr_not())
        return left

    def expr_not(self) -> Any:
        if self.peek() and self.peek().kind == "NOT":
            self.advance()
            return ("not", self.expr_not())
        return self.expr_comparison()

    def expr_comparison(self) -> Any:
        left = self.expr_additive()
        comp_ops = {"STRICT_EQ", "STRICT_NE", "GE", "LE", "GT", "LT"}
        if self.peek() and self.peek().kind in comp_ops:
            op = self.advance()
            return ("cmp", op.value, left, self.expr_additive())
        return left

    def expr_additive(self) -> Any:
        left = self.expr_multiplicative()
        while self.peek() and self.peek().kind in ("PLUS", "MINUS"):
            op = self.advance()
            left = ("arith", op.value, left, self.expr_multiplicative())
        return left

    def expr_multiplicative(self) -> Any:
        left = self.expr_unary()
        while self.peek() and self.peek().kind in ("STAR", "SLASH"):
            op = self.advance()
            left = ("arith", op.value, left, self.expr_unary())
        return left

    def expr_unary(self) -> Any:
        if self.peek() and self.peek().kind == "MINUS":
            self.advance()
            return ("neg", self.expr_unary())
        return self.expr_postfix()

    def expr_postfix(self) -> Any:
        node = self.expr_primary()
        # Handle .length, .test(), .includes()
        while self.peek() and self.peek().kind == "DOT":
            self.advance()
            member = self.expect("IDENT")
            if self.peek() and self.peek().kind == "LPAREN":
                self.advance()
                args = []
                if self.peek() and self.peek().kind != "RPAREN":
                    args.append(self.expr_or())
                    while self.peek() and self.peek().kind == "COMMA":
                        self.advance()
                        args.append(self.expr_or())
                self.expect("RPAREN")
                node = ("method_call", node, member.value, args)
            else:
                node = ("member", node, member.value)
        return node

    def expr_primary(self) -> Any:
        tok = self.peek()
        if tok is None:
            raise ValueError("Unexpected end of expression")

        if tok.kind == "NUMBER":
            self.advance()
            val = float(tok.value) if "." in tok.value else int(tok.value)
            return ("literal", val)

        if tok.kind == "STRING":
            self.advance()
            return ("literal", tok.value[1:-1])  # strip quotes

        if tok.kind == "REGEX":
            self.advance()
            # /pattern/ — strip slashes, unescape \/ so the pattern string
            # matches what a JS regex literal would contain.
            return ("literal", tok.value[1:-1].replace("\\/", "/"))

        if tok.kind == "TRUE":
            self.advance()
            return ("literal", True)

        if tok.kind == "FALSE":
            self.advance()
            return ("literal", False)

        if tok.kind in ("NULL", "UNDEFINED"):
            self.advance()
            return ("literal", None)  # undefined ≡ null across engines

        if tok.kind == "IDENT":
            self.advance()
            name = tok.value
            if self.peek() and self.peek().kind == "LPAREN":
                self.advance()
                args = []
                if self.peek() and self.peek().kind != "RPAREN":
                    args.append(self.expr_or())
                    while self.peek() and self.peek().kind == "COMMA":
                        self.advance()
                        args.append(self.expr_or())
                self.expect("RPAREN")
                return ("call", name, args)
            return ("ident", name)

        if tok.kind == "LPAREN":
            self.advance()
            node = self.expr_or()
            self.expect("RPAREN")
            return node

        if tok.kind == "LBRACKET":
            # Array literal: [] or [expr, expr, ...]
            self.advance()
            elements = []
            if self.peek() and self.peek().kind != "RBRACKET":
                elements.append(self.expr_or())
                while self.peek() and self.peek().kind == "COMMA":
                    self.advance()
                    elements.append(self.expr_or())
            self.expect("RBRACKET")
            return ("array", elements)

        raise ValueError(f"Unexpected token: {tok}")


def _parse(source: str) -> Any:
    tokens = tokenize(source)
    if not tokens:
        return ("literal", False)
    parser = _Parser(tokens)
    return parser.parse()


# ---------------------------------------------------------------------------
# Custom expression functions
#
# Hosts register domain-specific validators (checksums, lookups,
# jurisdiction rules) callable by name from expressions. A function must be
# registered in EVERY engine that evaluates the schema — an unregistered
# function makes its expression false (fail closed), never a crash.
# ---------------------------------------------------------------------------

FUNCTION_REGISTRY: dict[str, Any] = {}


def register_function(name: str, fn) -> None:
    if not re.match(r"^[a-zA-Z_]\w*$", name):
        raise ValueError(f"Invalid function name: {name}")
    FUNCTION_REGISTRY[name] = fn


def unregister_function(name: str) -> None:
    FUNCTION_REGISTRY.pop(name, None)


# ---------------------------------------------------------------------------
# Evaluator
# ---------------------------------------------------------------------------

def _is_empty_value(v: Any) -> bool:
    return v is None or v == "" or (isinstance(v, (list, dict)) and len(v) == 0)


def _to_bool(val: Any) -> bool:
    """JS-like truthiness."""
    if val is None:
        return False
    if isinstance(val, bool):
        return val
    if isinstance(val, float) and math.isnan(val):
        return False
    if isinstance(val, (int, float)):
        return val != 0
    if isinstance(val, str):
        return val != ""
    if isinstance(val, (list, dict)):
        return True  # JS: [] and {} are truthy
    return True


def _strict_eq(a: Any, b: Any) -> bool:
    """JS-like strict equality."""
    if a is None and b is None:
        return True
    if a is None or b is None:
        return False
    if type(a) is bool or type(b) is bool:
        return type(a) is type(b) and a == b
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return float(a) == float(b)
    if isinstance(a, str) and isinstance(b, str):
        return a == b
    return a is b


def _strict_float(v: Any) -> float:
    """Python float() semantics: numbers/bools pass; numeric strings parse;
    everything else raises."""
    if v is None:
        return float("nan")
    if isinstance(v, bool):
        return 1.0 if v else 0.0
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, str):
        t = v.strip()
        if re.match(r"^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$", t):
            return float(t)
        raise ValueError(f"Cannot coerce {v!r} to number")
    raise ValueError("Cannot coerce value to number")


def _arith_float(v: Any) -> float:
    """Arithmetic coercion: like _strict_float, but None/'' count as errors
    so incomplete inputs make computed values None instead of NaN."""
    if v is None or v == "":
        raise ValueError("Arithmetic on empty value")
    f = _strict_float(v)
    if math.isnan(f):
        raise ValueError("Arithmetic on non-numeric value")
    return f


def _numeric_cmp(a: Any, b: Any, op) -> bool:
    """Ordering comparison with JS-like coercion.

    Two strings compare lexicographically (as in JS — this is what makes
    ISO date-string rules like value('end') >= value('start') work);
    everything else is coerced to float, with non-coercible operands
    making the comparison false.
    """
    if isinstance(a, str) and isinstance(b, str):
        return op(a, b)
    try:
        fa = _strict_float(a)
        fb = _strict_float(b)
        return op(fa, fb)
    except (TypeError, ValueError):
        return False


def _round_half_away_from_zero(x: float, dp: int) -> float:
    """Both engines implement this algorithm explicitly so results match
    (Python's round() does banker's rounding, JS Math.round differs)."""
    factor = 10.0 ** dp
    scaled = abs(x) * factor
    rounded = math.floor(scaled + 0.5) / factor
    return -rounded if x < 0 else rounded


def _repeat_rows(values: dict, repeat_id: Any) -> list:
    rows = values.get(str(repeat_id))
    return rows if isinstance(rows, list) else []


def _sum_rows(values: dict, repeat_id: Any, field_id: Any) -> float:
    total = 0.0
    for row in _repeat_rows(values, repeat_id):
        # Non-dict rows (e.g. a multiselect's array of scalars) have no
        # fields to sum; skip them like the TypeScript engine does.
        v = row.get(str(field_id)) if isinstance(row, dict) else None
        if v is None or v == "":
            continue  # empty counts as 0
        total += _arith_float(v)
    return total


def _eval_node(node: Any, values: dict, env: dict | None) -> Any:
    kind = node[0]

    if kind == "literal":
        return node[1]

    if kind == "array":
        return [_eval_node(el, values, env) for el in node[1]]

    if kind == "call":
        _, name, args = node
        evaluated_args = [_eval_node(a, values, env) for a in args]
        if name == "value":
            field_id = evaluated_args[0] if evaluated_args else None
            return values.get(field_id, None)
        if name == "env":
            key = evaluated_args[0] if evaluated_args else None
            if env is None:
                return None
            return env.get(key, None)
        if name == "isEmpty":
            v = evaluated_args[0] if evaluated_args else None
            return _is_empty_value(v)
        if name == "round":
            dp = int(_arith_float(evaluated_args[1])) if len(evaluated_args) > 1 else 0
            return _round_half_away_from_zero(_arith_float(evaluated_args[0]), dp)
        if name in ("min", "max"):
            if not evaluated_args:
                raise ValueError(f"{name}() needs at least one argument")
            nums = [_arith_float(a) for a in evaluated_args]
            return min(nums) if name == "min" else max(nums)
        if name == "count":
            return len(_repeat_rows(values, evaluated_args[0]))
        if name == "sum":
            return _sum_rows(values, evaluated_args[0], evaluated_args[1])
        if name == "total_pct":
            return abs(_sum_rows(values, evaluated_args[0], evaluated_args[1]) - 100) < 1e-9
        custom = FUNCTION_REGISTRY.get(name)
        if custom is not None:
            return custom(*evaluated_args)
        raise ValueError(f"Unknown function: {name}")

    if kind == "ident":
        # Bare identifier — field lookup, mirroring the TS engine which
        # resolves bare names against the values map.
        return values.get(node[1])

    if kind == "member":
        _, obj_node, member = node
        obj = _eval_node(obj_node, values, env)
        if member == "length":
            if obj is None:
                return 0
            if isinstance(obj, (str, list)):
                return len(obj)
            return 0
        raise ValueError(f"Unknown member: .{member}")

    if kind == "method_call":
        _, obj_node, method, arg_nodes = node
        obj = _eval_node(obj_node, values, env)
        args = [_eval_node(a, values, env) for a in arg_nodes]
        if method == "test":
            # Receiver is the pattern (regex literal or pattern string)
            if obj is None:
                return False
            pattern = obj if isinstance(obj, str) else str(obj)
            target = args[0] if args else ""
            if target is None:
                return False
            try:
                return bool(re.search(pattern, str(target)))
            except re.error:
                return False
        if method == "includes":
            if obj is None:
                return False
            search_val = args[0] if args else None
            if isinstance(obj, str):
                return str(search_val) in obj if search_val is not None else False
            if isinstance(obj, list):
                return search_val in obj
            return False
        raise ValueError(f"Unknown method: .{method}()")

    if kind == "not":
        return not _to_bool(_eval_node(node[1], values, env))

    if kind == "neg":
        return -_arith_float(_eval_node(node[1], values, env))

    if kind == "and":
        left = _eval_node(node[1], values, env)
        if not _to_bool(left):
            return left  # short-circuit: return the falsy value
        return _eval_node(node[2], values, env)

    if kind == "or":
        left = _eval_node(node[1], values, env)
        if _to_bool(left):
            return left  # short-circuit: return the truthy value
        return _eval_node(node[2], values, env)

    if kind == "cmp":
        _, op, left_node, right_node = node
        left = _eval_node(left_node, values, env)
        right = _eval_node(right_node, values, env)

        if op == "===":
            return _strict_eq(left, right)
        if op == "!==":
            return not _strict_eq(left, right)
        if op == ">=":
            return _numeric_cmp(left, right, lambda a, b: a >= b)
        if op == "<=":
            return _numeric_cmp(left, right, lambda a, b: a <= b)
        if op == ">":
            return _numeric_cmp(left, right, lambda a, b: a > b)
        if op == "<":
            return _numeric_cmp(left, right, lambda a, b: a < b)

        raise ValueError(f"Unknown operator: {op}")

    if kind == "arith":
        _, op, left_node, right_node = node
        a = _arith_float(_eval_node(left_node, values, env))
        b = _arith_float(_eval_node(right_node, values, env))
        if op == "+":
            return a + b
        if op == "-":
            return a - b
        if op == "*":
            return a * b
        if op == "/":
            if b == 0:
                raise ValueError("Division by zero")
            return a / b
        raise ValueError(f"Unknown operator: {op}")

    raise ValueError(f"Unknown AST node: {kind}")


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def evaluate_expression(
    expr: str,
    values: dict,
    env: dict | None = None,
) -> bool:
    """
    Evaluate a ProtoForm expression string safely. Returns a boolean.
    Any parse or evaluation error yields False (fail closed).
    """
    try:
        ast = _parse(expr)
        result = _eval_node(ast, values, env)
        return _to_bool(result)
    except Exception:
        return False


def evaluate_value_expression(
    expr: str,
    values: dict,
    env: dict | None = None,
) -> Any:
    """
    Evaluate an expression for its raw value (used by computed fields).
    Any error, NaN, or infinity yields None (fail closed).
    """
    try:
        ast = _parse(expr)
        result = _eval_node(ast, values, env)
        if isinstance(result, float) and not math.isfinite(result):
            return None
        return result
    except Exception:
        return None


def format_value(v: Any) -> str:
    """
    Canonical value-to-string used for message interpolation. Numbers with
    no fractional part render without a decimal point so both engines
    produce identical text (Python floats would otherwise print "2.0").
    """
    if v is None:
        return ""
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, int):
        return str(v)
    if isinstance(v, float):
        return str(int(v)) if v.is_integer() else repr(v)
    if isinstance(v, str):
        return v
    return json.dumps(v, separators=(",", ":"))


def extract_field_references(expr: str, known_fields: set[str] | None = None) -> set[str]:
    """Extract field IDs referenced by an expression string.

    Captures value('fieldId') calls, plus — when known_fields is given —
    bare identifiers that name a known field (bare field names are valid
    in expressions, mirroring the TS engine).
    """
    fields = set(re.findall(r"value\(\s*['\"]([^'\"]+)['\"]\s*\)", expr))
    if known_fields:
        for ident in re.findall(r"\b[a-zA-Z_]\w*\b", expr):
            if ident in known_fields:
                fields.add(ident)
    return fields
