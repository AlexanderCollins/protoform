import { JsonView, darkStyles } from "react-json-view-lite";
import "react-json-view-lite/dist/index.css";

interface SchemaEditorProps {
  schema: object | null;
  error: string | null;
}

const shouldExpandNode = (level: number) => level < 3;

const customStyles = {
  ...darkStyles,
  container: darkStyles.container + " pf-json-viewer",
};

export function SchemaEditor({ schema, error }: SchemaEditorProps) {
  return (
    <div>
      {error && (
        <div style={{
          padding: "8px 12px", background: "#fef2f2", color: "#dc2626",
          fontSize: "12px", borderRadius: "4px", marginBottom: "8px",
          border: "1px solid #fecaca",
        }}>
          {error}
        </div>
      )}
      <div style={{
        background: "#1e1e2e",
        borderRadius: "6px",
        padding: "16px",
        maxHeight: "800px",
        overflow: "auto",
        fontFamily: "'SF Mono', 'Fira Code', 'Fira Mono', Menlo, Consolas, monospace",
        fontSize: "12.5px",
        lineHeight: "1.6",
      }}>
        {schema ? (
          <JsonView
            data={schema}
            shouldExpandNode={shouldExpandNode}
            clickToExpandNode
            style={customStyles}
          />
        ) : (
          <span style={{ color: "#94a3b8" }}>
            Fix the JSON error above to see the schema.
          </span>
        )}
      </div>
    </div>
  );
}
