/**
 * Safe expression parser/evaluator for ProtoForm.
 *
 * A TypeScript port of the Python engine's recursive-descent parser
 * (packages/python/protoform/expressions.py). The two must stay
 * semantically identical; the conformance suite verifies this.
 *
 * No eval / new Function: safe under a strict Content-Security-Policy
 * (no 'unsafe-eval'), and expressions cannot execute arbitrary code.
 *
 * Semantics notes (mirroring the Python engine):
 * - `undefined` and `null` are the same value (both normalize to null),
 *   so `value('missing') === null` is true in both engines.
 * - `&&` / `||` short-circuit and return operand values (JS style).
 * - Ordering comparisons: string-vs-string is lexicographic; anything
 *   else coerces via strict float rules (non-numeric makes the
 *   comparison false).
 * - Arithmetic (+ - * /) is numeric only. Non-numeric operands and
 *   division by zero throw, which makes a boolean expression false and
 *   a computed value null (fail closed).
 * - Unknown characters, functions, or members throw; the caller treats
 *   a throwing expression as false (fail closed).
 */

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

type TokenKind =
  | "NUMBER" | "STRING" | "REGEX"
  | "TRUE" | "FALSE" | "NULL" | "UNDEFINED"
  | "IDENT"
  | "STRICT_EQ" | "STRICT_NE" | "GE" | "LE" | "GT" | "LT"
  | "AND" | "OR" | "NOT"
  | "PLUS" | "MINUS" | "STAR" | "SLASH"
  | "LPAREN" | "RPAREN" | "LBRACKET" | "RBRACKET"
  | "DOT" | "COMMA";

interface Token {
  kind: TokenKind;
  value: string;
}

