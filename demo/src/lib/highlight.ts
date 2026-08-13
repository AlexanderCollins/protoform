// Escape HTML entities
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function span(cls: string, text: string): string {
  return `<span class="hl-${cls}">${text}</span>`;
}

// --- JSON syntax highlighting ---
export function highlightJson(text: string): string {
  return text.replace(
    /("(?:[^"\\]|\\.)*")\s*(:)|("(?:[^"\\]|\\.)*")|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
    (match, key, colon, str, bool, num) => {
      if (key) return span("key", esc(key)) + esc(colon);
      if (str) return span("string", esc(str));
      if (bool) return span("bool", esc(bool));
      if (num) return span("number", esc(num));
      return esc(match);
    },
  );
}

// --- JS/JSX syntax highlighting ---
const JS_KEYWORDS =
  /\b(import|export|from|const|let|var|function|return|if|else|switch|case|break|default|new|typeof|instanceof|void|delete|throw|try|catch|finally|class|extends|super|this|yield|await|async|of|in|for|while|do)\b/g;
const JS_STRING = /(["'`])(?:(?!\1)[^\\]|\\.)*?\1/g;
const JS_COMMENT_LINE = /(\/\/.*$)/gm;
const JS_COMMENT_BLOCK = /(\/\*[\s\S]*?\*\/)/g;
const JS_NUMBER = /\b(\d+(?:\.\d+)?)\b/g;
const JS_JSX_TAG = /(<\/?[A-Z]\w*|<\/?[a-z][\w.-]*)/g;
const JS_ATTR = /\b([a-zA-Z_][\w]*)(?==)/g;

export function highlightJs(text: string): string {
  // Tokenize to preserve order and avoid double-highlighting
  type Token = { start: number; end: number; cls: string };
  const tokens: Token[] = [];

  function collect(re: RegExp, cls: string, group = 0) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const idx = group > 0 ? text.indexOf(m[group], m.index) : m.index;
      tokens.push({ start: idx, end: idx + m[group].length, cls });
    }
  }

  // Order matters — comments and strings first to mask interior matches
  collect(JS_COMMENT_BLOCK, "comment", 1);
  collect(JS_COMMENT_LINE, "comment", 1);
  collect(JS_STRING, "string", 0);
  collect(JS_KEYWORDS, "keyword", 1);
  collect(JS_NUMBER, "number", 1);
  collect(JS_JSX_TAG, "tag", 1);
  collect(JS_ATTR, "attr", 1);

  // Sort by start position, remove overlaps
  tokens.sort((a, b) => a.start - b.start);
  const filtered: Token[] = [];
  let lastEnd = 0;
  for (const t of tokens) {
    if (t.start >= lastEnd) {
      filtered.push(t);
      lastEnd = t.end;
    }
  }

  // Build highlighted string
  let result = "";
  let pos = 0;
  for (const t of filtered) {
    if (t.start > pos) result += esc(text.slice(pos, t.start));
    result += span(t.cls, esc(text.slice(t.start, t.end)));
    pos = t.end;
  }
  if (pos < text.length) result += esc(text.slice(pos));
  return result;
}
