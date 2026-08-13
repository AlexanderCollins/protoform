import { useRef, useCallback } from "react";

const FONT = "'SF Mono', 'Fira Code', 'Fira Mono', Menlo, Consolas, monospace";
const FONT_SIZE = "12.5px";
const LINE_HEIGHT = "1.6";
const PADDING = "16px";

interface SyntaxEditorProps {
  value: string;
  onChange: (value: string) => void;
  highlight: (text: string) => string;
  height?: number;
}

export function SyntaxEditor({ value, onChange, highlight, height = 800 }: SyntaxEditorProps) {
  const preRef = useRef<HTMLPreElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleScroll = useCallback(() => {
    if (textareaRef.current && preRef.current) {
      preRef.current.scrollTop = textareaRef.current.scrollTop;
      preRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  }, []);

  const highlighted = highlight(value) + "\n";

  return (
    <div style={{ position: "relative", width: "100%", height: `${height}px`, borderRadius: "6px", overflow: "hidden" }}>
      {/* Highlighted layer (behind) */}
      <pre
        ref={preRef}
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: highlighted }}
        style={{
          position: "absolute",
          top: 0, left: 0, right: 0, bottom: 0,
          margin: 0,
          padding: PADDING,
          fontFamily: FONT,
          fontSize: FONT_SIZE,
          lineHeight: LINE_HEIGHT,
          color: "#cdd6f4",
          background: "#1e1e2e",
          border: "none",
          overflow: "auto",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          pointerEvents: "none",
          tabSize: 2,
        }}
      />

      {/* Editable textarea (on top, transparent text) */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={handleScroll}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        style={{
          position: "absolute",
          top: 0, left: 0, right: 0, bottom: 0,
          width: "100%",
          height: "100%",
          margin: 0,
          padding: PADDING,
          fontFamily: FONT,
          fontSize: FONT_SIZE,
          lineHeight: LINE_HEIGHT,
          color: "transparent",
          caretColor: "#f5f5f5",
          background: "transparent",
          border: "none",
          outline: "none",
          resize: "none",
          overflow: "auto",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          tabSize: 2,
          zIndex: 1,
        }}
      />
    </div>
  );
}
