import "./index.css";
import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { JobApplicationApp } from "./demos/job-application";

function Root() {
  const [route, setRoute] = React.useState(() => window.location.hash === "#job-application" ? "job-application" : "playground");

  React.useEffect(() => {
    const onHash = () => setRoute(window.location.hash === "#job-application" ? "job-application" : "playground");
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  if (route === "job-application") {
    return <JobApplicationApp onExit={() => { window.location.hash = ""; setRoute("playground"); }} />;
  }

  return (
    <div>
      <App />
      <div style={{ textAlign: "center", padding: "24px 0 48px", borderTop: "1px solid var(--pf-border)", margin: "32px 24px 0" }}>
        <button
          onClick={() => { window.location.hash = "job-application"; setRoute("job-application"); }}
          style={{
            padding: "10px 24px", fontSize: "14px", fontWeight: 600, borderRadius: "8px",
            background: "linear-gradient(135deg, #6366f1, #4f46e5)", color: "#fff",
            border: "none", cursor: "pointer",
          }}
        >
          Launch Job Application Demo
        </button>
        <p style={{ fontSize: "12px", color: "var(--pf-text-muted)", marginTop: "8px" }}>
          Full-screen demo replicating a real multi-step job application flow
        </p>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
