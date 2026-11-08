"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  ExternalLink,
  RefreshCw,
  Search,
  Building2,
  Calendar,
  Clock,
  FileText,
  RotateCcw,
  Sparkles,
  Check,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  ArrowRight,
  ShieldCheck,
  Briefcase,
  X,
} from "lucide-react";
import { parseSalary, matchesSalaryFilter } from "@/lib/salary-parser";

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
  job: {
    id: string;
    title: string;
    url: string;
    location?: string;
    isRemote?: boolean;
    atsType?: string;
    company: { id?: string; name: string; atsType?: string; slug?: string };
  };
  resume?: { id: string; label: string; name: string };
}

const ROLE_OPTIONS = [
  { id: "android", label: "🤖 Android", pattern: /android|kotlin|\bmobile\b/i },
  { id: "ai_ml", label: "🧠 AI / ML", pattern: /\bai\b|machine learning|deep learning|data scientist|\bml\b|llm|nlp/i },
  { id: "sde", label: "⚡ SDE / SWE", pattern: /\bsde\b|software engineer|software development engineer|\bswe\b/i },
  { id: "fullstack", label: "🌐 Fullstack", pattern: /full[- ]?stack|fullstack/i },
  { id: "backend", label: "⚙️ Backend", pattern: /backend|back[- ]end|\bgo\b|\bjava\b|\bnode\b/i },
  { id: "frontend", label: "🎨 Frontend", pattern: /frontend|front[- ]end|\breact\b|\bweb\b/i },
  { id: "devops", label: "☁️ DevOps / Cloud", pattern: /devops|cloud|infrastructure|platform|sre/i },
];

const EXP_OPTIONS = [
  { id: "intern", label: "🎓 Intern", pattern: /intern|internship|co-op|trainee/i },
  { id: "freshers", label: "🌱 Freshers", pattern: /fresher|fresh graduate|new grad|new graduate|entry[- ]level|0[- ]1 year|campus|graduate engineer/i },
  { id: "1-2_years", label: "⏱️ 1-2 YOE", pattern: /\b[12][-– ]year|\b0[-– ]2 year|\b1[-– ]3 year|\b1\+ year|\b2\+ year/i },
  { id: "junior", label: "👶 Junior", pattern: /junior|jr\.|associate/i },
  { id: "mid", label: "🔥 Mid (2-5 YOE)", pattern: /mid[- ]level|\b2[-–]4 years|\b3[-–]5 years/i },
];

const SALARY_OPTIONS = [
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

function formatAppliedDate(dateString?: string) {
  if (!dateString) return "Recently applied";
  const date = new Date(dateString);
  const now = new Date();
  const diffHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));

  if (diffHours < 1) {
    const diffMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    return `Applied ${diffMinutes <= 1 ? "just now" : `${diffMinutes} mins ago`}`;
  }
  if (diffHours < 24) {
    return `Applied today at ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  }
  if (diffHours < 48) {
    return `Applied yesterday at ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  }
  return `Applied on ${date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}`;
}

