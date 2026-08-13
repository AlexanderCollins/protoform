import { useState } from "react";
import { highlightJs } from "../lib/highlight";

interface CodeViewerProps {
  code: string;
}

export function CodeViewer({ code }: CodeViewerProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={handleCopy}
        style={{
          position: "absolute", top: "8px", right: "8px", zIndex: 1,
          padding: "4px 10px", fontSize: "11px", fontWeight: 500,
          border: "1px solid #4a5568", borderRadius: "4px",
          background: copied ? "#22c55e" : "#2d3748", color: "white",
          cursor: "pointer", transition: "background 150ms",
        }}
      >
        {copied ? "Copied!" : "Copy"}
      </button>
      <pre
        dangerouslySetInnerHTML={{ __html: highlightJs(code) }}
        style={{
          margin: 0,
          padding: "16px",
          background: "#1e1e2e",
          color: "#cdd6f4",
          borderRadius: "6px",
          fontSize: "12.5px",
          lineHeight: "1.6",
          fontFamily: "'SF Mono', 'Fira Code', 'Fira Mono', Menlo, Consolas, monospace",
          overflow: "auto",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          minHeight: "800px",
          maxHeight: "800px",
        }}
      />
    </div>
  );
}
