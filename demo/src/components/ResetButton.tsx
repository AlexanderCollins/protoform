import { useState, useEffect, useRef } from "react";

interface ResetButtonProps {
  onReset: () => void;
}

export function ResetButton({ onReset }: ResetButtonProps) {
  const [confirming, setConfirming] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  const handleClick = () => {
    if (confirming) {
      if (timerRef.current) clearTimeout(timerRef.current);
      setConfirming(false);
      onReset();
    } else {
      setConfirming(true);
      timerRef.current = setTimeout(() => setConfirming(false), 3000);
    }
  };

  return (
    <button
      onClick={handleClick}
      style={{
        padding: "6px 16px",
        borderRadius: "6px",
        border: confirming ? "1px solid #dc2626" : "1px solid var(--pf-btn-border)",
        background: confirming ? "#dc2626" : "var(--pf-btn-bg)",
        color: confirming ? "white" : "var(--pf-btn-text)",
        fontSize: "13px",
        fontWeight: 500,
        cursor: "pointer",
        transition: "all 150ms",
      }}
    >
      {confirming ? "Confirm Reset" : "Reset"}
    </button>
  );
}
