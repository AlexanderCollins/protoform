"""Comprehensive tests for the safe expression parser."""

import pytest
from protoform.expressions import (
    evaluate_expression,
    extract_field_references,
    tokenize,
    _parse,
    _eval_node,
    _to_bool,
    _strict_eq,
    _numeric_cmp,
)


# ---------------------------------------------------------------------------
# Tokenizer
# ---------------------------------------------------------------------------

class TestTokenizer:
    def test_empty_string(self):
        assert tokenize("") == []

    def test_number(self):
        tokens = tokenize("42")
        assert len(tokens) == 1
        assert tokens[0].kind == "NUMBER"
        assert tokens[0].value == "42"

    def test_negative_number(self):
        # Unary minus is a parser concern now that `-` is also subtraction
        tokens = tokenize("-5")
        assert len(tokens) == 2
        assert tokens[0].kind == "MINUS"
        assert tokens[1].kind == "NUMBER"
        assert tokens[1].value == "5"

    def test_float(self):
        tokens = tokenize("3.14")
        assert len(tokens) == 1
        assert tokens[0].kind == "NUMBER"

    def test_string_single_quotes(self):
        tokens = tokenize("'hello'")
        assert len(tokens) == 1
        assert tokens[0].kind == "STRING"

    def test_string_double_quotes(self):
        tokens = tokenize('"hello"')
        assert len(tokens) == 1
        assert tokens[0].kind == "STRING"

    def test_keywords(self):
        for kw, expected in [("true", "TRUE"), ("false", "FALSE"), ("null", "NULL"), ("undefined", "UNDEFINED")]:
            tokens = tokenize(kw)
            assert tokens[0].kind == expected, f"{kw} should tokenize as {expected}"

    def test_operators(self):
        for op, expected in [("===", "STRICT_EQ"), ("!==", "STRICT_NE"), (">=", "GE"),
                             ("<=", "LE"), ("&&", "AND"), ("||", "OR"), ("!", "NOT"),
                             (">", "GT"), ("<", "LT")]:
            tokens = tokenize(op)
            assert tokens[0].kind == expected, f"{op} should tokenize as {expected}"

    def test_identifier(self):
        tokens = tokenize("value")
        assert tokens[0].kind == "IDENT"

    def test_whitespace_skipped(self):
        tokens = tokenize("  42  ")
        assert len(tokens) == 1

    def test_complex_expression(self):
        tokens = tokenize("value('age') >= 18 && value('name') !== null")
        kinds = [t.kind for t in tokens]
        assert "IDENT" in kinds
        assert "LPAREN" in kinds
        assert "STRING" in kinds
        assert "GE" in kinds
        assert "AND" in kinds


# ---------------------------------------------------------------------------
# JS-like truthiness
# ---------------------------------------------------------------------------

class TestToBool:
    def test_none_is_falsy(self):
        assert _to_bool(None) is False

    def test_true_is_truthy(self):
        assert _to_bool(True) is True

    def test_false_is_falsy(self):
        assert _to_bool(False) is False

    def test_zero_is_falsy(self):
        assert _to_bool(0) is False

    def test_nonzero_is_truthy(self):
        assert _to_bool(42) is True

    def test_empty_string_is_falsy(self):
        assert _to_bool("") is False

    def test_nonempty_string_is_truthy(self):
        assert _to_bool("x") is True

    def test_empty_list_is_truthy(self):
        """JS: [] is truthy."""
        assert _to_bool([]) is True

    def test_empty_dict_is_truthy(self):
        """JS: {} is truthy."""
        assert _to_bool({}) is True


# ---------------------------------------------------------------------------
# Strict equality
# ---------------------------------------------------------------------------

class TestStrictEq:
    def test_none_none(self):
        assert _strict_eq(None, None) is True

    def test_none_string(self):
        assert _strict_eq(None, "x") is False

    def test_string_none(self):
        assert _strict_eq("x", None) is False

    def test_same_string(self):
        assert _strict_eq("AU", "AU") is True

    def test_different_string(self):
        assert _strict_eq("AU", "US") is False

    def test_int_float_equal(self):
        assert _strict_eq(5, 5.0) is True

    def test_bool_int_not_equal(self):
        """JS: true !== 1."""
        assert _strict_eq(True, 1) is False

    def test_bool_bool(self):
        assert _strict_eq(True, True) is True
        assert _strict_eq(True, False) is False


# ---------------------------------------------------------------------------
# Numeric comparison
# ---------------------------------------------------------------------------

class TestNumericCmp:
    def test_basic(self):
        assert _numeric_cmp(5, 3, lambda a, b: a > b) is True

    def test_none(self):
        assert _numeric_cmp(None, 3, lambda a, b: a > b) is False

    def test_string_numbers(self):
        assert _numeric_cmp("5", "3", lambda a, b: a > b) is True

    def test_invalid_string(self):
        assert _numeric_cmp("abc", 3, lambda a, b: a > b) is False