export default function AppliedJobsPage() {
  const [apps, setApps] = useState<Application[]>([]);
  const [reviewCount, setReviewCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [selectedExps, setSelectedExps] = useState<string[]>([]);
  const [selectedSalary, setSelectedSalary] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [revertingId, setRevertingId] = useState<string | null>(null);

  const fetchAppliedJobs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/applications?status=SUBMITTED&limit=200");
      if (res.ok) {
        const data = await res.json();
        setApps(data.applications ?? []);
        if (data.counts?.awaitingReview != null) {
          setReviewCount(data.counts.awaitingReview);
        }
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAppliedJobs();
    const interval = setInterval(fetchAppliedJobs, 10000);
    return () => clearInterval(interval);
  }, [fetchAppliedJobs]);

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
  };

  const handleRevert = async (appId: string) => {
    if (!confirm("Revert this application back to the review queue?")) return;
    setRevertingId(appId);
    try {
      const res = await fetch(`/api/applications/${appId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unmark_submitted" }),
      });
      if (res.ok) {
        setApps((prev) => prev.filter((a) => a.id !== appId));
        setReviewCount((c) => c + 1);
      }
    } finally {
      setRevertingId(null);
    }
  };

  // Filter application items by search, role combination, experience, and salary
  const filteredApps = apps.filter((app) => {
    const title = app.job.title.toLowerCase();
    const company = (app.job.company?.name ?? "").toLowerCase();
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

  // Calculate quick stats
  const totalApplied = apps.length;
  const avgScore = totalApplied > 0
    ? Math.round(apps.reduce((acc, a) => acc + (a.matchScore ?? 0), 0) / totalApplied)
    : 0;

  const hasActiveFilters = selectedRoles.length > 0 || selectedExps.length > 0 || selectedSalary !== "all" || search.length > 0;

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.25rem", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
            <h1 style={{ fontSize: "1.6rem", fontWeight: 700, color: "var(--text-primary)" }}>
              Applied Jobs
            </h1>
            <span className="badge badge-green" style={{ fontSize: "0.75rem", padding: "0.15rem 0.5rem" }}>
              ✓ {totalApplied} Submitted
            </span>
          </div>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>
            All job applications successfully dispatched by JobSniper or verified manually.
          </p>
        </div>

        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          {reviewCount > 0 && (
            <Link
              href="/applications"
              className="btn btn-secondary btn-sm"
              style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.8125rem" }}
            >
              Review Queue
              <span className="badge badge-yellow" style={{ fontSize: "0.65rem", padding: "0.1rem 0.35rem" }}>
                {reviewCount} Pending
              </span>
            </Link>
          )}
          <button
            id="refresh-applied"
            className="btn btn-ghost btn-sm"
            onClick={fetchAppliedJobs}
            disabled={loading}
            title="Refresh applied jobs"
          >
            <RefreshCw size={14} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
            Refresh
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </button>
        </div>
      </div>

      {/* Top Stat Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
        <div className="card" style={{ padding: "1rem", display: "flex", alignItems: "center", gap: "0.875rem" }}>
          <div style={{ width: 42, height: 42, borderRadius: "0.5rem", background: "rgba(34, 197, 94, 0.15)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--green)" }}>
            <CheckCircle2 size={22} />
          </div>
          <div>
            <div style={{ fontSize: "1.35rem", fontWeight: 700, color: "var(--text-primary)" }}>
              {totalApplied}
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Total Jobs Applied</div>
          </div>
        </div>

        <div className="card" style={{ padding: "1rem", display: "flex", alignItems: "center", gap: "0.875rem" }}>
          <div style={{ width: 42, height: 42, borderRadius: "0.5rem", background: "rgba(99, 102, 241, 0.15)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent)" }}>
            <Sparkles size={22} />
          </div>
          <div>
            <div style={{ fontSize: "1.35rem", fontWeight: 700, color: "var(--accent)" }}>
              {avgScore > 0 ? `${avgScore}%` : "–"}
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Average Resume Match</div>
          </div>
        </div>

        <div className="card" style={{ padding: "1rem", display: "flex", alignItems: "center", gap: "0.875rem" }}>
          <div style={{ width: 42, height: 42, borderRadius: "0.5rem", background: "rgba(234, 179, 8, 0.15)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--yellow)" }}>
            <Clock size={22} />
          </div>
          <div>
            <div style={{ fontSize: "1.35rem", fontWeight: 700, color: "var(--yellow)" }}>
              {reviewCount}
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Awaiting Approval in Queue</div>
          </div>
        </div>

        <div className="card" style={{ padding: "1rem", display: "flex", alignItems: "center", gap: "0.875rem" }}>
          <div style={{ width: 42, height: 42, borderRadius: "0.5rem", background: "rgba(168, 85, 247, 0.15)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--purple)" }}>
            <ShieldCheck size={22} />
          </div>
          <div>
            <div style={{ fontSize: "1.35rem", fontWeight: 700, color: "var(--purple)" }}>
              100%
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Automated Submission Rate</div>
          </div>
        </div>
      </div>

      {/* Combination Filters Card */}
      <div className="card" style={{ marginBottom: "1.25rem", padding: "1rem" }}>
        {/* Search Input */}
        <div style={{ position: "relative", marginBottom: "0.875rem" }}>
          <Search size={15} style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
          <input
            id="applied-search"
            className="input"
            placeholder="Search applied jobs by role, company, or target resume…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: "2.25rem", height: "2.3rem", fontSize: "0.875rem" }}
          />
        </div>

        {/* Roles Pills */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
          <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)", minWidth: 80 }}>
            Role Filter:
          </span>
          {ROLE_OPTIONS.map((r) => {
            const active = selectedRoles.includes(r.id);
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => toggleRole(r.id)}
                className="btn btn-sm"
                style={{
                  padding: "0.15rem 0.55rem",
                  fontSize: "0.75rem",
                  borderRadius: "1rem",
                  background: active ? "var(--accent)" : "var(--bg-secondary)",
                  color: active ? "#fff" : "var(--text-secondary)",
                  border: active ? "1px solid var(--accent)" : "1px solid var(--border)",
                  fontWeight: active ? 600 : 400,
                }}
              >
                {active ? "✓ " : ""}{r.label}
              </button>
            );
          })}
        </div>

        {/* Experience Pills */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
          <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)", minWidth: 80 }}>
            Experience:
          </span>
          {EXP_OPTIONS.map((e) => {
            const active = selectedExps.includes(e.id);
            return (
              <button
                key={e.id}
                type="button"
                onClick={() => toggleExp(e.id)}
                className="btn btn-sm"
                style={{
                  padding: "0.15rem 0.55rem",
                  fontSize: "0.75rem",
                  borderRadius: "1rem",
                  background: active ? "var(--purple)" : "var(--bg-secondary)",
                  color: active ? "#fff" : "var(--text-secondary)",
                  border: active ? "1px solid var(--purple)" : "1px solid var(--border)",
                  fontWeight: active ? 600 : 400,
                }}
              >
                {active ? "✓ " : ""}{e.label}
              </button>
            );
          })}
        </div>

        {/* Salary Pills */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
          <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)", minWidth: 80 }}>
            Salary Filter:
          </span>
          {SALARY_OPTIONS.map((s) => {
            const active = selectedSalary === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelectedSalary(s.id)}
                className="btn btn-sm"
                style={{
                  padding: "0.15rem 0.55rem",
                  fontSize: "0.75rem",
                  borderRadius: "1rem",
                  background: active ? "var(--green)" : "var(--bg-secondary)",
                  color: active ? "#000" : "var(--text-secondary)",
                  border: active ? "1px solid var(--green)" : "1px solid var(--border)",
                  fontWeight: active ? 600 : 400,
                }}
              >
                {active && s.id !== "all" ? "✓ " : ""}{s.label}
              </button>
            );
          })}
        </div>

        {hasActiveFilters && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.75rem", paddingTop: "0.5rem", borderTop: "1px solid var(--border-subtle)" }}>
            <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
              Showing {filteredApps.length} of {totalApplied} applied jobs matching filters
            </span>
            <button onClick={clearFilters} className="btn btn-ghost btn-sm" style={{ color: "var(--red)", fontSize: "0.75rem" }}>
              <X size={12} /> Clear Filters
            </button>
          </div>
        )}
      </div>

      {/* Applied Jobs List */}
      <div>
        {loading ? (
          <div className="card" style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>
            <RefreshCw size={20} style={{ animation: "spin 1s linear infinite", display: "inline-block", marginBottom: "0.5rem" }} />
            <div>Loading applied jobs…</div>
          </div>
        ) : filteredApps.length === 0 ? (
          <div className="card" style={{ textAlign: "center", padding: "3.5rem 1.5rem" }}>
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(34, 197, 94, 0.1)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1rem", color: "var(--green)" }}>
              <CheckCircle2 size={30} />
            </div>
            <h3 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "0.5rem", color: "var(--text-primary)" }}>
              {totalApplied === 0 ? "No Applications Submitted Yet" : "No Applied Jobs Match Filters"}
            </h3>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", maxWidth: 480, margin: "0 auto 1.5rem" }}>
              {totalApplied === 0
                ? "Jobs are actively being polled and evaluated. You can review pending matches and approve them for submission in the Review Queue."
                : "Try clearing or adjusting your role, experience, or salary filters to view your submitted applications."}
            </p>
            {totalApplied === 0 ? (
              <div style={{ display: "flex", justifyContent: "center", gap: "0.75rem" }}>
                <Link href="/applications" className="btn btn-primary" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  Go to Review Queue ({reviewCount})
                  <ArrowRight size={14} />
                </Link>
                <Link href="/jobs" className="btn btn-ghost">
                  Browse Detected Jobs Feed
                </Link>
              </div>
            ) : (
              <button onClick={clearFilters} className="btn btn-secondary">
                Clear Active Filters
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
            {filteredApps.map((app) => {
              const detected = getDetectedBadges(app.job.title);
              const isExpanded = expandedId === app.id;
              const ats = app.job.atsType || app.job.company?.atsType || "DIRECT";
              const score = app.matchScore;
              const scoreColor = score == null ? "" : score >= 80 ? "var(--green)" : score >= 60 ? "var(--yellow)" : "var(--red)";

              return (
                <div
                  key={app.id}
                  className="card"
                  style={{
                    border: "1px solid var(--border)",
                    transition: "border-color 0.15s ease",
                    padding: "1.125rem",
                  }}
                >
                  {/* Top Bar */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 260 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.35rem", flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 600, fontSize: "1rem", color: "var(--text-primary)" }}>
                          {app.job.title}
                        </span>
                        <span
                          className={`badge ${app.status === "SUBMITTING" ? "badge-blue" : "badge-green"}`}
                          style={{ fontSize: "0.65rem", padding: "0.15rem 0.45rem" }}
                        >
                          {app.status === "SUBMITTING" ? "⏳ SUBMITTING…" : "✓ SUBMITTED"}
                        </span>
                        <span className="badge mono" style={{ fontSize: "0.6rem" }}>
                          {ats}
                        </span>
                        {detected.roles.map((r) => (
                          <span key={r} className="badge badge-accent" style={{ fontSize: "0.65rem" }}>
                            {r}
                          </span>
                        ))}
                        {detected.exps.map((e) => (
                          <span key={e} className="badge badge-purple" style={{ fontSize: "0.65rem" }}>
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

                      <div style={{ display: "flex", alignItems: "center", gap: "1.25rem", color: "var(--text-secondary)", fontSize: "0.8125rem", flexWrap: "wrap" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontWeight: 500 }}>
                          <Building2 size={13} style={{ color: "var(--text-muted)" }} />
                          {app.job.company?.name || "Company"}
                        </div>
                        {app.job.location && (
                          <div>
                            📍 {app.job.location}
                            {app.job.isRemote && <span className="badge badge-blue" style={{ marginLeft: "0.35rem" }}>Remote</span>}
                          </div>
                        )}
                        <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", color: "var(--green)", fontWeight: 500 }}>
                          <CheckCircle2 size={13} />
                          {formatAppliedDate(app.submittedAt || app.createdAt)}
                        </div>
                        {app.resume?.label && (
                          <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                            <FileText size={13} style={{ color: "var(--text-muted)" }} />
                            <span>Resume: <strong>{app.resume.label}</strong></span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Right Action & Score */}
                    <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
                      {score != null && (
                        <div style={{ textAlign: "right", marginRight: "0.5rem" }}>
                          <div style={{ fontSize: "1.125rem", fontWeight: 700, color: scoreColor }}>
                            {Math.round(score)}%
                          </div>
                          <div style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>Match Score</div>
                        </div>
                      )}

                      <a
                        href={app.job.url}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-ghost btn-sm"
                        title="View original job post"
                        style={{ padding: "0.35rem 0.6rem", display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.75rem" }}
                      >
                        <ExternalLink size={13} />
                        Job Post
                      </a>

                      <button
                        onClick={() => setExpandedId(isExpanded ? null : app.id)}
                        className="btn btn-secondary btn-sm"
                        style={{ padding: "0.35rem 0.6rem", display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.75rem" }}
                      >
                        {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                        {isExpanded ? "Hide Details" : "View Proof & Q&A"}
                      </button>
                    </div>
                  </div>

                  {/* Expanded Accordion */}
                  {isExpanded && (
                    <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid var(--border-subtle)" }}>
                      {/* LLM Verdict & Scores */}
                      {app.matchReason && (
                        <div style={{ marginBottom: "1rem", background: "var(--bg-elevated)", padding: "0.75rem", borderRadius: "var(--radius-sm)" }}>
                          <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--accent)", marginBottom: "0.25rem", display: "flex", alignItems: "center", gap: "0.35rem" }}>
                            <Sparkles size={13} /> AI Resume Match Verdict
                          </div>
                          <div style={{ fontSize: "0.8125rem", color: "var(--text-primary)" }}>
                            {app.matchReason}
                          </div>
                          <div style={{ display: "flex", gap: "1rem", marginTop: "0.5rem", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                            {app.embeddingScore != null && (
                              <span>Vector Semantic Match: <strong>{Math.round(app.embeddingScore)}%</strong></span>
                            )}
                            {app.llmScore != null && (
                              <span>LLM Specialization Score: <strong>{Math.round(app.llmScore)}%</strong></span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Confirmation Note */}
                      <div style={{ marginBottom: "1rem" }}>
                        <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)", marginBottom: "0.35rem" }}>
                          Confirmation & Submission Status:
                        </div>
                        <div
                          style={{
                            background: "rgba(34, 197, 94, 0.1)",
                            border: "1px solid rgba(34, 197, 94, 0.25)",
                            borderRadius: "var(--radius-sm)",
                            padding: "0.65rem 0.875rem",
                            fontSize: "0.8125rem",
                            color: "var(--green)",
                            display: "flex",
                            alignItems: "center",
                            gap: "0.5rem",
                          }}
                        >
                          <Check size={14} />
                          {app.confirmationText || "Application confirmed and recorded in database"}
                        </div>
                      </div>

                      {/* Submitted Form Answers */}
                      {app.formAnswers && app.formAnswers.length > 0 && (
                        <div style={{ marginBottom: "1rem" }}>
                          <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)", marginBottom: "0.5rem" }}>
                            Form Questions & Answers Dispatched ({app.formAnswers.length}):
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "0.5rem" }}>
                            {app.formAnswers.map((qa, i) => (
                              <div
                                key={i}
                                style={{
                                  background: "var(--bg-elevated)",
                                  borderRadius: "var(--radius-sm)",
                                  padding: "0.6rem 0.75rem",
                                  fontSize: "0.75rem",
                                }}
                              >
                                <div style={{ color: "var(--text-muted)", marginBottom: "0.2rem" }}>
                                  {qa.question}
                                </div>
                                <div style={{ fontWeight: 500, color: "var(--text-primary)" }}>
                                  {qa.answer}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Revert Action */}
                      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "0.75rem", paddingTop: "0.5rem", borderTop: "1px solid var(--border-subtle)" }}>
                        <button
                          onClick={() => handleRevert(app.id)}
                          disabled={revertingId === app.id}
                          className="btn btn-ghost btn-sm"
                          style={{ color: "var(--text-muted)", fontSize: "0.75rem", display: "flex", alignItems: "center", gap: "0.35rem" }}
                        >
                          <RotateCcw size={12} />
                          {revertingId === app.id ? "Reverting…" : "Revert to Review Queue"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