const TOKEN_SPEC: [TokenKind | "SKIP" | "MISMATCH", RegExp][] = [
  ["NUMBER", /^\d+(?:\.\d+)?/],
  ["STRING", /^(?:'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")/],
  ["REGEX", /^\/(?:[^/\\\n]|\\.)+\//],
  ["TRUE", /^\btrue\b/],
  ["FALSE", /^\bfalse\b/],
  ["NULL", /^\bnull\b/],
  ["UNDEFINED", /^\bundefined\b/],
  ["IDENT", /^[a-zA-Z_]\w*/],
  ["STRICT_EQ", /^===/],
  ["STRICT_NE", /^!==/],
  ["GE", /^>=/],
  ["LE", /^<=/],
  ["AND", /^&&/],
  ["OR", /^\|\|/],
  ["NOT", /^!/],
  ["GT", /^>/],
  ["LT", /^</],
  ["PLUS", /^\+/],
  ["MINUS", /^-/],
  ["STAR", /^\*/],
  ["SLASH", /^\//],
  ["LPAREN", /^\(/],
  ["RPAREN", /^\)/],
  ["LBRACKET", /^\[/],
  ["RBRACKET", /^\]/],
  ["DOT", /^\./],
  ["COMMA", /^,/],
  ["SKIP", /^[ \t\r\n]+/],
  ["MISMATCH", /^./],
];

/** Token kinds after which a `/` means division, not a regex literal.
 * Mirrors how JS lexers disambiguate the two. */
const OPERAND_ENDINGS = new Set<TokenKind>([
  "NUMBER", "STRING", "IDENT", "RPAREN", "RBRACKET",
  "TRUE", "FALSE", "NULL", "UNDEFINED",
]);

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let rest = source;
  while (rest.length > 0) {
    let matched = false;
    for (const [kind, re] of TOKEN_SPEC) {
      // In operand position `/` starts a regex; after an operand it divides
      if (kind === "REGEX") {
        const prev = tokens[tokens.length - 1];
        if (prev && OPERAND_ENDINGS.has(prev.kind)) continue;
      }
      const m = re.exec(rest);
      if (!m) continue;
      matched = true;
      rest = rest.slice(m[0].length);
      if (kind === "SKIP") break;
      if (kind === "MISMATCH") {
        throw new Error(`Unexpected character ${JSON.stringify(m[0])} in expression`);
      }
      tokens.push({ kind, value: m[0] });
      break;
    }
    if (!matched) throw new Error("Tokenizer stalled"); // unreachable
  }
  return tokens;
}

// ---------------------------------------------------------------------------
// Parser — recursive descent (AST as tagged arrays, mirrored in Python)
// ---------------------------------------------------------------------------

type Node =
  | ["literal", any]
  | ["array", Node[]]
  | ["call", string, Node[]]
  | ["ident", string]
  | ["member", Node, string]
  | ["method_call", Node, string, Node[]]
  | ["not", Node]
  | ["neg", Node]
  | ["and", Node, Node]
  | ["or", Node, Node]
  | ["cmp", string, Node, Node]
  | ["arith", string, Node, Node];

class Parser {
  private pos = 0;
  constructor(private tokens: Token[]) {}

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }
  private advance(): Token {
    return this.tokens[this.pos++];
  }
  private expect(kind: TokenKind): Token {
    const tok = this.peek();
    if (!tok || tok.kind !== kind) {
      throw new Error(`Expected ${kind}, got ${tok ? tok.kind : "EOF"}`);
    }
    return this.advance();
  }

  parse(): Node {
    const result = this.exprOr();
    if (this.pos < this.tokens.length) {
      throw new Error(`Unexpected token: ${this.tokens[this.pos].value}`);
    }
    return result;
  }

  private exprOr(): Node {
    let left = this.exprAnd();
    while (this.peek()?.kind === "OR") {
      this.advance();
      left = ["or", left, this.exprAnd()];
    }
    return left;
  }

  private exprAnd(): Node {
    let left = this.exprNot();
    while (this.peek()?.kind === "AND") {
      this.advance();
      left = ["and", left, this.exprNot()];
    }
    return left;
  }

  private exprNot(): Node {
    if (this.peek()?.kind === "NOT") {
      this.advance();
      return ["not", this.exprNot()];
    }
    return this.exprComparison();
  }

  private exprComparison(): Node {
    const left = this.exprAdditive();
    const kind = this.peek()?.kind;
    if (kind === "STRICT_EQ" || kind === "STRICT_NE" || kind === "GE" || kind === "LE" || kind === "GT" || kind === "LT") {
      const op = this.advance();
      return ["cmp", op.value, left, this.exprAdditive()];
    }
    return left;
  }

  private exprAdditive(): Node {
    let left = this.exprMultiplicative();
    while (this.peek()?.kind === "PLUS" || this.peek()?.kind === "MINUS") {
      const op = this.advance();
      left = ["arith", op.value, left, this.exprMultiplicative()];
    }
    return left;
  }

  private exprMultiplicative(): Node {
    let left = this.exprUnary();
    while (this.peek()?.kind === "STAR" || this.peek()?.kind === "SLASH") {
      const op = this.advance();
      left = ["arith", op.value, left, this.exprUnary()];
    }
    return left;
  }

  private exprUnary(): Node {
    if (this.peek()?.kind === "MINUS") {
      this.advance();
      return ["neg", this.exprUnary()];
    }
    return this.exprPostfix();
  }

  private exprPostfix(): Node {
    let node = this.exprPrimary();
    while (this.peek()?.kind === "DOT") {
      this.advance();
      const member = this.expect("IDENT");
      if (this.peek()?.kind === "LPAREN") {
        this.advance();
        const args: Node[] = [];
        if (this.peek() && this.peek()!.kind !== "RPAREN") {
          args.push(this.exprOr());
          while (this.peek()?.kind === "COMMA") {
            this.advance();
            args.push(this.exprOr());
          }
        }
        this.expect("RPAREN");
        node = ["method_call", node, member.value, args];
      } else {
        node = ["member", node, member.value];
      }
    }
    return node;
  }

  private exprPrimary(): Node {
    const tok = this.peek();
    if (!tok) throw new Error("Unexpected end of expression");

    switch (tok.kind) {
      case "NUMBER":
        this.advance();
        return ["literal", parseFloat(tok.value)];
      case "STRING":
        this.advance();
        return ["literal", tok.value.slice(1, -1)];
      case "REGEX":
        this.advance();
        // Strip slashes, unescape \/ — the pattern a JS regex literal holds
        return ["literal", tok.value.slice(1, -1).replace(/\\\//g, "/")];
      case "TRUE":
        this.advance();
        return ["literal", true];
      case "FALSE":
        this.advance();
        return ["literal", false];
      case "NULL":
      case "UNDEFINED":
        this.advance();
        return ["literal", null]; // undefined ≡ null across engines
      case "IDENT": {
        this.advance();
        if (this.peek()?.kind === "LPAREN") {
          this.advance();
          const args: Node[] = [];
          if (this.peek() && this.peek()!.kind !== "RPAREN") {
            args.push(this.exprOr());
            while (this.peek()?.kind === "COMMA") {
              this.advance();
              args.push(this.exprOr());
            }
          }
          this.expect("RPAREN");
          return ["call", tok.value, args];
        }
        return ["ident", tok.value];
      }
      case "LPAREN": {
        this.advance();
        const node = this.exprOr();
        this.expect("RPAREN");
        return node;
      }
      case "LBRACKET": {
        this.advance();
        const elements: Node[] = [];
        if (this.peek() && this.peek()!.kind !== "RBRACKET") {
          elements.push(this.exprOr());
          while (this.peek()?.kind === "COMMA") {
            this.advance();
            elements.push(this.exprOr());
          }
        }
        this.expect("RBRACKET");
        return ["array", elements];
      }
      default:
        throw new Error(`Unexpected token: ${tok.value}`);
    }
  }
}

const astCache = new Map<string, Node>();

export function parseExpression(source: string): Node {
  const cached = astCache.get(source);
  if (cached) return cached;
  const tokens = tokenize(source);
  if (tokens.length === 0) {
    const empty: Node = ["literal", false];
    astCache.set(source, empty);
    return empty;
  }
  const ast = new Parser(tokens).parse();
  astCache.set(source, ast);
  return ast;
}

export function clearParserCache(): void {
  astCache.clear();
}

// ---------------------------------------------------------------------------
// Custom expression functions
// ---------------------------------------------------------------------------

/**
 * Custom expression functions. Hosts register domain-specific validators
 * (checksums, lookups against loaded data, jurisdiction rules) that the
 * expression grammar can then call by name. A function must be registered
 * in EVERY engine that evaluates the schema — an unregistered function
 * makes its expression false (fail closed), never a crash.
 */
const FUNCTION_REGISTRY = new Map<string, (...args: any[]) => any>();

export function registerFunction(name: string, fn: (...args: any[]) => any): void {
  if (!/^[a-zA-Z_]\w*$/.test(name)) {
    throw new Error(`Invalid function name: ${name}`);
  }
  FUNCTION_REGISTRY.set(name, fn);
}

export function unregisterFunction(name: string): void {
  FUNCTION_REGISTRY.delete(name);
}

// ---------------------------------------------------------------------------
// Evaluator
// ---------------------------------------------------------------------------

/** undefined normalizes to null so both engines treat missing values alike. */
const norm = (v: any) => (v === undefined ? null : v);

function isEmptyValue(v: any): boolean {
  if (v === null || v === undefined || v === "") return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.keys(v).length === 0;
  return false;
}

function toBool(v: any): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0 && !Number.isNaN(v);
  if (typeof v === "string") return v !== "";
  return true; // arrays and objects are truthy (even empty, as in JS)
}

function strictEq(a: any, b: any): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  if (typeof a === "boolean" || typeof b === "boolean") {
    return typeof a === typeof b && a === b;
  }
  if (typeof a === "number" && typeof b === "number") return a === b;
  if (typeof a === "string" && typeof b === "string") return a === b;
  return a === b; // reference equality for arrays/objects
}

/** Python float() semantics: numbers/bools pass; numeric strings parse;
 * everything else throws. */
function strictFloat(v: any): number {
  if (v === null) return NaN;
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "string") {
    const t = v.trim();
    if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t)) return parseFloat(t);
    throw new Error(`Cannot coerce ${JSON.stringify(v)} to number`);
  }
  throw new Error("Cannot coerce value to number");
}

