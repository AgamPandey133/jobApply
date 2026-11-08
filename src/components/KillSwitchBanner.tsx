"use client";

import { useState, useEffect } from "react";
import { PauseCircle, PlayCircle, AlertTriangle } from "lucide-react";

export default function KillSwitchBanner() {
  const [paused, setPaused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => setPaused(Boolean(data.global_paused)))
      .catch(() => {});
  }, []);

  const toggle = async () => {
    setLoading(true);
    try {
      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ global_paused: !paused }),
      });
      setPaused(!paused);
    } finally {
      setLoading(false);
    }
  };

  if (!mounted) return null;

  if (!paused) {
    // Show a subtle "pause" button in the header area
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "flex-end",
        padding: "0.375rem 1.5rem",
        borderBottom: "1px solid var(--border-subtle)",
        gap: "0.5rem",
        fontSize: "0.75rem",
        color: "var(--text-muted)",
      }}>
        <span style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
          <span className="live-dot" />
          Auto-applying active
        </span>
        <button
          id="global-kill-switch"
          onClick={toggle}
          disabled={loading}
          className="btn btn-ghost btn-sm"
          style={{ fontSize: "0.75rem", padding: "0.2rem 0.5rem", gap: "0.25rem" }}
          aria-label="Pause all applying"
        >
          <PauseCircle size={12} />
          Pause All
        </button>
      </div>
    );
  }

  // Paused state — show prominent banner
  return (
    <div className="kill-switch-banner" id="kill-switch-banner">
      <div className="kill-switch-text">
        <AlertTriangle size={16} style={{ color: "var(--yellow)" }} />
        <strong>All applying is PAUSED.</strong>
        <span>No applications will be submitted until you resume.</span>
      </div>
      <button
        id="global-resume-switch"
        onClick={toggle}
        disabled={loading}
        className="btn btn-sm"
        style={{
          background: "var(--green-subtle)",
          color: "var(--green)",
          border: "1px solid rgba(34,197,94,0.25)",
          gap: "0.375rem",
        }}
      >
        <PlayCircle size={14} />
        {loading ? "Resuming…" : "Resume Applying"}
      </button>
    </div>
  );
}
