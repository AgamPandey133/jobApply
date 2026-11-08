"use client";

import { useState, useEffect, useCallback } from "react";
import { Save, AlertTriangle, Zap, Shield } from "lucide-react";

interface Settings {
  global_paused: boolean;
  default_apply_mode: string;
  embedding_weight: number;
  llm_judge_weight: number;
  min_match_score: number;
  pause_on_unanswerable: boolean;
  company_cooldown_days: number;
  alert_on_all_new_jobs: boolean;
}

interface FilterConfig {
  includeTitleKeywords: string;
  excludeTitleKeywords: string;
  allowedLocations: string;
  allowRemote: boolean;
  allowOnsite: boolean;
  allowHybrid: boolean;
  experienceLevels: string[];
  graduationBatch: string;
}

const EXP_LEVELS = ["intern", "new_grad", "junior", "mid", "senior"];

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>({
    global_paused: false,
    default_apply_mode: "REVIEW",
    embedding_weight: 0.4,
    llm_judge_weight: 0.6,
    min_match_score: 70,
    pause_on_unanswerable: false,
    company_cooldown_days: 0,
    alert_on_all_new_jobs: true,
  });

  const [filter, setFilter] = useState<FilterConfig>({
    includeTitleKeywords: "",
    excludeTitleKeywords: "",
    allowedLocations: "",
    allowRemote: true,
    allowOnsite: true,
    allowHybrid: true,
    experienceLevels: ["intern", "new_grad", "junior"],
    graduationBatch: "",
  });

  const [telegramToken, setTelegramToken] = useState("");
  const [telegramChatId, setTelegramChatId] = useState("");
  const [geminiKey, setGeminiKey] = useState("••••••••••••••••");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const fetchSettings = useCallback(async () => {
    try {
      const [settingsRes, filterRes] = await Promise.all([
        fetch("/api/settings"),
        fetch("/api/filters"),
      ]);
      const settingsData = await settingsRes.json();
      if (settingsRes.ok) setSettings({ ...settings, ...settingsData });
      if (filterRes.ok) {
        const filterData = await filterRes.json();
        if (filterData) {
          setFilter({
            includeTitleKeywords: (filterData.includeTitleKeywords ?? []).join(", "),
            excludeTitleKeywords: (filterData.excludeTitleKeywords ?? []).join(", "),
            allowedLocations: (filterData.allowedLocations ?? []).join(", "),
            allowRemote: filterData.allowRemote ?? true,
            allowOnsite: filterData.allowOnsite ?? true,
            allowHybrid: filterData.allowHybrid ?? true,
            experienceLevels: filterData.experienceLevels ?? [],
            graduationBatch: filterData.graduationBatch ?? "",
          });
        }
      }
    } catch {/* ignore */}
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const saveAll = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      // Save global settings
      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });

      // Save filter config
      await fetch("/api/filters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          includeTitleKeywords: filter.includeTitleKeywords.split(",").map((s) => s.trim()).filter(Boolean),
          excludeTitleKeywords: filter.excludeTitleKeywords.split(",").map((s) => s.trim()).filter(Boolean),
          allowedLocations: filter.allowedLocations.split(",").map((s) => s.trim()).filter(Boolean),
          allowRemote: filter.allowRemote,
          allowOnsite: filter.allowOnsite,
          allowHybrid: filter.allowHybrid,
          experienceLevels: filter.experienceLevels,
          graduationBatch: filter.graduationBatch,
        }),
      });

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const totalWeight = settings.embedding_weight + settings.llm_judge_weight;
  const weightsValid = Math.abs(totalWeight - 1.0) < 0.01;

  const ROLE_QUICK_CHIPS = [
    { label: "🤖 Android", kw: "android" },
    { label: "🧠 AI / ML", kw: "ai, machine learning, ml" },
    { label: "⚡ SDE / SWE", kw: "sde, software engineer, swe" },
    { label: "🌐 Fullstack", kw: "fullstack, full-stack" },
    { label: "⚙️ Backend", kw: "backend" },
    { label: "🎨 Frontend", kw: "frontend" },
    { label: "☁️ DevOps", kw: "devops, cloud" },
  ];

  const NOISE_EXCLUSIONS = [
    { label: "Sales", kw: "sales" },
    { label: "Marketing", kw: "marketing" },
    { label: "Recruiter", kw: "recruiter" },
    { label: "Account Exec", kw: "account executive" },
    { label: "Legal", kw: "legal" },
    { label: "HR", kw: "hr" },
    { label: "Operations", kw: "operations" },
    { label: "Finance", kw: "finance" },
  ];

  const EXP_PRESETS = [
    { id: "intern", label: "🎓 Intern" },
    { id: "freshers", label: "🌱 Freshers / New Grad" },
    { id: "1-2_years", label: "⏱️ 1-2 YOE" },
    { id: "junior", label: "👶 Junior" },
    { id: "mid", label: "🔥 Mid (2-5 YOE)" },
    { id: "senior", label: "⭐ Senior (5+ YOE)" },
  ];

  const toggleIncludeKeyword = (kw: string) => {
    const parts = kw.split(",").map((s) => s.trim().toLowerCase());
    const existing = filter.includeTitleKeywords
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    const hasAll = parts.every((p) => existing.includes(p));
    let next: string[];
    if (hasAll) {
      next = existing.filter((e) => !parts.includes(e));
    } else {
      next = Array.from(new Set([...existing, ...parts]));
    }
    setFilter({ ...filter, includeTitleKeywords: next.join(", ") });
  };

  const toggleExcludeKeyword = (kw: string) => {
    const existing = filter.excludeTitleKeywords
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    const next = existing.includes(kw.toLowerCase())
      ? existing.filter((e) => e !== kw.toLowerCase())
      : [...existing, kw.toLowerCase()];
    setFilter({ ...filter, excludeTitleKeywords: next.join(", ") });
  };

  const toggleExpLevel = (level: string) => {
    setFilter((f) => ({
      ...f,
      experienceLevels: f.experienceLevels.includes(level)
        ? f.experienceLevels.filter((l) => l !== level)
        : [...f.experienceLevels, level],
    }));
  };

  const applyPresetCombo = () => {
    setFilter({
      ...filter,
      includeTitleKeywords: "android, ai, machine learning, ml, sde, software engineer, fullstack, backend, frontend",
      excludeTitleKeywords: "sales, marketing, recruiter, account executive, legal, hr, operations, finance",
      experienceLevels: ["intern", "freshers", "1-2_years", "junior"],
    });
  };

  return (
    <div style={{ maxWidth: 850 }}>
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem" }}>Settings</h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>
          Configure polling, multi-resume matching, filtering, and notification channels.
        </p>
      </div>

      <form onSubmit={saveAll}>
        {/* Apply Mode */}
        <div className="card" style={{ marginBottom: "1rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
            <Zap size={16} style={{ color: "var(--accent)" }} />
            <h2 style={{ fontSize: "0.9375rem", fontWeight: 600 }}>Apply & Alert Mode</h2>
          </div>
          <div className="form-group" style={{ marginBottom: "0.875rem" }}>
            <label className="label" htmlFor="default-mode">Global Default Mode</label>
            <select
              id="default-mode"
              className="input"
              value={settings.default_apply_mode}
              onChange={(e) => setSettings({ ...settings, default_apply_mode: e.target.value })}
            >
              <option value="FULL_AUTO">Full Auto — Submit automatically, notify after submission</option>
              <option value="REVIEW">Review Mode — Fill form, notify me, I review and approve</option>
              <option value="MANUAL">Alert Only — Notify me of new jobs, I apply manually</option>
            </select>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.375rem" }}>
              Can be overridden per company in the Companies tab.
            </div>
          </div>

          {/* Instant alert toggle */}
          <label className="toggle-wrap" style={{ marginBottom: "0.875rem" }}>
            <div
              className={`toggle ${settings.alert_on_all_new_jobs ? "on green" : ""}`}
              onClick={() => setSettings({ ...settings, alert_on_all_new_jobs: !settings.alert_on_all_new_jobs })}
            />
            <div>
              <span style={{ fontSize: "0.875rem", color: "var(--text-secondary)", fontWeight: 500 }}>
                Instant Alert for All Newly Opened Jobs
              </span>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                Send Telegram & in-app notification immediately when any job is posted on monitored companies/boards.
              </div>
            </div>
          </label>

          <label className="toggle-wrap">
            <div
              className={`toggle ${settings.pause_on_unanswerable ? "on" : ""}`}
              onClick={() => setSettings({ ...settings, pause_on_unanswerable: !settings.pause_on_unanswerable })}
            />
            <div>
              <span style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>Pause on unanswerable required questions</span>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                In Full Auto mode, pause and notify me if a required question can't be answered from profile/Q&A bank.
              </div>
            </div>
          </label>
        </div>

        {/* Matching Weights */}
        <div className="card" style={{ marginBottom: "1rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
            <Zap size={16} style={{ color: "var(--purple)" }} />
            <h2 style={{ fontSize: "0.9375rem", fontWeight: 600 }}>Multi-Resume Matching Configuration</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.875rem", marginBottom: "0.875rem" }}>
            <div className="form-group">
              <label className="label" htmlFor="emb-weight">Embedding Weight (0–1)</label>
              <input
                id="emb-weight"
                type="number"
                step="0.05"
                min="0" max="1"
                className="input"
                value={settings.embedding_weight}
                onChange={(e) => setSettings({ ...settings, embedding_weight: parseFloat(e.target.value) })}
              />
            </div>
            <div className="form-group">
              <label className="label" htmlFor="llm-weight">LLM Specialization Weight (0–1)</label>
              <input
                id="llm-weight"
                type="number"
                step="0.05"
                min="0" max="1"
                className="input"
                value={settings.llm_judge_weight}
                onChange={(e) => setSettings({ ...settings, llm_judge_weight: parseFloat(e.target.value) })}
              />
            </div>
            <div className="form-group">
              <label className="label" htmlFor="min-score">Min Match Score (%)</label>
              <input
                id="min-score"
                type="number"
                min="0" max="100"
                className="input"
                value={settings.min_match_score}
                onChange={(e) => setSettings({ ...settings, min_match_score: parseInt(e.target.value) })}
              />
            </div>
          </div>
          {!weightsValid && (
            <div style={{ padding: "0.625rem 0.875rem", background: "var(--yellow-subtle)", borderRadius: "var(--radius-sm)", fontSize: "0.8125rem", color: "var(--yellow)", display: "flex", gap: "0.5rem" }}>
              <AlertTriangle size={14} />
              Weights should sum to 1.0 (currently {totalWeight.toFixed(2)})
            </div>
          )}
        </div>

        {/* Job Filters */}
        <div className="card" style={{ marginBottom: "1rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Shield size={16} style={{ color: "var(--green)" }} />
              <h2 style={{ fontSize: "0.9375rem", fontWeight: 600 }}>Automated Job Filters & Combinations</h2>
            </div>
            <button
              type="button"
              onClick={applyPresetCombo}
              className="btn btn-secondary btn-sm"
              style={{ fontSize: "0.75rem" }}
            >
              ⚡ Apply Recommended Tech Preset
            </button>
          </div>

          {/* Quick Role Inclusion Chips */}
          <div style={{ marginBottom: "1rem" }}>
            <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.375rem" }}>
              🎯 Target Roles Quick-Toggle (Click to add/remove from Title Keywords):
            </div>
            <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
              {ROLE_QUICK_CHIPS.map((chip) => {
                const parts = chip.kw.split(",").map((s) => s.trim().toLowerCase());
                const existing = filter.includeTitleKeywords
                  .split(",")
                  .map((s) => s.trim().toLowerCase())
                  .filter(Boolean);
                const isActive = parts.every((p) => existing.includes(p));

                return (
                  <button
                    key={chip.label}
                    type="button"
                    onClick={() => toggleIncludeKeyword(chip.kw)}
                    className={`badge ${isActive ? "badge-accent" : "badge-gray"}`}
                    style={{
                      cursor: "pointer",
                      border: "none",
                      padding: "0.35rem 0.65rem",
                      fontSize: "0.75rem",
                      fontWeight: isActive ? 600 : 500,
                    }}
                  >
                    {chip.label} {isActive ? "✓" : "+"}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.875rem", marginBottom: "0.875rem" }}>
            <div className="form-group">
              <label className="label" htmlFor="include-keywords">Include Title Keywords (comma-separated)</label>
              <input
                id="include-keywords"
                className="input"
                placeholder="android, ai, ml, sde, software engineer, fullstack"
                value={filter.includeTitleKeywords}
                onChange={(e) => setFilter({ ...filter, includeTitleKeywords: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="label" htmlFor="exclude-keywords">Exclude Title Keywords (comma-separated)</label>
              <input
                id="exclude-keywords"
                className="input"
                placeholder="sales, marketing, recruiter, legal"
                value={filter.excludeTitleKeywords}
                onChange={(e) => setFilter({ ...filter, excludeTitleKeywords: e.target.value })}
              />
            </div>
          </div>

          {/* Quick Noise Exclusions */}
          <div style={{ marginBottom: "1rem" }}>
            <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.375rem" }}>
              🚫 Fast Noise Filters (Click to exclude unwanted non-tech roles):
            </div>
            <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
              {NOISE_EXCLUSIONS.map((chip) => {
                const existing = filter.excludeTitleKeywords
                  .split(",")
                  .map((s) => s.trim().toLowerCase())
                  .filter(Boolean);
                const isExcluded = existing.includes(chip.kw.toLowerCase());

                return (
                  <button
                    key={chip.label}
                    type="button"
                    onClick={() => toggleExcludeKeyword(chip.kw)}
                    className={`badge ${isExcluded ? "badge-red" : "badge-gray"}`}
                    style={{
                      cursor: "pointer",
                      border: "none",
                      padding: "0.35rem 0.65rem",
                      fontSize: "0.75rem",
                      fontWeight: isExcluded ? 600 : 500,
                    }}
                  >
                    {isExcluded ? "✕ " : "+ "} {chip.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.875rem", marginBottom: "0.875rem" }}>
            <div className="form-group">
              <label className="label" htmlFor="allowed-locations">Allowed Locations (empty = any)</label>
              <input
                id="allowed-locations"
                className="input"
                placeholder="India, Bangalore, Remote, San Francisco, Seattle"
                value={filter.allowedLocations}
                onChange={(e) => setFilter({ ...filter, allowedLocations: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="label" htmlFor="graduation-batch-filter">Graduation Batch Filter</label>
              <input
                id="graduation-batch-filter"
                className="input"
                placeholder="2024, 2025, 2026"
                value={filter.graduationBatch}
                onChange={(e) => setFilter({ ...filter, graduationBatch: e.target.value })}
              />
            </div>
          </div>

          {/* Remote/Onsite toggles */}
          <div style={{ display: "flex", gap: "1.5rem", marginBottom: "1rem" }}>
            {(["allowRemote", "allowOnsite", "allowHybrid"] as const).map((key) => (
              <label key={key} className="toggle-wrap">
                <div
                  className={`toggle ${filter[key] ? "on green" : ""}`}
                  onClick={() => setFilter({ ...filter, [key]: !filter[key] })}
                />
                <span style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>
                  {key === "allowRemote" ? "Remote" : key === "allowOnsite" ? "On-site" : "Hybrid"}
                </span>
              </label>
            ))}
          </div>

          {/* Experience levels */}
          <div>
            <div className="label" style={{ marginBottom: "0.5rem" }}>
              Experience Levels (Select any combination, empty = all):
            </div>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              {EXP_PRESETS.map((level) => {
                const isSelected = filter.experienceLevels.includes(level.id);
                return (
                  <button
                    key={level.id}
                    type="button"
                    id={`exp-${level.id}`}
                    onClick={() => toggleExpLevel(level.id)}
                    className={`badge ${isSelected ? "badge-yellow" : "badge-gray"}`}
                    style={{
                      cursor: "pointer",
                      border: "none",
                      padding: "0.35rem 0.75rem",
                      fontSize: "0.75rem",
                      fontWeight: isSelected ? 600 : 500,
                    }}
                  >
                    {level.label} {isSelected ? "✓" : ""}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Notification Channels */}
        <div className="card" style={{ marginBottom: "1rem" }}>
          <h2 style={{ fontSize: "0.9375rem", fontWeight: 600, marginBottom: "1rem" }}>Notification Channels</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.875rem" }}>
            <div className="form-group">
              <label className="label" htmlFor="tg-token">Telegram Bot Token</label>
              <input
                id="tg-token"
                className="input"
                placeholder="Set in .env: TELEGRAM_BOT_TOKEN"
                value={telegramToken}
                onChange={(e) => setTelegramToken(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="label" htmlFor="tg-chat">Telegram Chat ID</label>
              <input
                id="tg-chat"
                className="input"
                placeholder="Set in .env: TELEGRAM_CHAT_ID"
                value={telegramChatId}
                onChange={(e) => setTelegramChatId(e.target.value)}
              />
            </div>
          </div>
          <div style={{ marginTop: "0.5rem", fontSize: "0.75rem", color: "var(--text-muted)" }}>
            💡 Telegram credentials are read from environment variables (.env file). The fields above are for display only.
          </div>
        </div>

        {/* Duplicate Protection */}
        <div className="card" style={{ marginBottom: "1.5rem" }}>
          <h2 style={{ fontSize: "0.9375rem", fontWeight: 600, marginBottom: "1rem" }}>Duplicate Protection</h2>
          <div className="form-group">
            <label className="label" htmlFor="cooldown-days">Same-Company Application Cooldown (days)</label>
            <input
              id="cooldown-days"
              type="number"
              min="0"
              className="input"
              style={{ width: "auto", maxWidth: 120 }}
              value={settings.company_cooldown_days}
              onChange={(e) => setSettings({ ...settings, company_cooldown_days: parseInt(e.target.value) })}
            />
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.375rem" }}>
              0 = disabled. Set to e.g. 30 to prevent applying to the same company within 30 days.
            </div>
          </div>
        </div>

        <button id="save-settings-btn" type="submit" className="btn btn-primary btn-lg" disabled={saving || !weightsValid}>
          <Save size={16} />
          {saved ? "✓ Settings Saved!" : saving ? "Saving…" : "Save All Settings"}
        </button>
      </form>
    </div>
  );
}
