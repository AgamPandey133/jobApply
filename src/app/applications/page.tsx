"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  RefreshCw,
  ExternalLink,
  Check,
  CheckCircle2,
  RotateCcw,
  Image as ImageIcon,
  ChevronDown,
  ChevronUp,
  Search,
  Filter,
  X,
  FileText,
} from "lucide-react";

interface ResumeOption {
  id: string;
  name: string;
  label: string;
  targetRoles: string[];
  isDefault: boolean;
}

interface Application {
  id: string;
  status: string;
  mode: string;
  matchScore?: number;
  embeddingScore?: number;
  llmScore?: number;
  matchReason?: string;
  formAnswers?: { question: string; answer: string; source: string }[];
  screenshotPath?: string;
  confirmationText?: string;
  errorMessage?: string;
  retryCount: number;
  submittedAt?: string;
  createdAt: string;
  resumeId?: string;
  job: {
    id: string;
    title: string;
    url: string;
    location?: string;
    isRemote?: boolean;
    company: { name: string; slug?: string };
  };
  resume?: { id: string; label: string; name: string };
}

const statusBadge: Record<string, { cls: string; label: string }> = {
  READY_FOR_REVIEW:    { cls: "badge-yellow", label: "Awaiting Review" },
  SUBMITTING:          { cls: "badge-blue",   label: "Submitting…" },
  SUBMITTED:           { cls: "badge-green",  label: "Submitted" },
  FAILED:              { cls: "badge-red",    label: "Failed" },
  NEEDS_MANUAL_ACTION: { cls: "badge-red",    label: "Manual Action" },
};

const sourceBadge: Record<string, string> = {
  PROFILE: "badge-blue",
  QA_BANK: "badge-accent",
  LLM_GENERATED: "badge-purple",
};

import { parseSalary, matchesSalaryFilter } from "@/lib/salary-parser";

export const ROLE_OPTIONS = [
  { id: "android", label: "🤖 Android", pattern: /android|kotlin|\bmobile\b/i },
  { id: "ai_ml", label: "🧠 AI / ML", pattern: /\bai\b|machine learning|deep learning|data scientist|\bml\b|llm|nlp/i },
  { id: "sde", label: "⚡ SDE / SWE", pattern: /\bsde\b|software engineer|software development engineer|\bswe\b/i },
  { id: "fullstack", label: "🌐 Fullstack", pattern: /full[- ]?stack|fullstack/i },
  { id: "backend", label: "⚙️ Backend", pattern: /backend|back[- ]end|\bgo\b|\bjava\b|\bnode\b/i },
  { id: "frontend", label: "🎨 Frontend", pattern: /frontend|front[- ]end|\breact\b|\bweb\b/i },
  { id: "devops", label: "☁️ DevOps / Cloud", pattern: /devops|cloud|infrastructure|platform|sre/i },
];

export const EXP_OPTIONS = [
  { id: "intern", label: "🎓 Intern", pattern: /intern|internship|co-op|trainee/i },
  { id: "freshers", label: "🌱 Freshers", pattern: /fresher|fresh graduate|new grad|new graduate|entry[- ]level|0[- ]1 year|campus|graduate engineer/i },
  { id: "1-2_years", label: "⏱️ 1-2 YOE", pattern: /\b[12][-– ]year|\b0[-– ]2 year|\b1[-– ]3 year|\b1\+ year|\b2\+ year/i },
  { id: "junior", label: "👶 Junior", pattern: /junior|jr\.|associate/i },
  { id: "mid", label: "🔥 Mid (2-5 YOE)", pattern: /mid[- ]level|\b2[-–]4 years|\b3[-–]5 years/i },
];