# ---------------------------------------------------------------------------
# Expression evaluation
# ---------------------------------------------------------------------------

class TestEvaluateExpression:
    # --- Literals ---
    def test_true(self):
        assert evaluate_expression("true", {}) is True

    def test_false(self):
        assert evaluate_expression("false", {}) is False

    def test_null(self):
        assert evaluate_expression("null", {}) is False  # null is falsy

    def test_undefined(self):
        assert evaluate_expression("undefined", {}) is False

    def test_number(self):
        assert evaluate_expression("42", {}) is True  # 42 is truthy

    def test_zero(self):
        assert evaluate_expression("0", {}) is False  # 0 is falsy

    def test_string_literal(self):
        assert evaluate_expression("'hello'", {}) is True  # non-empty is truthy

    def test_empty_string_literal(self):
        assert evaluate_expression("''", {}) is False

    # --- Value lookups ---
    def test_value_found(self):
        assert evaluate_expression("value('name') === 'Alex'", {"name": "Alex"}) is True

    def test_value_not_found(self):
        assert evaluate_expression("value('name') === null", {}) is True

    def test_value_number(self):
        assert evaluate_expression("value('age') === 25", {"age": 25}) is True

    def test_value_boolean(self):
        assert evaluate_expression("value('flag') === true", {"flag": True}) is True

    # --- Env lookups ---
    def test_env_found(self):
        assert evaluate_expression("env('role') === 'admin'", {}, {"role": "admin"}) is True

    def test_env_not_found(self):
        assert evaluate_expression("env('role') === null", {}, {}) is True

    def test_env_none(self):
        assert evaluate_expression("env('role') === null", {}, None) is True

    # --- Comparisons ---
    def test_strict_eq(self):
        assert evaluate_expression("value('x') === 'hello'", {"x": "hello"}) is True

    def test_strict_ne(self):
        assert evaluate_expression("value('x') !== 'hello'", {"x": "world"}) is True

    def test_gte(self):
        assert evaluate_expression("value('x') >= 18", {"x": 18}) is True
        assert evaluate_expression("value('x') >= 18", {"x": 17}) is False

    def test_lte(self):
        assert evaluate_expression("value('x') <= 18", {"x": 18}) is True
        assert evaluate_expression("value('x') <= 18", {"x": 19}) is False

    def test_gt(self):
        assert evaluate_expression("value('x') > 18", {"x": 19}) is True
        assert evaluate_expression("value('x') > 18", {"x": 18}) is False

    def test_lt(self):
        assert evaluate_expression("value('x') < 18", {"x": 17}) is True
        assert evaluate_expression("value('x') < 18", {"x": 18}) is False

    # --- Logic ---
    def test_and_both_true(self):
        assert evaluate_expression("value('a') === 1 && value('b') === 2", {"a": 1, "b": 2}) is True

    def test_and_one_false(self):
        assert evaluate_expression("value('a') === 1 && value('b') === 2", {"a": 1, "b": 3}) is False

    def test_or_one_true(self):
        assert evaluate_expression("value('a') === 1 || value('b') === 2", {"a": 0, "b": 2}) is True

    def test_or_both_false(self):
        assert evaluate_expression("value('a') === 1 || value('b') === 2", {"a": 0, "b": 0}) is False

    def test_not(self):
        assert evaluate_expression("!value('x')", {"x": ""}) is True
        assert evaluate_expression("!value('x')", {"x": "hi"}) is False

    def test_not_null(self):
        assert evaluate_expression("!value('x')", {}) is True

    # --- Short-circuit semantics ---
    def test_and_short_circuit_returns_falsy(self):
        """JS: false && 'hello' returns false (not 'hello')."""
        ast = _parse("false && 'hello'")
        result = _eval_node(ast, {}, None)
        assert result is False

    def test_and_short_circuit_returns_last(self):
        """JS: true && 'hello' returns 'hello'."""
        ast = _parse("true && 'hello'")
        result = _eval_node(ast, {}, None)
        assert result == "hello"

    def test_or_short_circuit_returns_truthy(self):
        """JS: 'hello' || false returns 'hello'."""
        ast = _parse("'hello' || false")
        result = _eval_node(ast, {}, None)
        assert result == "hello"

    def test_or_short_circuit_returns_last(self):
        """JS: false || 'hello' returns 'hello'."""
        ast = _parse("false || 'hello'")
        result = _eval_node(ast, {}, None)
        assert result == "hello"

    # --- Parentheses ---
    def test_paren_precedence(self):
        assert evaluate_expression(
            "(value('a') === 'x' || value('a') === 'y') && value('b') === 'z'",
            {"a": "y", "b": "z"},
        ) is True

    def test_nested_parens(self):
        assert evaluate_expression(
            "((value('x') === 1))",
            {"x": 1},
        ) is True

    # --- Member access ---
    def test_length_string(self):
        assert evaluate_expression("value('x').length > 3", {"x": "hello"}) is True
        assert evaluate_expression("value('x').length > 3", {"x": "hi"}) is False

    def test_length_list(self):
        assert evaluate_expression("value('x').length > 1", {"x": [1, 2, 3]}) is True

    def test_length_null(self):
        assert evaluate_expression("value('x').length > 0", {}) is False

    def test_length_equals(self):
        assert evaluate_expression("value('x').length === 5", {"x": "hello"}) is True

    # --- Method calls ---
    def test_includes_string(self):
        assert evaluate_expression("value('x').includes('ell')", {"x": "hello"}) is True
        assert evaluate_expression("value('x').includes('xyz')", {"x": "hello"}) is False

    def test_includes_list(self):
        assert evaluate_expression("value('x').includes('a')", {"x": ["a", "b"]}) is True
        assert evaluate_expression("value('x').includes('c')", {"x": ["a", "b"]}) is False

    def test_includes_null(self):
        assert evaluate_expression("value('x').includes('a')", {}) is False

    def test_test_method(self):
        """Regex .test() — note: in Python parser, obj.test(arg) does re.search(obj, arg)."""
        # The expression /^[A-Z]/.test(value('x')) can't be parsed directly (regex literal),
        # but value('pattern').test(value('target')) works via the evaluator
        assert evaluate_expression("value('p').test(value('t'))", {"p": "^[A-Z]", "t": "Hello"}) is True
        assert evaluate_expression("value('p').test(value('t'))", {"p": "^[A-Z]", "t": "hello"}) is False

    def test_test_null_target(self):
        assert evaluate_expression("value('p').test(value('t'))", {"p": "^[A-Z]"}) is False

    # --- Error handling ---
    def test_empty_expression(self):
        assert evaluate_expression("", {}) is False

    def test_invalid_expression(self):
        assert evaluate_expression("THIS IS NOT VALID ===", {}) is False

    def test_unknown_function(self):
        assert evaluate_expression("foo('x')", {}) is False

    # --- Complex expressions ---
    def test_null_coalesce_pattern(self):
        """value('x') || '' pattern."""
        ast = _parse("value('x') || ''")
        result = _eval_node(ast, {}, None)
        assert result == ""

        result2 = _eval_node(ast, {"x": "hello"}, None)
        assert result2 == "hello"

    def test_combined_comparison_and_null_check(self):
        assert evaluate_expression(
            "value('age') < 18 && value('age') !== null && value('age') !== ''",
            {"age": 10},
        ) is True

    def test_combined_comparison_null_safe(self):
        assert evaluate_expression(
            "value('age') < 18 && value('age') !== null && value('age') !== ''",
            {},
        ) is False  # value('age') is null, so !== null is false