/** Arithmetic coercion: like strictFloat, but null/'' count as errors so
 * incomplete inputs make computed values null instead of NaN. */
function arithFloat(v: any): number {
  if (v === null || v === undefined || v === "") {
    throw new Error("Arithmetic on empty value");
  }
  const f = strictFloat(v);
  if (Number.isNaN(f)) throw new Error("Arithmetic on non-numeric value");
  return f;
}

function orderCmp(op: string, a: any, b: any): boolean {
  if (typeof a === "string" && typeof b === "string") {
    // Lexicographic, as in JS — makes ISO date-string rules work
    switch (op) {
      case ">=": return a >= b;
      case "<=": return a <= b;
      case ">": return a > b;
      case "<": return a < b;
    }
  }
  let fa: number, fb: number;
  try {
    fa = strictFloat(a);
    fb = strictFloat(b);
  } catch {
    return false;
  }
  switch (op) {
    case ">=": return fa >= fb;
    case "<=": return fa <= fb;
    case ">": return fa > fb;
    case "<": return fa < fb;
  }
  return false;
}

/** round half away from zero — Python's round() does banker's rounding,
 * JS Math.round rounds half toward +Infinity; both engines implement THIS
 * algorithm explicitly so results match. */
function roundHalfAwayFromZero(x: number, dp: number): number {
  const factor = Math.pow(10, dp);
  const scaled = Math.abs(x) * factor;
  const rounded = Math.floor(scaled + 0.5) / factor;
  return x < 0 ? -rounded : rounded;
}