export const SALARY_OPTIONS = [
  { id: "all", label: "💰 Any Salary", minAnnualLpa: 0, minMonthlyInr: 0, minAnnualUsd: 0 },
  { id: "lpa_6", label: "₹6+ LPA (Annual)", minAnnualLpa: 6 },
  { id: "lpa_12", label: "₹12+ LPA (Annual)", minAnnualLpa: 12 },
  { id: "lpa_20", label: "₹20+ LPA (Annual)", minAnnualLpa: 20 },
  { id: "mo_50k", label: "₹50k+/mo (Monthly)", minMonthlyInr: 50000 },
  { id: "mo_1l", label: "₹1L+/mo (Monthly)", minMonthlyInr: 100000 },
  { id: "usd_100k", label: "$100k+/yr (Annual)", minAnnualUsd: 100000 },
];

function getDetectedBadges(title: string) {
  const roles = ROLE_OPTIONS.filter((r) => r.pattern.test(title)).map((r) => r.label);
  const exps = EXP_OPTIONS.filter((e) => e.pattern.test(title)).map((e) => e.label);
  const salary = parseSalary(title);
  return { roles, exps, salary };
}

function ApplicationCard({
  app,
  resumes,
  onAction,
  onSwitchResume,
}: {
  app: Application;
  resumes: ResumeOption[];
  onAction: () => void;
  onSwitchResume: (appId: string, resumeId: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [acting, setActing] = useState<"approve" | "retry" | "mark_submitted" | null>(null);
  const [switchingResume, setSwitchingResume] = useState(false);

  const badge = statusBadge[app.status] ?? { cls: "badge-gray", label: app.status };
  const score = app.matchScore;
  const scoreColor =
    score == null
      ? "var(--text-muted)"
      : score >= 80
      ? "var(--green)"
      : score >= 60
      ? "var(--yellow)"
      : "var(--red)";

  const doAction = async (action: "approve" | "retry" | "mark_submitted") => {
    setActing(action);
    try {
      await fetch(`/api/applications/${app.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      onAction();
    } finally {
      setActing(null);
    }
  };

  const handleResumeChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newResumeId = e.target.value;
    if (!newResumeId || newResumeId === app.resume?.id) return;
    setSwitchingResume(true);
    try {
      await onSwitchResume(app.id, newResumeId);
    } finally {
      setSwitchingResume(false);
    }
  };

  const detected = getDetectedBadges(app.job.title);

  return (
    <div className="card" style={{ marginBottom: "0.875rem", border: "1px solid var(--border-subtle)" }}>
      {/* Summary Row */}
      <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.375rem", flexWrap: "wrap" }}>
            <span style={{ fontWeight: 600, fontSize: "0.9375rem", color: "var(--text-primary)" }}>
              {app.job.title}
            </span>
            <span className={`badge ${badge.cls}`}>{badge.label}</span>
            <span className="badge badge-gray" style={{ fontSize: "0.65rem" }}>
              {app.mode}
            </span>

            {/* Detected Role / Experience Badges */}
            {detected.roles.map((r, i) => (
              <span key={i} className="badge badge-purple" style={{ fontSize: "0.65rem" }}>
                {r}
              </span>
            ))}
            {detected.exps.map((e, i) => (
              <span key={i} className="badge badge-yellow" style={{ fontSize: "0.65rem" }}>
                {e}
              </span>
            ))}
            {detected.salary?.displayString ? (
              <span className="badge badge-green" style={{ fontSize: "0.65rem" }}>
                💵 {detected.salary.displayString}
              </span>
            ) : (
              <span className="badge badge-gray" style={{ fontSize: "0.65rem", opacity: 0.7 }}>
                🏷️ Salary Unspecified
              </span>
            )}
          </div>

          <div style={{ display: "flex", gap: "1.25rem", flexWrap: "wrap", alignItems: "center", marginTop: "0.25rem" }}>
            <span style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", fontWeight: 500 }}>
              🏢 {app.job.company.name}
            </span>

            {/* Switchable Resume Dropdown */}
            <div style={{ display: "inline-flex", alignItems: "center", gap: "0.375rem" }}>
              <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>📄 Resume:</span>
              <select
                aria-label="Switch Resume"
                className="input"
                style={{
                  fontSize: "0.75rem",
                  padding: "0.2rem 0.5rem",
                  height: "26px",
                  background: "var(--bg-elevated)",
                  borderColor: "var(--border)",
                  borderRadius: "4px",
                  fontWeight: 600,
                  color: "var(--accent)",
                }}
                value={app.resume?.id ?? app.resumeId ?? ""}
                onChange={handleResumeChange}
                disabled={switchingResume}
              >
                {resumes.length === 0 && (
                  <option value="">{app.resume?.label ?? "Default Resume"}</option>
                )}
                {resumes.map((res) => (
                  <option key={res.id} value={res.id}>
                    {res.label} ({res.name})
                  </option>
                ))}
              </select>
              {switchingResume && (
                <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Updating…</span>
              )}
            </div>

            {score != null && (
              <span style={{ fontSize: "0.8125rem", fontWeight: 700, color: scoreColor }}>
                🎯 {Math.round(score)}% match
              </span>
            )}
            {app.matchReason && (
              <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)", fontStyle: "italic" }}>
                {app.matchReason}
              </span>
            )}
          </div>

          {app.errorMessage && (
            <div
              style={{
                marginTop: "0.5rem",
                padding: "0.5rem 0.75rem",
                background: "var(--red-subtle)",
                borderRadius: "var(--radius-sm)",
                fontSize: "0.8125rem",
                color: "var(--red)",
              }}
            >
              ⚠ {app.errorMessage}
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0, alignItems: "center" }}>
          {app.status === "READY_FOR_REVIEW" && (
            <>
              <button
                id={`approve-${app.id}`}
                className="btn btn-success btn-sm"
                onClick={() => doAction("approve")}
                disabled={acting != null}
              >
                <Check size={13} />
                {acting === "approve" ? "Submitting…" : "Approve & Submit"}
              </button>
              <button
                id={`mark-applied-${app.id}`}
                className="btn btn-ghost btn-sm"
                style={{ color: "var(--green)", border: "1px solid rgba(34, 197, 94, 0.3)" }}
                onClick={() => doAction("mark_submitted")}
                disabled={acting != null}
                title="Mark this job as submitted and move to Applied Jobs"
              >
                <CheckCircle2 size={13} />
                {acting === "mark_submitted" ? "Marking…" : "Mark Applied"}
              </button>
            </>
          )}
          {(app.status === "FAILED" || app.status === "NEEDS_MANUAL_ACTION") && (
            <button
              id={`retry-${app.id}`}
              className="btn btn-ghost btn-sm"
              onClick={() => doAction("retry")}
              disabled={acting != null}
            >
              <RotateCcw size={13} />
              {acting === "retry" ? "Retrying…" : `Retry (${app.retryCount})`}
            </button>
          )}
          <a
            href={app.job.url}
            target="_blank"
            rel="noreferrer"
            className="btn btn-ghost btn-sm"
            style={{ padding: "0.3rem" }}
            title="Open job posting"
          >
            <ExternalLink size={13} />
          </a>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setExpanded(!expanded)}
            style={{ padding: "0.3rem" }}
            title={expanded ? "Collapse details" : "Expand details"}
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {/* Expanded Detail */}
      {expanded && (
        <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid var(--border-subtle)" }}>
          {/* Score breakdown */}
          {(app.embeddingScore != null || app.llmScore != null) && (
            <div style={{ display: "flex", gap: "1.5rem", marginBottom: "1rem" }}>
              {app.embeddingScore != null && (
                <div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>
                    Embedding Score (35%)
                  </div>
                  <div style={{ fontWeight: 600, color: "var(--accent)" }}>
                    {Math.round(app.embeddingScore)}%
                  </div>
                </div>
              )}
              {app.llmScore != null && (
                <div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>
                    LLM Specialization Score (35%)
                  </div>
                  <div style={{ fontWeight: 600, color: "var(--purple)" }}>
                    {Math.round(app.llmScore)}%
                  </div>
                </div>
              )}
              <div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>
                  Selected Resume Track
                </div>
                <div style={{ fontWeight: 600, color: "var(--green)" }}>
                  📄 {app.resume?.label ?? "Default"}
                </div>
              </div>
            </div>
          )}

          {/* Screenshot */}
          {app.screenshotPath && (
            <div style={{ marginBottom: "1rem" }}>
              <div
                style={{
                  fontSize: "0.8125rem",
                  fontWeight: 500,
                  marginBottom: "0.5rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.375rem",
                }}
              >
                <ImageIcon size={13} /> Screenshot
              </div>
              <div
                style={{
                  background: "var(--bg-elevated)",
                  borderRadius: "var(--radius-sm)",
                  padding: "0.5rem",
                  fontSize: "0.75rem",
                  color: "var(--text-muted)",
                  fontFamily: "monospace",
                }}
              >
                {app.screenshotPath}
              </div>
            </div>
          )}

          {/* Confirmation text */}
          {app.confirmationText && (
            <div style={{ marginBottom: "1rem" }}>
              <div style={{ fontSize: "0.8125rem", fontWeight: 500, marginBottom: "0.5rem" }}>Confirmation</div>
              <div
                style={{
                  background: "var(--green-subtle)",
                  border: "1px solid rgba(34,197,94,0.2)",
                  borderRadius: "var(--radius-sm)",
                  padding: "0.75rem",
                  fontSize: "0.8125rem",
                  color: "var(--green)",
                }}
              >
                {app.confirmationText}
              </div>
            </div>
          )}

          {/* Form answers */}
          {app.formAnswers && app.formAnswers.length > 0 && (
            <div>
              <div style={{ fontSize: "0.8125rem", fontWeight: 500, marginBottom: "0.75rem" }}>
                Form Answers ({app.formAnswers.length})
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
                {app.formAnswers.map((qa, i) => (
                  <div
                    key={i}
                    style={{
                      background: "var(--bg-elevated)",
                      borderRadius: "var(--radius-sm)",
                      padding: "0.75rem",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "0.375rem",
                      }}
                    >
                      <div style={{ fontSize: "0.75rem", fontWeight: 500, color: "var(--text-secondary)" }}>
                        {qa.question}
                      </div>
                      <span className={`badge ${sourceBadge[qa.source] ?? "badge-gray"}`} style={{ fontSize: "0.6rem" }}>
                        {qa.source?.replace("_", " ")}
                      </span>
                    </div>
                    <div style={{ fontSize: "0.8125rem", color: "var(--text-primary)", lineHeight: 1.5 }}>
                      {qa.answer}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginTop: "0.75rem", fontSize: "0.75rem", color: "var(--text-muted)" }}>
            Created: {new Date(app.createdAt).toLocaleString()}
            {app.submittedAt && ` · Submitted: ${new Date(app.submittedAt).toLocaleString()}`}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ApplicationsPage() {
  const [apps, setApps] = useState<Application[]>([]);
  const [resumes, setResumes] = useState<ResumeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [selectedExps, setSelectedExps] = useState<string[]>([]);
  const [selectedSalary, setSelectedSalary] = useState<string>("all");

  const fetchApps = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "150" });
      if (statusFilter) params.set("status", statusFilter);

      const [appsRes, resumesRes] = await Promise.all([
        fetch("/api/applications?" + params.toString()),
        fetch("/api/resumes"),
      ]);

      if (appsRes.ok) {
        const data = await appsRes.json();
        setApps(data.applications ?? []);
      }
      if (resumesRes.ok) {
        const resData = await resumesRes.json();
        setResumes(resData ?? []);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchApps();
  }, [fetchApps]);

  const toggleRole = (id: string) => {
    setSelectedRoles((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]
    );
  };

  const toggleExp = (id: string) => {
    setSelectedExps((prev) =>
      prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]
    );
  };

  const clearFilters = () => {
    setSelectedRoles([]);
    setSelectedExps([]);
    setSelectedSalary("all");
    setSearch("");
    setStatusFilter("");
  };

  const handleSwitchResume = async (appId: string, resumeId: string) => {
    const res = await fetch(`/api/applications/${appId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resumeId }),
    });
    if (res.ok) {
      const updated = await res.json();
      setApps((prev) =>
        prev.map((a) => (a.id === appId ? { ...a, resume: updated.resume, resumeId: updated.resumeId } : a))
      );
    }
  };

  // Filter application items by search, role combination, experience, and salary
  const filteredApps = apps.filter((app) => {
    const title = app.job.title.toLowerCase();
    const company = app.job.company.name.toLowerCase();
    const resumeLabel = (app.resume?.label ?? "").toLowerCase();

    // Text search
    if (search) {
      const q = search.toLowerCase();
      if (!title.includes(q) && !company.includes(q) && !resumeLabel.includes(q)) {
        return false;
      }
    }

    // Role check (OR across selected roles)
    if (selectedRoles.length > 0) {
      const matchesAnyRole = selectedRoles.some((roleId) => {
        const rf = ROLE_OPTIONS.find((r) => r.id === roleId);
        return rf ? rf.pattern.test(title) : false;
      });
      if (!matchesAnyRole) return false;
    }

    // Exp check (OR across selected exps)
    if (selectedExps.length > 0) {
      const matchesAnyExp = selectedExps.some((expId) => {
        const ef = EXP_OPTIONS.find((e) => e.id === expId);
        return ef ? ef.pattern.test(title) : false;
      });
      if (!matchesAnyExp) return false;
    }

    // Salary check
    if (selectedSalary !== "all") {
      const salOpt = SALARY_OPTIONS.find((s) => s.id === selectedSalary);
      if (salOpt) {
        const matchesSal = matchesSalaryFilter(
          app.job.title,
          salOpt.minAnnualLpa,
          salOpt.minMonthlyInr,
          salOpt.minAnnualUsd
        );
        if (!matchesSal) return false;
      }
    }

    return true;
  });

  const hasActiveFilters = selectedRoles.length > 0 || selectedExps.length > 0 || selectedSalary !== "all" || search || statusFilter;

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.25rem", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem", color: "var(--text-primary)" }}>
            Job Applications
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>
            Track and manage your automated job applications. Filter by role combinations or switch targeted resumes.
          </p>
        </div>

        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <Link
            href="/applied"
            className="btn btn-secondary btn-sm"
            style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.8125rem" }}
          >
            <CheckCircle2 size={13} style={{ color: "var(--green)" }} />
            View Applied Jobs
          </Link>
          <select
            id="app-status-filter"
            aria-label="Filter by application status"
            className="input"
            style={{ width: "auto" }}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All Statuses</option>
            {Object.entries(statusBadge).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
          <button className="btn btn-ghost btn-sm" onClick={fetchApps} disabled={loading} title="Refresh">
            <RefreshCw size={14} className={loading ? "spin" : ""} />
          </button>
        </div>
      </div>

      {/* Filter Control Box */}
      <div className="card" style={{ marginBottom: "1.5rem", background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
        {/* Search Input */}
        <div style={{ position: "relative", marginBottom: "1rem" }}>
          <Search size={15} style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
          <input
            className="input"
            style={{ paddingLeft: "2.25rem" }}
            placeholder="Search applications by title, company, or resume track (e.g. Android, AI, Frontend)…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              style={{ position: "absolute", right: "0.75rem", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Combination Role Filter Pills */}
        <div style={{ marginBottom: "0.875rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-secondary)" }}>
              🎯 Target Roles (Pick any combination):
            </span>
            {selectedRoles.length > 0 && (
              <span style={{ fontSize: "0.75rem", color: "var(--accent)", fontWeight: 500 }}>
                {selectedRoles.length} selected
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
            {ROLE_OPTIONS.map((r) => {
              const active = selectedRoles.includes(r.id);
              return (
                <button
                  key={r.id}
                  onClick={() => toggleRole(r.id)}
                  className={`btn btn-sm ${active ? "btn-primary" : "btn-ghost"}`}
                  style={{
                    fontSize: "0.75rem",
                    padding: "0.25rem 0.65rem",
                    borderRadius: "999px",
                    fontWeight: active ? 600 : 500,
                  }}
                >
                  {r.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Combination Experience Filter Pills */}
        <div style={{ marginBottom: "0.75rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-secondary)" }}>
              ⏳ Experience Level (Pick any combination):
            </span>
            {selectedExps.length > 0 && (
              <span style={{ fontSize: "0.75rem", color: "var(--yellow)", fontWeight: 500 }}>
                {selectedExps.length} selected
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
            {EXP_OPTIONS.map((e) => {
              const active = selectedExps.includes(e.id);
              return (
                <button
                  key={e.id}
                  onClick={() => toggleExp(e.id)}
                  className={`btn btn-sm ${active ? "btn-secondary" : "btn-ghost"}`}
                  style={{
                    fontSize: "0.75rem",
                    padding: "0.25rem 0.65rem",
                    borderRadius: "999px",
                    fontWeight: active ? 600 : 500,
                  }}
                >
                  {e.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Combination Salary Filter Pills */}
        <div style={{ marginBottom: "0.75rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-secondary)" }}>
              💰 Salary Filter (Monthly & Annual):
            </span>
            {selectedSalary !== "all" && (
              <span style={{ fontSize: "0.75rem", color: "var(--green)", fontWeight: 500 }}>
                Active
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
            {SALARY_OPTIONS.map((s) => {
              const active = selectedSalary === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => setSelectedSalary(s.id)}
                  className={`btn btn-sm ${active ? "btn-primary" : "btn-ghost"}`}
                  style={{
                    fontSize: "0.75rem",
                    padding: "0.25rem 0.65rem",
                    borderRadius: "999px",
                    fontWeight: active ? 600 : 500,
                    background: active ? "var(--green)" : undefined,
                    color: active ? "#000" : undefined,
                  }}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Active Filters Summary Bar */}
        {hasActiveFilters && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              paddingTop: "0.75rem",
              borderTop: "1px solid var(--border-subtle)",
              fontSize: "0.8125rem",
            }}
          >
            <span style={{ color: "var(--text-muted)" }}>
              Showing <strong>{filteredApps.length}</strong> of {apps.length} applications
            </span>
            <button
              onClick={clearFilters}
              className="btn btn-ghost btn-sm"
              style={{ fontSize: "0.75rem", color: "var(--red)" }}
            >
              <X size={12} /> Clear all filters
            </button>
          </div>
        )}
      </div>

      {/* Applications List */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>
          <RefreshCw size={24} className="spin" style={{ display: "inline-block", marginBottom: "0.75rem" }} />
          <div>Loading your job applications…</div>
        </div>
      ) : filteredApps.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>
          {hasActiveFilters ? (
            <div>
              <p style={{ marginBottom: "0.75rem", fontSize: "0.9375rem" }}>
                No applications match your selected combination of filters.
              </p>
              <button onClick={clearFilters} className="btn btn-secondary btn-sm">
                Clear Filters
              </button>
            </div>
          ) : (
            <div>
              <p style={{ marginBottom: "0.5rem", fontSize: "0.9375rem" }}>No applications yet.</p>
              <p style={{ fontSize: "0.8125rem" }}>
                Monitored companies and job boards will automatically discover and queue applications according to your resume preferences.
              </p>
            </div>
          )}
        </div>
      ) : (
        <div>
          {filteredApps.map((app) => (
            <ApplicationCard
              key={app.id}
              app={app}
              resumes={resumes}
              onAction={fetchApps}
              onSwitchResume={handleSwitchResume}
            />
          ))}
        </div>
      )}
    </div>
  );
}
