"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Play, Pause, RefreshCw, Zap, ExternalLink, CheckCircle, XCircle } from "lucide-react";

interface Company {
  id: string;
  name: string;
  slug: string;
  careersUrl: string;
  atsType: string;
  pollingIntervalMinutes: number;
  applyMode: string;
  isActive: boolean;
  isPaused: boolean;
  lastPolledAt?: string;
  jobsCount: number;
  _count: { jobs: number };
}

const ATS_COLORS: Record<string, string> = {
  GREENHOUSE: "#24b47e",
  LEVER: "#3b82f6",
  ASHBY: "#8b5cf6",
  WORKABLE: "#f59e0b",
  SMARTRECRUITERS: "#ef4444",
  CUSTOM: "var(--text-muted)",
};

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; message: string; ok: boolean } | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [interval, setInterval] = useState(2);
  const [mode, setMode] = useState("REVIEW");
  const [saving, setSaving] = useState(false);

  const fetchCompanies = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/companies");
      setCompanies(await res.json());
    } catch {/* ignore */}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchCompanies(); }, [fetchCompanies]);

  const addCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, careersUrl: url, pollingIntervalMinutes: interval, applyMode: mode }),
      });
      setName(""); setUrl(""); setInterval(2); setMode("REVIEW");
      setShowForm(false);
      await fetchCompanies();
    } catch {/* ignore */}
    finally { setSaving(false); }
  };

  const updateCompany = async (id: string, data: Partial<Company>) => {
    await fetch(`/api/companies/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    fetchCompanies();
  };

  const deleteCompany = async (id: string) => {
    if (!confirm("Remove this company?")) return;
    await fetch(`/api/companies/${id}`, { method: "DELETE" });
    fetchCompanies();
  };

  const testRun = async (id: string) => {
    setTestingId(id);
    setTestResult(null);
    try {
      const res = await fetch("/api/test-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: id }),
      });
      const data = await res.json();
      setTestResult({ id, message: data.message ?? data.error, ok: res.ok });
    } catch {
      setTestResult({ id, message: "Test run failed", ok: false });
    } finally {
      setTestingId(null);
    }
  };

  const [companySearch, setCompanySearch] = useState("");
  const [filterTab, setFilterTab] = useState<"ALL" | "ACTIVE" | "PAUSED">("ALL");
  const [seedingFamous, setSeedingFamous] = useState(false);

  const seedFamous = async () => {
    setSeedingFamous(true);
    try {
      const res = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "seed_famous" }),
      });
      if (res.ok) {
        setCompanies(await res.json());
      }
    } catch {/* ignore */}
    finally { setSeedingFamous(false); }
  };

  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");

  const JOB_BOARD_SLUGS = ["remoteok", "arbeitnow", "jobicy"];
  const AI_LAB_SLUGS = ["openai", "anthropic", "perplexity", "cohere", "langchain", "modal", "supabase", "neon", "vercel", "ramp", "pinecone", "resend", "clerk", "scaleai"];
  const INDIAN_SLUGS = ["swiggy", "razorpay", "zepto", "phonepe", "groww", "inmobi", "postman", "browserstack", "cred", "meesho"];

  const filteredCompanies = companies.filter((c) => {
    const matchesTab = filterTab === "ALL" || (filterTab === "ACTIVE" && c.isActive && !c.isPaused) || (filterTab === "PAUSED" && (!c.isActive || c.isPaused));
    
    let matchesCategory = true;
    if (categoryFilter === "JOB_BOARDS") matchesCategory = JOB_BOARD_SLUGS.includes(c.slug);
    else if (categoryFilter === "AI_LABS") matchesCategory = AI_LAB_SLUGS.includes(c.slug);
    else if (categoryFilter === "INDIAN") matchesCategory = INDIAN_SLUGS.includes(c.slug);
    else if (categoryFilter === "GLOBAL") matchesCategory = !JOB_BOARD_SLUGS.includes(c.slug) && !INDIAN_SLUGS.includes(c.slug);

    const matchesSearch = !companySearch ||
      c.name.toLowerCase().includes(companySearch.toLowerCase()) ||
      c.careersUrl.toLowerCase().includes(companySearch.toLowerCase()) ||
      c.atsType.toLowerCase().includes(companySearch.toLowerCase());
    return matchesTab && matchesCategory && matchesSearch;
  });

  const [page, setPage] = useState(1);
  const pageSize = 25;
  const totalPages = Math.ceil(filteredCompanies.length / pageSize);
  const paginatedCompanies = filteredCompanies.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div style={{ maxWidth: 1100 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem", flexWrap: "wrap", gap: "0.75rem" }}>
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem" }}>Monitored Companies & Job Boards</h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>
            Tracking {companies.length} top tech companies, AI labs, and major remote job boards.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            id="seed-famous-btn"
            className="btn btn-secondary btn-sm"
            onClick={seedFamous}
            disabled={seedingFamous}
            style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}
          >
            <Zap size={13} style={{ color: "var(--accent)" }} />
            {seedingFamous ? "Updating Sites & Boards…" : "🌟 Add All 52 Sites & Boards"}
          </button>
          <button id="add-company-btn" className="btn btn-primary btn-sm" onClick={() => setShowForm(!showForm)}>
            <Plus size={14} />
            Add Custom Source
          </button>
        </div>
      </div>

      {/* Category Pills */}
      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "0.875rem" }}>
        {[
          { id: "ALL", label: `All Sources (${companies.length})` },
          { id: "JOB_BOARDS", label: `🌐 Major Job Boards (${companies.filter(c => JOB_BOARD_SLUGS.includes(c.slug)).length})` },
          { id: "AI_LABS", label: `🧠 AI Labs & DevTools (${companies.filter(c => AI_LAB_SLUGS.includes(c.slug)).length})` },
          { id: "INDIAN", label: `🇮🇳 Top Indian Unicorns (${companies.filter(c => INDIAN_SLUGS.includes(c.slug)).length})` },
          { id: "GLOBAL", label: `🚀 Global Tech Giants (${companies.filter(c => !JOB_BOARD_SLUGS.includes(c.slug) && !INDIAN_SLUGS.includes(c.slug)).length})` },
        ].map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => { setCategoryFilter(cat.id); setPage(1); }}
            className={`btn btn-sm ${categoryFilter === cat.id ? "btn-primary" : "btn-ghost"}`}
            style={{
              fontSize: "0.75rem",
              padding: "0.25rem 0.65rem",
              borderRadius: "999px",
              fontWeight: categoryFilter === cat.id ? 600 : 500,
            }}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Filter and Search Bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", gap: "0.75rem", flexWrap: "wrap" }}>
        <input
          id="search-companies"
          className="input"
          placeholder="Search by company or board name, ATS, or URL…"
          value={companySearch}
          onChange={(e) => { setCompanySearch(e.target.value); setPage(1); }}
          style={{ maxWidth: 360, flex: 1 }}
        />
        <div style={{ display: "flex", gap: "0.25rem" }}>
          {(["ALL", "ACTIVE", "PAUSED"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => { setFilterTab(tab); setPage(1); }}
              className="btn btn-sm"
              style={{
                fontSize: "0.75rem",
                padding: "0.25rem 0.6rem",
                background: filterTab === tab ? "var(--accent)" : "var(--bg-secondary)",
                color: filterTab === tab ? "#fff" : "var(--text-secondary)",
                border: filterTab === tab ? "1px solid var(--accent)" : "1px solid var(--border)",
              }}
            >
              {tab === "ALL" ? `All (${companies.length})` : tab === "ACTIVE" ? `Active (${companies.filter(c => c.isActive && !c.isPaused).length})` : `Paused (${companies.filter(c => !c.isActive || c.isPaused).length})`}
            </button>
          ))}
        </div>
      </div>

      {/* Add Company Form */}
      {showForm && (
        <div className="card" style={{ marginBottom: "1.5rem", borderColor: "rgba(99,102,241,0.3)" }}>
          <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1rem" }}>Add New Company</h2>
          <form onSubmit={addCompany}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.875rem", marginBottom: "0.875rem" }}>
              <div className="form-group">
                <label className="label" htmlFor="company-name">Company Name</label>
                <input id="company-name" className="input" placeholder="e.g. Stripe" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div className="form-group">
                <label className="label" htmlFor="careers-url">Careers URL</label>
                <input
                  id="careers-url"
                  className="input"
                  placeholder="https://boards.greenhouse.io/stripe"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="label" htmlFor="poll-interval">Poll Interval (minutes)</label>
                <input
                  id="poll-interval"
                  type="number"
                  className="input"
                  min={1} max={60}
                  value={interval}
                  onChange={(e) => setInterval(parseInt(e.target.value))}
                />
              </div>
              <div className="form-group">
                <label className="label" htmlFor="apply-mode">Apply Mode</label>
                <select id="apply-mode" className="input" value={mode} onChange={(e) => setMode(e.target.value)}>
                  <option value="FULL_AUTO">⚡ Full Auto (Apply automatically)</option>
                  <option value="REVIEW">📋 Review Mode (Approve before submit)</option>
                  <option value="MANUAL">🔔 Alert Only (Send alert, apply manually)</option>
                </select>
              </div>
            </div>
            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
              <button id="save-company-btn" type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? "Saving…" : "Add Company"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Test result banner */}
      {testResult && (
        <div style={{
          padding: "0.75rem 1rem", borderRadius: "var(--radius-sm)", marginBottom: "1rem",
          background: testResult.ok ? "var(--green-subtle)" : "var(--red-subtle)",
          border: `1px solid ${testResult.ok ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"}`,
          color: testResult.ok ? "var(--green)" : "var(--red)",
          fontSize: "0.875rem", display: "flex", gap: "0.5rem", alignItems: "center",
        }}>
          {testResult.ok ? <CheckCircle size={14} /> : <XCircle size={14} />}
          {testResult.message}
          <button onClick={() => setTestResult(null)} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "inherit" }}>✕</button>
        </div>
      )}

      {/* Companies Table */}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Company</th>
              <th>ATS</th>
              <th>Mode</th>
              <th>Poll Interval</th>
              <th>Jobs Found</th>
              <th>Last Polled</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>
                  <RefreshCw size={16} style={{ animation: "spin 1s linear infinite", display: "inline" }} />
                  <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </td>
              </tr>
            ) : filteredCompanies.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: "center", padding: "2.5rem", color: "var(--text-muted)" }}>
                  No companies matching your search.
                </td>
              </tr>
            ) : paginatedCompanies.map((c) => (
              <tr key={c.id}>
                <td>
                  <div style={{ fontWeight: 500 }}>{c.name}</div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                    <a href={c.careersUrl} target="_blank" rel="noreferrer"
                      style={{ color: "inherit", textDecoration: "none", display: "flex", alignItems: "center", gap: "0.25rem" }}>
                      {c.careersUrl.length > 40 ? c.careersUrl.slice(0, 40) + "…" : c.careersUrl}
                      <ExternalLink size={10} />
                    </a>
                  </div>
                </td>
                <td>
                  <span className="badge mono" style={{ background: `${ATS_COLORS[c.atsType]}20`, color: ATS_COLORS[c.atsType], fontSize: "0.68rem" }}>
                    {c.atsType}
                  </span>
                </td>
                <td>
                  <select
                    className="input"
                    style={{
                      fontSize: "0.75rem",
                      padding: "0.2rem 0.5rem",
                      height: "auto",
                      width: "auto",
                      background:
                        c.applyMode === "FULL_AUTO"
                          ? "rgba(16,185,129,0.15)"
                          : c.applyMode === "MANUAL"
                          ? "rgba(59,130,246,0.15)"
                          : "rgba(245,158,11,0.15)",
                      color:
                        c.applyMode === "FULL_AUTO"
                          ? "#10b981"
                          : c.applyMode === "MANUAL"
                          ? "#3b82f6"
                          : "#f59e0b",
                      border: "1px solid currentColor",
                      borderRadius: "var(--radius-sm)",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                    value={c.applyMode}
                    onChange={(e) => updateCompany(c.id, { applyMode: e.target.value })}
                  >
                    <option value="FULL_AUTO">⚡ Full Auto</option>
                    <option value="REVIEW">📋 Review</option>
                    <option value="MANUAL">🔔 Alert Only</option>
                  </select>
                </td>
                <td style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>
                  {c.pollingIntervalMinutes}m
                </td>
                <td>
                  <span style={{ fontWeight: 600 }}>{c._count?.jobs ?? c.jobsCount}</span>
                </td>
                <td style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                  {c.lastPolledAt ? new Date(c.lastPolledAt).toLocaleTimeString() : "Never"}
                </td>
                <td>
                  {!c.isActive ? (
                    <span className="badge badge-gray">Inactive</span>
                  ) : c.isPaused ? (
                    <span className="badge badge-yellow">Paused</span>
                  ) : (
                    <span className="badge badge-green">Active</span>
                  )}
                </td>
                <td>
                  <div style={{ display: "flex", gap: "0.375rem" }}>
                    {/* Active toggle */}
                    <button
                      id={`toggle-${c.id}`}
                      className="btn btn-ghost btn-sm"
                      onClick={() => updateCompany(c.id, { isActive: !c.isActive })}
                      title={c.isActive ? "Deactivate" : "Activate"}
                      style={{ padding: "0.3rem" }}
                    >
                      {c.isActive ? <Pause size={13} /> : <Play size={13} />}
                    </button>
                    {/* Test run */}
                    <button
                      id={`test-run-${c.id}`}
                      className="btn btn-ghost btn-sm"
                      onClick={() => testRun(c.id)}
                      disabled={testingId === c.id}
                      title="Test run"
                    >
                      {testingId === c.id ? (
                        <RefreshCw size={12} style={{ animation: "spin 1s linear infinite" }} />
                      ) : (
                        <Zap size={12} />
                      )}
                    </button>
                    {/* Delete */}
                    <button
                      id={`delete-company-${c.id}`}
                      className="btn btn-danger btn-sm"
                      onClick={() => deleteCompany(c.id)}
                      style={{ padding: "0.3rem" }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "0.5rem", marginTop: "1rem" }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            ← Previous
          </button>
          <span style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", padding: "0 0.5rem" }}>
            Page {page} of {totalPages} ({filteredCompanies.length} total)
          </span>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