# ---------------------------------------------------------------------------
# Field reference extraction
# ---------------------------------------------------------------------------

class TestExtractFieldReferences:
    def test_single(self):
        assert extract_field_references("value('age') >= 18") == {"age"}

    def test_multiple(self):
        refs = extract_field_references("value('a') > value('b')")
        assert refs == {"a", "b"}

    def test_none(self):
        assert extract_field_references("true") == set()

    def test_double_quotes(self):
        assert extract_field_references('value("name") === "x"') == {"name"}

    def test_env_not_extracted(self):
        refs = extract_field_references("env('role') === 'admin'")
        assert refs == set()

    def test_complex(self):
        refs = extract_field_references(
            "value('a') === 'x' && (value('b') > 5 || value('c') !== null)"
        )
        assert refs == {"a", "b", "c"}


class TestAggregatesOverPlainArrays:
    """count()/sum() read any array value, not just repeat rows — a
    multiselect's array of scalars counts, and sum() skips non-dict rows
    exactly like the TypeScript engine (returns 0, never raises)."""

    def test_count_over_multiselect_array(self):
        assert evaluate_expression("count('interests') === 2", {"interests": ["a", "b"]}) is True

    def test_count_over_missing_value(self):
        assert evaluate_expression("count('interests') === 0", {}) is True

    def test_sum_skips_scalar_rows(self):
        assert evaluate_expression("sum('interests', 'qty') === 0", {"interests": ["a", "b"]}) is True

    def test_includes_on_array_value(self):
        assert evaluate_expression("value('interests').includes('b')", {"interests": ["a", "b"]}) is True
        assert evaluate_expression("value('interests').includes('z')", {"interests": ["a", "b"]}) is False
