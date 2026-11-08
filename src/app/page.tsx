"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Briefcase, FileCheck, Clock, AlertCircle,
  TrendingUp, Zap, Building2, RefreshCw, Filter, Search, X, Check,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";

import { parseSalary, matchesSalaryFilter } from "@/lib/salary-parser";

interface Stats {
  totalJobs: number;
  newJobs: number;
  awaitingReview: number;
  applied: number;
  failed: number;
  needsManualAction: number;
}

interface DailyStat { date: string; detected: number; applied: number; }

interface RecentJob {
  id: string;
  title: string;
  location: string;
  isRemote?: boolean;
  status: string;
  firstSeenAt: string;
  company: { name: string; atsType: string };
  applications?: { id: string; status: string; matchScore?: number; resume?: { id: string; label: string; name: string } }[];
}

interface RecentApp {
  id: string;
  status: string;
  matchScore?: number;
  resume?: { label: string };
  job: { title: string; company: { name: string } };
}

const statusBadge: Record<string, { cls: string; label: string }> = {
  NEW:                 { cls: "badge-accent",  label: "New" },
  FILTERING:           { cls: "badge-blue",    label: "Filtering" },
  FILTERED:            { cls: "badge-gray",    label: "Filtered" },
  MATCHING:            { cls: "badge-purple",  label: "Matching" },
  MATCHED:             { cls: "badge-purple",  label: "Matched" },
  AWAITING_REVIEW:     { cls: "badge-yellow",  label: "Review" },
  APPLYING:            { cls: "badge-blue",    label: "Applying" },
  APPLIED:             { cls: "badge-green",   label: "Applied" },
  SKIPPED_LOW_MATCH:   { cls: "badge-gray",    label: "Skipped" },
  FAILED:              { cls: "badge-red",     label: "Failed" },
  NEEDS_MANUAL_ACTION: { cls: "badge-red",     label: "Manual" },
  READY_FOR_REVIEW:    { cls: "badge-yellow",  label: "Review" },
  SUBMITTED:           { cls: "badge-green",   label: "Submitted" },
};

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
  { id: "freshers", label: "🌱 Freshers", pattern: /fresher|fresh graduate|new grad|new graduate|entry[- ]level|0[- ]1 year|campus|graduate engineer|associate engineer|associate software|sde[- ]?1|sde 1/i },
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

const INDIA_LOCATION_KEYWORDS = [
  "india", "bengaluru", "bangalore", "pune", "hyderabad", "gurgaon", "gurugram",
  "noida", "delhi", "mumbai", "chennai", "kolkata", "ahmedabad", "remote - india",
  "karnataka", "maharashtra", "telangana", "haryana", "uttar pradesh", "tamil nadu",
  "kochi", "coimbatore", "chandigarh", "indore", "jaipur"
];

function isIndiaLocation(loc?: string, title?: string): boolean {
  const combined = `${loc || ""} ${title || ""}`.toLowerCase();
  return INDIA_LOCATION_KEYWORDS.some((k) => combined.includes(k));
}

function getDetectedBadges(title: string, description?: string) {
  const roles = ROLE_OPTIONS.filter((r) => r.pattern.test(title)).map((r) => r.label);
  const exps = EXP_OPTIONS.filter((e) => e.pattern.test(title)).map((e) => e.label);
  const salary = parseSalary(`${title} ${description || ""}`);
  return { roles, exps, salary };
}

function StatCard({ value, label, icon: Icon, color, href }: {
  value: number; label: string; icon: React.ElementType; color: string; href?: string;
}) {
  const card = (
    <div className="stat-card" style={{ cursor: href ? "pointer" : "default" }}>
      <div className="stat-icon" style={{ background: `${color}20` }}>
        <Icon size={18} style={{ color }} />
      </div>
      <div className="stat-value" style={{ color }}>{value.toLocaleString()}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
  return href ? <Link href={href} style={{ textDecoration: "none" }}>{card}</Link> : card;
}

const CustomTooltip = ({ active, payload, label }: {
  active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string;
}) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "var(--bg-elevated)", border: "1px solid var(--border)",
      borderRadius: "var(--radius-sm)", padding: "0.75rem",
      fontSize: "0.8125rem",
    }}>
      <div style={{ color: "var(--text-secondary)", marginBottom: "0.375rem" }}>{label}</div>
      {payload.map((p) => (
        <div key={p.name} style={{ color: p.color, fontWeight: 500 }}>
          {p.name}: {p.value}
        </div>
      ))}
    </div>
  );
};