/** Repeat-aggregate helpers (see spec: repeaters). */
function repeatRows(values: Record<string, any>, repeatId: any): any[] {
  const rows = values[String(repeatId)];
  return Array.isArray(rows) ? rows : [];
}

function sumRows(values: Record<string, any>, repeatId: any, fieldId: any): number {
  let total = 0;
  for (const row of repeatRows(values, repeatId)) {
    const v = row == null ? null : norm(row[String(fieldId)]);
    if (v === null || v === "") continue; // empty counts as 0
    total += arithFloat(v);
  }
  return total;
}

export interface EvalScope {
  values: Record<string, any>;
  env?: Record<string, any>;
}

function evalNode(node: Node, scope: EvalScope): any {
  switch (node[0]) {
    case "literal":
      return node[1];

    case "array":
      return node[1].map((el) => evalNode(el, scope));

    case "call": {
      const [, name, argNodes] = node;
      const args = argNodes.map((a) => evalNode(a, scope));
      if (name === "value") return norm(scope.values[args[0]]);
      if (name === "env") return norm(scope.env?.[args[0]]);
      if (name === "isEmpty") return isEmptyValue(args[0]);
      if (name === "round") {
        const dp = args.length > 1 ? Math.trunc(arithFloat(args[1])) : 0;
        return roundHalfAwayFromZero(arithFloat(args[0]), dp);
      }
      if (name === "min" || name === "max") {
        if (args.length === 0) throw new Error(`${name}() needs at least one argument`);
        const nums = args.map(arithFloat);
        return name === "min" ? Math.min(...nums) : Math.max(...nums);
      }
      if (name === "count") return repeatRows(scope.values, args[0]).length;
      if (name === "sum") return sumRows(scope.values, args[0], args[1]);
      if (name === "total_pct") {
        return Math.abs(sumRows(scope.values, args[0], args[1]) - 100) < 1e-9;
      }
      const custom = FUNCTION_REGISTRY.get(name);
      if (custom) return norm(custom(...args));
      throw new Error(`Unknown function: ${name}`);
    }

    case "ident":
      // Bare identifier — field lookup, same as the injected-locals behavior
      return norm(scope.values[node[1]]);

    case "member": {
      const [, objNode, member] = node;
      const obj = evalNode(objNode, scope);
      if (member === "length") {
        if (obj === null) return 0;
        if (typeof obj === "string" || Array.isArray(obj)) return obj.length;
        return 0;
      }
      throw new Error(`Unknown member: .${member}`);
    }

    case "method_call": {
      const [, objNode, method, argNodes] = node;
      const obj = evalNode(objNode, scope);
      const args = argNodes.map((a) => evalNode(a, scope));
      if (method === "test") {
        if (obj === null) return false;
        const target = args.length > 0 ? args[0] : "";
        if (target === null) return false;
        try {
          return new RegExp(String(obj)).test(String(target));
        } catch {
          return false;
        }
      }
      if (method === "includes") {
        if (obj === null) return false;
        const search = args.length > 0 ? args[0] : null;
        if (typeof obj === "string") return search !== null && obj.includes(String(search));
        if (Array.isArray(obj)) return obj.some((el) => strictEq(norm(el), norm(search)));
        return false;
      }
      throw new Error(`Unknown method: .${method}()`);
    }

    case "not":
      return !toBool(evalNode(node[1], scope));

    case "neg":
      return -arithFloat(evalNode(node[1], scope));

    case "and": {
      const left = evalNode(node[1], scope);
      if (!toBool(left)) return left; // short-circuit: return the falsy value
      return evalNode(node[2], scope);
    }

    case "or": {
      const left = evalNode(node[1], scope);
      if (toBool(left)) return left; // short-circuit: return the truthy value
      return evalNode(node[2], scope);
    }

    case "cmp": {
      const [, op, leftNode, rightNode] = node;
      const left = evalNode(leftNode, scope);
      const right = evalNode(rightNode, scope);
      if (op === "===") return strictEq(left, right);
      if (op === "!==") return !strictEq(left, right);
      return orderCmp(op, left, right);
    }

    case "arith": {
      const [, op, leftNode, rightNode] = node;
      const a = arithFloat(evalNode(leftNode, scope));
      const b = arithFloat(evalNode(rightNode, scope));
      switch (op) {
        case "+": return a + b;
        case "-": return a - b;
        case "*": return a * b;
        case "/":
          if (b === 0) throw new Error("Division by zero");
          return a / b;
      }
      throw new Error(`Unknown operator: ${op}`);
    }
  }
}

/**
 * Evaluate a ProtoForm expression string safely. Returns a boolean.
 * Any parse or evaluation error yields false (fail closed).
 */
export function safeEvaluate(source: string, scope: EvalScope): boolean {
  try {
    const ast = parseExpression(source);
    return toBool(evalNode(ast, scope));
  } catch {
    return false;
  }
}

/**
 * Evaluate an expression for its raw value (used by computed fields).
 * Any error, NaN, or Infinity yields null (fail closed).
 */
export function safeEvaluateValue(source: string, scope: EvalScope): any {
  try {
    const ast = parseExpression(source);
    const result = norm(evalNode(ast, scope));
    if (typeof result === "number" && !Number.isFinite(result)) return null;
    return result;
  } catch {
    return null;
  }
}

/**
 * Canonical value-to-string used for message interpolation. Numbers with
 * no fractional part render without a decimal point so both engines
 * produce identical text (Python floats would otherwise print "2.0").
 */
export function formatValue(v: any): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") {
    return Number.isInteger(v) ? String(Math.trunc(v)) : String(v);
  }
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "string") return v;
  return JSON.stringify(v);
}
