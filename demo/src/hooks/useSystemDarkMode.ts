import { useState, useEffect } from "react";

export function useSystemDarkMode(): boolean {
  const [dark, setDark] = useState(() => {
    const match = window.matchMedia("(prefers-color-scheme: dark)").matches;
    // Set class immediately on first render
    document.documentElement.classList.toggle("dark", match);
    return match;
  });

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    // Sync class on mount (in case state init didn't run in DOM yet)
    document.documentElement.classList.toggle("dark", mq.matches);

    const handler = (e: MediaQueryListEvent) => {
      setDark(e.matches);
      document.documentElement.classList.toggle("dark", e.matches);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return dark;
}