export default function OverviewPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [dailyStats, setDailyStats] = useState<DailyStat[]>([]);
  const [recentJobs, setRecentJobs] = useState<RecentJob[]>([]);
  const [recentApps, setRecentApps] = useState<RecentApp[]>([]);
  const [loading, setLoading] = useState(true);

  // Combination filters
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [selectedExps, setSelectedExps] = useState<string[]>([]);
  const [selectedSalary, setSelectedSalary] = useState<string>("all");
  const [jobSearch, setJobSearch] = useState("");

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/overview");
      if (!res.ok) return;
      const data = await res.json();
      setStats(data.stats);
      setDailyStats(data.dailyStats ?? []);
      setRecentJobs(data.recentJobs ?? []);
      setRecentApps(data.recentApplications ?? []);
    } catch {/* ignore */}
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

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
    setJobSearch("");
  };

  // Filtered jobs based on multi-select combinations & salary
  const filteredRecentJobs = recentJobs.filter((job) => {
    const title = job.title.toLowerCase();
    const company = job.company.name.toLowerCase();

    // Text search
    if (jobSearch && !title.includes(jobSearch.toLowerCase()) && !company.includes(jobSearch.toLowerCase())) {
      return false;
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
          job.title,
          salOpt.minAnnualLpa,
          salOpt.minMonthlyInr,
          salOpt.minAnnualUsd
        );
        if (!matchesSal) return false;
      }
    }

    return true;
  });

  const hasActiveFilters = selectedRoles.length > 0 || selectedExps.length > 0 || selectedSalary !== "all" || jobSearch.length > 0;

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 400, gap: "0.5rem", color: "var(--text-muted)" }}>
        <RefreshCw size={18} style={{ animation: "spin 1s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        Loading…
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1400 }}>
      {/* Page Title */}
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem" }}>Overview</h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>
          Live pipeline status — auto-refreshes every 30s
          <span className="live-dot" style={{ marginLeft: "0.5rem" }} />
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-4" style={{ gap: "1rem", marginBottom: "1.5rem" }}>
        <StatCard value={stats?.totalJobs ?? 0}     label="Total Jobs Detected" icon={Briefcase}  color="var(--accent)"  href="/jobs" />
        <StatCard value={stats?.awaitingReview ?? 0} label="Awaiting Review"      icon={Clock}      color="var(--yellow)"  href="/jobs?status=AWAITING_REVIEW" />
        <StatCard value={stats?.applied ?? 0}        label="Applications Sent"    icon={FileCheck}  color="var(--green)"   href="/applied" />
        <StatCard value={stats?.needsManualAction ?? 0} label="Needs Manual Action" icon={AlertCircle} color="var(--red)" href="/jobs?status=NEEDS_MANUAL_ACTION" />
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-3" style={{ gap: "1rem", marginBottom: "1.5rem" }}>
        <StatCard value={stats?.newJobs ?? 0}  label="New Jobs (unprocessed)" icon={Zap}       color="var(--blue)" />
        <StatCard value={stats?.failed ?? 0}    label="Failed Applications"    icon={AlertCircle} color="var(--red)"  href="/applications" />
        <div className="stat-card" style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.08), rgba(168,85,247,0.08))", borderColor: "rgba(99,102,241,0.2)" }}>
          <div className="stat-icon" style={{ background: "rgba(99,102,241,0.15)" }}>
            <TrendingUp size={18} style={{ color: "var(--accent)" }} />
          </div>
          <div className="stat-value" style={{ color: "var(--accent)" }}>
            {stats?.totalJobs ? Math.round((stats.applied / stats.totalJobs) * 100) : 0}%
          </div>
          <div className="stat-label">Apply Rate</div>
        </div>
      </div>

      {/* Chart + Recent Activity */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: "1rem" }}>
        {/* Activity Chart */}
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
            <h2 style={{ fontSize: "1rem", fontWeight: 600 }}>7-Day Activity</h2>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={dailyStats} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="grad-detected" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="grad-applied" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
              <XAxis dataKey="date" tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: "0.75rem", color: "var(--text-secondary)" }} />
              <Area type="monotone" dataKey="detected" name="Jobs Detected" stroke="#6366f1" strokeWidth={2} fill="url(#grad-detected)" />
              <Area type="monotone" dataKey="applied"  name="Applied"       stroke="#22c55e" strokeWidth={2} fill="url(#grad-applied)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Recent Applications Feed */}
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: "0" }}>
          <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1rem" }}>Recent Applications</h2>
          {recentApps.length === 0 ? (
            <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: "0.875rem", padding: "2rem 0" }}>
              No applications yet
            </div>
          ) : recentApps.map((app) => {
            const badge = statusBadge[app.status] ?? { cls: "badge-gray", label: app.status };
            return (
              <Link key={app.id} href={`/applications/${app.id}`} style={{
                textDecoration: "none", display: "block",
                padding: "0.75rem 0", borderBottom: "1px solid var(--border-subtle)",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "0.8125rem", fontWeight: 500, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {app.job.title}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                      {app.job.company.name} · {app.resume?.label ?? "–"}
                      {app.matchScore != null && (
                        <span style={{ color: "var(--accent)", marginLeft: "0.5rem" }}>
                          {Math.round(app.matchScore)}%
                        </span>
                      )}
                    </div>
                  </div>
                  <span className={`badge ${badge.cls}`}>{badge.label}</span>
                </div>
              </Link>
            );
          })}
          {recentApps.length > 0 && (
            <Link href="/applications" style={{ display: "block", textAlign: "center", marginTop: "0.75rem", fontSize: "0.8125rem", color: "var(--accent)", textDecoration: "none" }}>
              View all →
            </Link>
          )}
        </div>
      </div>

      {/* Recent Jobs with Combination Filters */}
      <div className="card" style={{ marginTop: "1.25rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem", flexWrap: "wrap", gap: "0.75rem" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Filter size={18} style={{ color: "var(--accent)" }} />
              <h2 style={{ fontSize: "1.0625rem", fontWeight: 600 }}>Target Jobs Feed</h2>
              <span className="badge badge-accent" style={{ fontSize: "0.7rem" }}>
                {filteredRecentJobs.length} shown of {recentJobs.length} detected
              </span>
            </div>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.8125rem", marginTop: "0.25rem" }}>
              Toggle combination filters below to show only the roles and experience levels you want on your dashboard.
            </p>
          </div>

          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="btn btn-ghost btn-sm"
                style={{ color: "var(--red)", fontSize: "0.75rem", display: "flex", alignItems: "center", gap: "0.25rem" }}
              >
                <X size={12} /> Clear Filters
              </button>
            )}
            <Link href="/settings" className="btn btn-ghost btn-sm" style={{ fontSize: "0.75rem" }}>
              ⚙️ Pipeline Filter
            </Link>
            <Link href="/jobs" className="btn btn-primary btn-sm">
              View All Jobs →
            </Link>
          </div>
        </div>

        {/* Combination Filter Controls */}
        <div style={{ background: "var(--bg-secondary)", padding: "0.875rem", borderRadius: "var(--radius-sm)", marginBottom: "1rem", display: "flex", flexDirection: "column", gap: "0.625rem" }}>
          {/* Search Bar */}
          <div style={{ position: "relative" }}>
            <Search size={14} style={{ position: "absolute", left: "0.625rem", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
            <input
              id="dashboard-job-search"
              className="input"
              placeholder="Instant search by title, keyword, or company…"
              value={jobSearch}
              onChange={(e) => setJobSearch(e.target.value)}
              style={{ paddingLeft: "2rem", height: "2.1rem", fontSize: "0.8125rem" }}
            />
          </div>

          {/* Role Combinations */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
            <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)", minWidth: 90 }}>
              Roles:
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
                    padding: "0.2rem 0.6rem",
                    fontSize: "0.75rem",
                    borderRadius: "1rem",
                    background: active ? "var(--accent)" : "var(--bg-card)",
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

          {/* Experience Combinations */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
            <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)", minWidth: 90 }}>
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
                    padding: "0.2rem 0.6rem",
                    fontSize: "0.75rem",
                    borderRadius: "1rem",
                    background: active ? "var(--purple)" : "var(--bg-card)",
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

          {/* Salary Combinations (Monthly & Annual) */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
            <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)", minWidth: 90 }}>
              Min Salary:
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
                    padding: "0.2rem 0.6rem",
                    fontSize: "0.75rem",
                    borderRadius: "1rem",
                    background: active ? "var(--green)" : "var(--bg-card)",
                    color: active ? "#fff" : "var(--text-secondary)",
                    border: active ? "1px solid var(--green)" : "1px solid var(--border)",
                    fontWeight: active ? 600 : 400,
                  }}
                >
                  {active ? "✓ " : ""}{s.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Filtered Jobs Table */}
        <div className="table-wrap" style={{ border: "none" }}>
          <table>
            <thead>
              <tr>
                <th>Job Title & Matched Tags</th>
                <th>Company</th>
                <th>Location</th>
                <th>Resume</th>
                <th>Score</th>
                <th>Status</th>
                <th>Detected</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecentJobs.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", color: "var(--text-muted)", padding: "2.5rem" }}>
                    {recentJobs.length === 0
                      ? "No jobs detected yet. Target companies are actively polling career boards."
                      : "No jobs match your selected combination filters. Try clicking different role/experience/salary pills above."}
                  </td>
                </tr>
              ) : filteredRecentJobs.map((job) => {
                const badge = statusBadge[job.status] ?? { cls: "badge-gray", label: job.status };
                const app = job.applications?.[0];
                const score = app?.matchScore;
                const scoreColor = score == null ? "" : score >= 80 ? "var(--green)" : score >= 60 ? "var(--yellow)" : "var(--red)";
                const { roles, exps, salary } = getDetectedBadges(job.title, (job as any).description);

                return (
                  <tr key={job.id}>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: "0.875rem", marginBottom: "0.25rem" }}>
                        {job.title}
                      </div>
                      <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap", alignItems: "center" }}>
                        {roles.map((r) => (
                          <span key={r} className="badge badge-accent" style={{ fontSize: "0.65rem", padding: "0.1rem 0.4rem" }}>
                            {r}
                          </span>
                        ))}
                        {exps.map((e) => (
                          <span key={e} className="badge badge-purple" style={{ fontSize: "0.65rem", padding: "0.1rem 0.4rem" }}>
                            {e}
                          </span>
                        ))}
                        {salary?.displayString ? (
                          <span className="badge badge-green" style={{ fontSize: "0.65rem", padding: "0.1rem 0.4rem", fontWeight: 600 }}>
                            💵 {salary.displayString}
                          </span>
                        ) : (
                          <span className="badge badge-gray" style={{ fontSize: "0.65rem", padding: "0.1rem 0.4rem", opacity: 0.7 }}>
                            🏷️ Salary Unspecified
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", fontSize: "0.875rem" }}>
                        <Building2 size={13} style={{ color: "var(--text-muted)" }} />
                        {job.company.name}
                      </div>
                    </td>
                    <td style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", flexWrap: "wrap" }}>
                        <span>{job.location || "–"}</span>
                        {isIndiaLocation(job.location, job.title) && (
                          <span className="badge" style={{ fontSize: "0.6rem", background: "rgba(249, 115, 22, 0.15)", color: "#ea580c", border: "1px solid rgba(249, 115, 22, 0.3)" }}>
                            🇮🇳 India
                          </span>
                        )}
                        {job.isRemote && <span className="badge badge-blue">Remote</span>}
                      </div>
                    </td>
                    <td style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                      {app?.resume?.label ? `📄 ${app.resume.label}` : "–"}
                    </td>
                    <td>
                      {score != null ? (
                        <span style={{ fontWeight: 600, color: scoreColor, fontSize: "0.8125rem" }}>
                          {Math.round(score)}%
                        </span>
                      ) : (
                        <span style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>–</span>
                      )}
                    </td>
                    <td><span className={`badge ${badge.cls}`}>{badge.label}</span></td>
                    <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>
                      {new Date(job.firstSeenAt).toLocaleTimeString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
