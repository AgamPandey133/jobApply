"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ExternalLink, Search, Filter, RefreshCw, Building2, X, Check, CheckCircle2, Terminal, Play, Globe, Zap, Clock, Sparkles, Trash2, EyeOff, RotateCcw } from "lucide-react";
import { parseSalary, matchesSalaryFilter } from "@/lib/salary-parser";

interface Job {
  id: string;
  title: string;
  location: string;
  isRemote: boolean;
  status: string;
  filterReason?: string;
  firstSeenAt: string;
  postedAt?: string;
  atsType: string;
  url: string;
  description?: string;
  salary?: import("@/lib/salary-parser").ParsedSalary;
  company: { id: string; name: string; atsType: string };
  applications: { id: string; status: string; matchScore?: number; resume?: { id: string; label: string; name: string } }[];
}

interface Company { id: string; name: string; }

const statusBadge: Record<string, { cls: string; label: string }> = {
  NEW:                 { cls: "badge-accent",  label: "New" },
  FILTERING:           { cls: "badge-blue",    label: "Filtering" },
  FILTERED:            { cls: "badge-gray",    label: "Filtered" },
  MATCHING:            { cls: "badge-purple",  label: "Matching" },
  MATCHED:             { cls: "badge-purple",  label: "Matched" },
  AWAITING_REVIEW:     { cls: "badge-yellow",  label: "Awaiting Review" },
  APPLYING:            { cls: "badge-blue",    label: "Applying" },
  APPLIED:             { cls: "badge-green",   label: "Applied" },
  SKIPPED_LOW_MATCH:   { cls: "badge-gray",    label: "Skipped" },
  FAILED:              { cls: "badge-red",     label: "Failed" },
  NEEDS_MANUAL_ACTION: { cls: "badge-red",     label: "Manual Action" },
};

const ALL_STATUSES = [
  "NEW", "FILTERING", "FILTERED", "MATCHING", "MATCHED",
  "AWAITING_REVIEW", "APPLYING", "APPLIED", "SKIPPED_LOW_MATCH",
  "FAILED", "NEEDS_MANUAL_ACTION",
];

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

function isLinkedInJob(job: { atsType?: string; url?: string; externalId?: string; company?: { name?: string } }): boolean {
  const ats = (job.atsType || "").toLowerCase();
  const url = (job.url || "").toLowerCase();
  const comp = (job.company?.name || "").toLowerCase();
  const ext = ((job as any).externalId || "").toLowerCase();
  return ats.includes("linkedin") || url.includes("linkedin.com") || comp.includes("linkedin") || ext.startsWith("li-");
}

function isJobExpiredOrNotUseful(job: Job, dismissedIds: Set<string>): boolean {
  if (dismissedIds.has(job.id)) return true;
  const title = (job.title || "").toLowerCase();
  if (
    title.includes("[closed]") ||
    title.includes("(closed)") ||
    title.includes("position closed") ||
    title.includes("hiring closed") ||
    title.includes("no longer accepting") ||
    title.includes("test job")
  ) {
    return true;
  }
  return false;
}

function formatRelativeTime(dateStr?: string | Date): { text: string; hoursAgo: number; isWithin10h: boolean } {
  if (!dateStr) return { text: "–", hoursAgo: Infinity, isWithin10h: false };
  const d = new Date(dateStr);
  const now = Date.now();
  const diffMs = now - d.getTime();
  const hoursAgo = Math.max(0, diffMs / (1000 * 3600));
  const isWithin10h = hoursAgo <= 10;

  if (hoursAgo < 1) {
    const mins = Math.max(1, Math.round(diffMs / (1000 * 60)));
    return { text: `${mins}m ago`, hoursAgo, isWithin10h: true };
  }
  if (hoursAgo < 24) {
    const h = Math.floor(hoursAgo);
    return { text: `${h}h ago`, hoursAgo, isWithin10h };
  }
  const days = Math.floor(hoursAgo / 24);
  return { text: `${days}d ago`, hoursAgo, isWithin10h: false };
}

function getDetectedBadges(job: Job) {
  const roles = ROLE_OPTIONS.filter((r) => r.pattern.test(job.title)).map((r) => r.label);
  const exps = EXP_OPTIONS.filter((e) => e.pattern.test(job.title)).map((e) => e.label);
  const salary = job.salary?.displayString
    ? job.salary
    : parseSalary(`${job.title} ${job.description || ""}`);
  return { roles, exps, salary };
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [selectedExps, setSelectedExps] = useState<string[]>([]);
  const [indiaOnly, setIndiaOnly] = useState(false);
  const [activeSection, setActiveSection] = useState<"other" | "linkedin">("other");
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [recentlyDismissed, setRecentlyDismissed] = useState<Job | null>(null);
  const [salaryMode, setSalaryMode] = useState<"all" | "monthly" | "lpa">("all");
  const [customMin, setCustomMin] = useState<string>("");
  const [customMax, setCustomMax] = useState<string>("");
  const [includeUnspecified, setIncludeUnspecified] = useState(false);
  const [page, setPage] = useState(1);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [syncingIndia, setSyncingIndia] = useState(false);
  const limit = 50;

  // Web Crawler modal & live monitor state
  const [showCrawlerModal, setShowCrawlerModal] = useState(false);
  const [crawlerRunning, setCrawlerRunning] = useState(false);
  const [crawlerSource, setCrawlerSource] = useState<"all" | "linkedin" | "companies" | "aggregators">("all");
  const [crawlerMaxHours, setCrawlerMaxHours] = useState<number>(10);
  const [crawlerStatus, setCrawlerStatus] = useState<any>(null);

  // Load dismissed jobs from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem("jobsniper_dismissed_job_ids");
      if (stored) {
        const arr = JSON.parse(stored);
        if (Array.isArray(arr)) setDismissedIds(new Set(arr));
      }
    } catch {}
  }, []);

  const handleDismissJob = async (job: Job, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    // Instantly remove from rendered list
    setJobs((prev) => prev.filter((j) => j.id !== job.id));
    setTotal((prev) => Math.max(0, prev - 1));
    const nextSet = new Set(dismissedIds);
    nextSet.add(job.id);
    setDismissedIds(nextSet);
    try {
      localStorage.setItem("jobsniper_dismissed_job_ids", JSON.stringify(Array.from(nextSet)));
    } catch {}

    setRecentlyDismissed(job);
    setToastMessage(`🗑️ Removed "${job.title.slice(0, 45)}…" from your rendered list.`);

    // Persist to server
    fetch("/api/jobs/dismiss", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: job.id, reason: "User dismissed: Marked as expired / not useful" }),
    }).catch(() => {});
  };

  const handleUndoDismiss = () => {
    if (!recentlyDismissed) return;
    const nextSet = new Set(dismissedIds);
    nextSet.delete(recentlyDismissed.id);
    setDismissedIds(nextSet);
    try {
      localStorage.setItem("jobsniper_dismissed_job_ids", JSON.stringify(Array.from(nextSet)));
    } catch {}
    setJobs((prev) => [recentlyDismissed, ...prev]);
    setTotal((prev) => prev + 1);
    const restoredTitle = recentlyDismissed.title;
    setRecentlyDismissed(null);
    setToastMessage(`✓ Restored "${restoredTitle.slice(0, 45)}…" back to feed.`);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleRestoreAllDismissed = () => {
    setDismissedIds(new Set());
    try {
      localStorage.removeItem("jobsniper_dismissed_job_ids");
    } catch {}
    setToastMessage("✓ Restored all dismissed jobs! Reloading feed…");
    fetchJobs();
  };

  const handleResetCrawler = async () => {
    try {
      const res = await fetch("/api/crawler/reset", { method: "POST" });
      const d = await res.json();
      setToastMessage(d.message || "Crawler reset to IDLE");
      setCrawlerRunning(false);
    } catch (e: any) {
      setToastMessage(`⚠️ Reset error: ${e.message}`);
    }
  };

  const handleSyncIndia = async () => {
    setSyncingIndia(true);
    setToastMessage("⏳ Ingesting latest jobs across India (LinkedIn, tech startups & Indian engineering centers)…");
    try {
      const res = await fetch("/api/jobs/sync-india", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setToastMessage(`✓ ${data.message || `Ingested new Indian tech jobs!`}`);
        setTimeout(() => setToastMessage(null), 7000);
        await fetchJobs();
      } else {
        setToastMessage(`⚠️ Sync notice: ${data.error || "Unable to sync right now"}`);
        setTimeout(() => setToastMessage(null), 6000);
      }
    } catch (err: any) {
      setToastMessage(`⚠️ Sync error: ${err.message}`);
      setTimeout(() => setToastMessage(null), 6000);
    } finally {
      setSyncingIndia(false);
    }
  };

  const handleApply = async (job: Job) => {
    setApplyingId(job.id);
    try {
      const res = await fetch("/api/jobs/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: job.id,
          action: "mark_applied",
        }),
      });
      if (res.ok) {
        setJobs((prev) =>
          prev.map((j) => (j.id === job.id ? { ...j, status: "APPLIED" } : j))
        );
        setToastMessage(`✓ Applied! "${job.title}" added to Applied Jobs`);
        setTimeout(() => setToastMessage(null), 6000);
        window.open(job.url, "_blank");
      }
    } finally {
      setApplyingId(null);
    }
  };

  // Fetch companies list once on mount
  useEffect(() => {
    fetch("/api/companies?light=true")
      .then((res) => res.json())
      .then((data) => setCompanies(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (statusFilter) params.set("status", statusFilter);
    if (companyFilter) params.set("company", companyFilter);
    if (search.trim()) params.set("search", search.trim());
    if (selectedRoles.length > 0) params.set("roles", selectedRoles.join(","));
    if (selectedExps.length > 0) params.set("experience", selectedExps.join(","));
    if (indiaOnly) params.set("indiaOnly", "true");
    // Strict Section Separation:
    if (activeSection === "linkedin") {
      params.set("withinHours", "10");
      params.set("linkedinOnly", "true");
    } else {
      params.set("excludeLinkedin", "true");
    }

    if (dismissedIds.size > 0) {
      params.set("dismissedIds", Array.from(dismissedIds).slice(0, 50).join(","));
    }

    if (salaryMode !== "all") {
      params.set("salaryMode", salaryMode);
      if (customMin) {
        if (salaryMode === "lpa") params.set("minLpa", customMin);
        if (salaryMode === "monthly") params.set("minMonthly", customMin);
      }
      if (customMax) {
        if (salaryMode === "lpa") params.set("maxLpa", customMax);
        if (salaryMode === "monthly") params.set("maxMonthly", customMax);
      }
      if (includeUnspecified) {
        params.set("includeUnspecified", "true");
      } else {
        params.set("salaryOnly", "true");
      }
    }

    try {
      const res = await fetch(`/api/jobs?${params}`);
      const jobsData = await res.json();
      setJobs(jobsData.jobs ?? []);
      setTotal(jobsData.total ?? 0);
    } catch {/* ignore */}
    finally { setLoading(false); }
  }, [page, statusFilter, companyFilter, search, selectedRoles, selectedExps, indiaOnly, activeSection, dismissedIds, salaryMode, customMin, customMax, includeUnspecified]);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  const triggerWebCrawler = async () => {
    setCrawlerRunning(true);
    setToastMessage(`🕷️ Launching Web Crawler (${crawlerSource}, max ${crawlerMaxHours}h)...`);
    try {
      const res = await fetch("/api/crawler/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: crawlerSource,
          maxHoursAgo: crawlerMaxHours,
          batchSize: 8,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setToastMessage(`⚠️ Crawler notice: ${data.error || "Unable to start"}`);
      } else {
        setToastMessage(`🚀 ${data.message || "Web Crawler actively running: streaming logs..."}`);
      }
    } catch (e: any) {
      setToastMessage(`⚠️ Crawler error: ${e.message}`);
    }
  };

  useEffect(() => {
    let interval: any;
    if (showCrawlerModal || crawlerRunning) {
      const checkCrawlerStatus = async () => {
        try {
          const res = await fetch("/api/crawler/status");
          if (res.ok) {
            const data = await res.json();
            setCrawlerStatus(data);
            const stillRunning = Boolean(data.isRunning);
            if (crawlerRunning && !stillRunning) {
              setToastMessage(`✓ Web Crawl complete! Discovered ${data.jobsFound || 0} jobs, ingested ${data.jobsIngested || 0}.`);
              fetchJobs();
            }
            setCrawlerRunning(stillRunning);
          }
        } catch {}
      };
      checkCrawlerStatus();
      interval = setInterval(checkCrawlerStatus, 2000);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [showCrawlerModal, crawlerRunning, fetchJobs]);

  const toggleRole = (id: string) => {
    setPage(1);
    setSelectedRoles((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]
    );
  };

  const toggleExp = (id: string) => {
    setPage(1);
    setSelectedExps((prev) =>
      prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]
    );
  };

  const clearFilters = () => {
    setSelectedRoles([]);
    setSelectedExps([]);
    setIndiaOnly(false);
    setSalaryMode("all");
    setCustomMin("");
    setCustomMax("");
    setIncludeUnspecified(false);
    setSearch("");
    setStatusFilter("");
    setCompanyFilter("");
    setPage(1);
  };

  const filtered = jobs.filter((j) => {
    // 1. Expired / Not Useful / Dismissed check
    if (isJobExpiredOrNotUseful(j, dismissedIds)) {
      return false;
    }

    // 2. Strict Section Separation:
    const isLI = isLinkedInJob(j);
    if (activeSection === "linkedin") {
      if (!isLI) return false;
      const timeInfo = formatRelativeTime(j.postedAt || j.firstSeenAt);
      if (timeInfo.hoursAgo > 10.5) return false;
    } else {
      // In the "Direct & ATS Jobs" section: STRICTLY ZERO LinkedIn jobs!
      if (isLI) return false;
    }

    const title = j.title.toLowerCase();
    const company = j.company.name.toLowerCase();

    // Text search
    if (search && !title.includes(search.toLowerCase()) && !company.includes(search.toLowerCase())) {
      return false;
    }

    // India Only check
    if (indiaOnly && !isIndiaLocation(j.location, j.title)) {
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
    if (salaryMode !== "all" || customMin || customMax) {
      const salary = j.salary?.displayString ? j.salary : parseSalary(`${j.title} ${j.description || ""}`);
      const minVal = customMin ? parseFloat(customMin) : undefined;
      const maxVal = customMax ? parseFloat(customMax) : undefined;

      const matchesSal = matchesSalaryFilter(salary, {
        mode: salaryMode,
        minLpa: salaryMode === "lpa" ? minVal : undefined,
        maxLpa: salaryMode === "lpa" ? maxVal : undefined,
        minMonthly: salaryMode === "monthly" ? minVal : undefined,
        maxMonthly: salaryMode === "monthly" ? maxVal : undefined,
        includeUnspecified: includeUnspecified,
      });
      if (!matchesSal) return false;
    }

    return true;
  });

  const totalPages = Math.ceil(total / limit);
  const hasActiveFilters =
    selectedRoles.length > 0 ||
    selectedExps.length > 0 ||
    indiaOnly ||
    salaryMode !== "all" ||
    Boolean(customMin) ||
    Boolean(customMax) ||
    search.length > 0 ||
    Boolean(statusFilter) ||
    Boolean(companyFilter);

  return (
    <div style={{ maxWidth: 1400 }}>
      {/* Toast Alert Banner */}
      {toastMessage && (
        <div
          style={{
            marginBottom: "1rem",
            padding: "0.65rem 1rem",
            borderRadius: "0.5rem",
            background: toastMessage.includes("⚠️") ? "rgba(239, 68, 68, 0.15)" : "rgba(16, 185, 129, 0.15)",
            border: toastMessage.includes("⚠️") ? "1px solid rgba(239, 68, 68, 0.3)" : "1px solid rgba(16, 185, 129, 0.3)",
            color: toastMessage.includes("⚠️") ? "#ef4444" : "#10b981",
            fontSize: "0.8125rem",
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span>{toastMessage}</span>
          <button
            onClick={() => setToastMessage(null)}
            style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: "0.875rem" }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem", flexWrap: "wrap", gap: "0.75rem" }}>
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem" }}>Jobs Feed</h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>
            {total.toLocaleString()} total jobs detected · Showing {filtered.length} matching your active filters
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
          {/* Autonomous Web Crawler Control Button */}
          <button
            id="open-web-crawler"
            onClick={() => setShowCrawlerModal(true)}
            className="btn btn-sm"
            style={{
              fontSize: "0.75rem",
              display: "flex",
              alignItems: "center",
              gap: "0.35rem",
              background: "linear-gradient(135deg, rgba(99, 102, 241, 0.22), rgba(168, 85, 247, 0.22))",
              border: "1px solid rgba(168, 85, 247, 0.4)",
              color: "#c084fc",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            <span>🕷️</span>
            <span>Web Crawler</span>
            {crawlerRunning && (
              <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: "#10b981", animation: "spin 1s linear infinite" }} />
            )}
          </button>

          {/* Real-time India Job Stream Ingestion Button */}
          <button
            id="sync-india-jobs"
            onClick={handleSyncIndia}
            disabled={syncingIndia}
            className="btn btn-sm"
            style={{
              fontSize: "0.75rem",
              display: "flex",
              alignItems: "center",
              gap: "0.35rem",
              background: "linear-gradient(135deg, rgba(249, 115, 22, 0.2), rgba(16, 185, 129, 0.2))",
              border: "1px solid rgba(249, 115, 22, 0.4)",
              color: "var(--text-primary)",
              fontWeight: 600,
              cursor: syncingIndia ? "not-allowed" : "pointer",
            }}
          >
            <RefreshCw
              size={13}
              style={{
                animation: syncingIndia ? "spin 1s linear infinite" : "none",
                color: "#ea580c",
              }}
            />
            <span>🇮🇳 {syncingIndia ? "Ingesting India Jobs…" : "Fetch Latest India Jobs"}</span>
          </button>

          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="btn btn-ghost btn-sm"
              style={{ color: "var(--red)", fontSize: "0.75rem", display: "flex", alignItems: "center", gap: "0.25rem" }}
            >
              <X size={12} /> Clear Filters
            </button>
          )}
          <button id="refresh-jobs" className="btn btn-ghost btn-sm" onClick={fetchJobs} disabled={loading}>
            <RefreshCw size={14} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
            Refresh
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </button>
        </div>
      </div>

      {/* Primary Section Switcher: Direct & ATS Jobs vs LinkedIn Fast-Track */}
      <div
        style={{
          display: "flex",
          gap: "0.75rem",
          marginBottom: "1.25rem",
          borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
          paddingBottom: "0.875rem",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <button
          id="section-ats-jobs"
          onClick={() => { setActiveSection("other"); setPage(1); }}
          className="btn"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.6rem",
            padding: "0.6rem 1.25rem",
            borderRadius: "0.5rem",
            background: activeSection === "other"
              ? "linear-gradient(135deg, rgba(99, 102, 241, 0.25), rgba(168, 85, 247, 0.2))"
              : "var(--bg-secondary)",
            border: activeSection === "other"
              ? "1.5px solid #6366f1"
              : "1px solid var(--border)",
            color: activeSection === "other" ? "#ffffff" : "var(--text-secondary)",
            boxShadow: activeSection === "other" ? "0 0 15px rgba(99, 102, 241, 0.25)" : "none",
            cursor: "pointer",
            fontWeight: activeSection === "other" ? 700 : 500,
            fontSize: "0.875rem",
            transition: "all 0.15s ease",
          }}
        >
          <Building2 size={16} color={activeSection === "other" ? "#818cf8" : "currentColor"} />
          <span>💼 Direct & ATS Jobs</span>
          <span
            style={{
              fontSize: "0.7rem",
              padding: "0.15rem 0.5rem",
              borderRadius: "9999px",
              background: activeSection === "other" ? "#6366f1" : "rgba(255,255,255,0.08)",
              color: "#ffffff",
              fontWeight: 700,
            }}
          >
            {activeSection === "other" ? `${total.toLocaleString()} Active` : "Strictly No LinkedIn"}
          </span>
        </button>

        <button
          id="section-linkedin-jobs"
          onClick={() => { setActiveSection("linkedin"); setPage(1); }}
          className="btn"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.6rem",
            padding: "0.6rem 1.25rem",
            borderRadius: "0.5rem",
            background: activeSection === "linkedin"
              ? "linear-gradient(135deg, rgba(14, 165, 233, 0.25), rgba(6, 182, 212, 0.2))"
              : "var(--bg-secondary)",
            border: activeSection === "linkedin"
              ? "1.5px solid #0ea5e9"
              : "1px solid var(--border)",
            color: activeSection === "linkedin" ? "#38bdf8" : "var(--text-secondary)",
            boxShadow: activeSection === "linkedin" ? "0 0 15px rgba(14, 165, 233, 0.3)" : "none",
            cursor: "pointer",
            fontWeight: activeSection === "linkedin" ? 700 : 500,
            fontSize: "0.875rem",
            transition: "all 0.15s ease",
          }}
        >
          <Zap size={16} color={activeSection === "linkedin" ? "#38bdf8" : "currentColor"} />
          <span>⚡ LinkedIn Fast-Track (&lt;10h)</span>
          <span
            style={{
              fontSize: "0.7rem",
              padding: "0.15rem 0.5rem",
              borderRadius: "9999px",
              background: activeSection === "linkedin" ? "#0284c7" : "rgba(14, 165, 233, 0.15)",
              color: "#ffffff",
              fontWeight: 700,
            }}
          >
            {activeSection === "linkedin" ? `${total.toLocaleString()} Fresh` : "LinkedIn Only"}
          </span>
        </button>

        {dismissedIds.size > 0 && (
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
              🗑️ {dismissedIds.size} removed (expired/not useful)
            </span>
            <button
              onClick={handleRestoreAllDismissed}
              className="btn btn-ghost btn-sm"
              style={{ fontSize: "0.75rem", color: "var(--text-secondary)", textDecoration: "underline" }}
              title="Restore all hidden/dismissed jobs back into feed"
            >
              Restore All
            </button>
          </div>
        )}
      </div>

      {/* Combination Filters Card */}
      <div className="card" style={{ marginBottom: "1rem", padding: "0.875rem" }}>
        <div style={{ display: "flex", gap: "0.75rem", marginBottom: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
            <Search size={14} style={{ position: "absolute", left: "0.625rem", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
            <input
              id="jobs-search"
              className="input"
              placeholder="Search by job title or company…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              style={{ paddingLeft: "2rem", height: "2.1rem", fontSize: "0.8125rem" }}
            />
          </div>

          {/* India Only Toggle Button */}
          <button
            id="filter-india-only"
            type="button"
            onClick={() => { setIndiaOnly((prev) => !prev); setPage(1); }}
            className="btn btn-sm"
            style={{
              height: "2.1rem",
              fontSize: "0.8125rem",
              display: "flex",
              alignItems: "center",
              gap: "0.35rem",
              borderRadius: "0.375rem",
              padding: "0 0.75rem",
              background: indiaOnly ? "rgba(16, 185, 129, 0.2)" : "var(--bg-secondary)",
              color: indiaOnly ? "#10b981" : "var(--text-secondary)",
              border: indiaOnly ? "1.5px solid #10b981" : "1px solid var(--border)",
              fontWeight: indiaOnly ? 700 : 500,
              boxShadow: indiaOnly ? "0 0 10px rgba(16, 185, 129, 0.25)" : "none",
              cursor: "pointer",
            }}
          >
            <span>🇮🇳</span>
            <span>India Only</span>
            {indiaOnly && <Check size={13} style={{ marginLeft: "0.2rem" }} />}
          </button>

          {/* Section Indicator Badge */}
          {activeSection === "linkedin" ? (
            <span
              style={{
                height: "2.1rem",
                fontSize: "0.8125rem",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.35rem",
                borderRadius: "0.375rem",
                padding: "0 0.75rem",
                background: "rgba(14, 165, 233, 0.15)",
                color: "#38bdf8",
                border: "1.5px solid #0ea5e9",
                fontWeight: 600,
              }}
            >
              <span>⚡</span>
              <span>LinkedIn Only (&lt;10h)</span>
            </span>
          ) : (
            <span
              style={{
                height: "2.1rem",
                fontSize: "0.8125rem",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.35rem",
                borderRadius: "0.375rem",
                padding: "0 0.75rem",
                background: "rgba(99, 102, 241, 0.15)",
                color: "#a5b4fc",
                border: "1px solid rgba(99, 102, 241, 0.35)",
                fontWeight: 500,
              }}
            >
              <span>💼</span>
              <span>Direct/ATS (No LinkedIn)</span>
            </span>
          )}

          <select
            id="status-filter"
            className="input"
            style={{ width: "auto", minWidth: 150, height: "2.1rem", fontSize: "0.8125rem" }}
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          >
            <option value="">All Statuses</option>
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>{statusBadge[s]?.label ?? s}</option>
            ))}
          </select>
          <select
            id="company-filter"
            className="input"
            style={{ width: "auto", minWidth: 150, height: "2.1rem", fontSize: "0.8125rem" }}
            value={companyFilter}
            onChange={(e) => { setCompanyFilter(e.target.value); setPage(1); }}
          >
            <option value="">All Companies</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
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

        {/* Interactive Custom Salary Filter Box */}
        <div
          style={{
            marginTop: "0.5rem",
            padding: "0.75rem",
            background: "rgba(255, 255, 255, 0.02)",
            border: "1px solid var(--border)",
            borderRadius: "0.5rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.5rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
              <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)", minWidth: 80 }}>
                Salary Box:
              </span>
              {/* Unit Switcher */}
              <div style={{ display: "inline-flex", background: "var(--bg-secondary)", borderRadius: "0.375rem", padding: "0.15rem", border: "1px solid var(--border)" }}>
                <button
                  type="button"
                  onClick={() => { setSalaryMode("all"); setCustomMin(""); setCustomMax(""); setPage(1); }}
                  style={{
                    padding: "0.18rem 0.55rem",
                    fontSize: "0.75rem",
                    borderRadius: "0.25rem",
                    border: "none",
                    background: salaryMode === "all" ? "var(--accent)" : "transparent",
                    color: salaryMode === "all" ? "#fff" : "var(--text-secondary)",
                    fontWeight: salaryMode === "all" ? 600 : 400,
                    cursor: "pointer",
                  }}
                >
                  💰 Any Salary
                </button>
                <button
                  type="button"
                  onClick={() => { setSalaryMode("monthly"); setPage(1); }}
                  style={{
                    padding: "0.18rem 0.55rem",
                    fontSize: "0.75rem",
                    borderRadius: "0.25rem",
                    border: "none",
                    background: salaryMode === "monthly" ? "var(--green)" : "transparent",
                    color: salaryMode === "monthly" ? "#000" : "var(--text-secondary)",
                    fontWeight: salaryMode === "monthly" ? 600 : 400,
                    cursor: "pointer",
                  }}
                >
                  📅 Monthly (₹ / mo)
                </button>
                <button
                  type="button"
                  onClick={() => { setSalaryMode("lpa"); setPage(1); }}
                  style={{
                    padding: "0.18rem 0.55rem",
                    fontSize: "0.75rem",
                    borderRadius: "0.25rem",
                    border: "none",
                    background: salaryMode === "lpa" ? "var(--yellow)" : "transparent",
                    color: salaryMode === "lpa" ? "#000" : "var(--text-secondary)",
                    fontWeight: salaryMode === "lpa" ? 600 : 400,
                    cursor: "pointer",
                  }}
                >
                  📈 Annual (₹ LPA)
                </button>
              </div>
            </div>

            {/* Include Unspecified Salaries Toggle */}
            <label style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.75rem", color: "var(--text-secondary)", cursor: "pointer", userSelect: "none" }}>
              <input
                type="checkbox"
                checked={includeUnspecified}
                onChange={(e) => { setIncludeUnspecified(e.target.checked); setPage(1); }}
                style={{ accentColor: "var(--accent)", cursor: "pointer" }}
              />
              Include Unspecified Salaries
            </label>
          </div>

          {/* Custom Range Inputs & Presets (when Monthly or LPA is active) */}
          {salaryMode !== "all" && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap", paddingTop: "0.35rem", borderTop: "1px dashed var(--border)" }}>
              {/* Range Inputs */}
              <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 500 }}>
                  {salaryMode === "monthly" ? "Min ₹/mo:" : "Min LPA:"}
                </span>
                <input
                  type="number"
                  placeholder={salaryMode === "monthly" ? "e.g. 25000" : "e.g. 5"}
                  value={customMin}
                  onChange={(e) => { setCustomMin(e.target.value); setPage(1); }}
                  className="input"
                  style={{ width: "6.2rem", height: "1.85rem", fontSize: "0.75rem", padding: "0.2rem 0.45rem" }}
                />
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>to</span>
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 500 }}>
                  {salaryMode === "monthly" ? "Max ₹/mo:" : "Max LPA:"}
                </span>
                <input
                  type="number"
                  placeholder={salaryMode === "monthly" ? "e.g. 80000" : "e.g. 15"}
                  value={customMax}
                  onChange={(e) => { setCustomMax(e.target.value); setPage(1); }}
                  className="input"
                  style={{ width: "6.2rem", height: "1.85rem", fontSize: "0.75rem", padding: "0.2rem 0.45rem" }}
                />
              </div>

              {/* Quick Presets */}
              <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", flexWrap: "wrap" }}>
                <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginRight: "0.2rem" }}>Quick Ranges:</span>
                {salaryMode === "monthly" ? (
                  <>
                    {[
                      { label: "₹15k–30k", min: "15000", max: "30000" },
                      { label: "₹30k–60k", min: "30000", max: "60000" },
                      { label: "₹60k–1L", min: "60000", max: "100000" },
                      { label: "₹1L+", min: "100000", max: "" },
                    ].map((p) => {
                      const active = customMin === p.min && customMax === p.max;
                      return (
                        <button
                          key={p.label}
                          type="button"
                          onClick={() => { setCustomMin(p.min); setCustomMax(p.max); setPage(1); }}
                          className="btn btn-sm"
                          style={{
                            padding: "0.1rem 0.45rem",
                            fontSize: "0.7rem",
                            borderRadius: "0.25rem",
                            background: active ? "var(--green)" : "var(--bg-secondary)",
                            color: active ? "#000" : "var(--text-secondary)",
                            border: active ? "1px solid var(--green)" : "1px solid var(--border)",
                            fontWeight: active ? 600 : 400,
                          }}
                        >
                          {p.label}
                        </button>
                      );
                    })}
                  </>
                ) : (
                  <>
                    {[
                      { label: "3–6 LPA", min: "3", max: "6" },
                      { label: "6–12 LPA", min: "6", max: "12" },
                      { label: "12–25 LPA", min: "12", max: "25" },
                      { label: "25+ LPA", min: "25", max: "" },
                    ].map((p) => {
                      const active = customMin === p.min && customMax === p.max;
                      return (
                        <button
                          key={p.label}
                          type="button"
                          onClick={() => { setCustomMin(p.min); setCustomMax(p.max); setPage(1); }}
                          className="btn btn-sm"
                          style={{
                            padding: "0.1rem 0.45rem",
                            fontSize: "0.7rem",
                            borderRadius: "0.25rem",
                            background: active ? "var(--yellow)" : "var(--bg-secondary)",
                            color: active ? "#000" : "var(--text-secondary)",
                            border: active ? "1px solid var(--yellow)" : "1px solid var(--border)",
                            fontWeight: active ? 600 : 400,
                          }}
                        >
                          {p.label}
                        </button>
                      );
                    })}
                  </>
                )}

                {(customMin || customMax) && (
                  <button
                    type="button"
                    onClick={() => { setCustomMin(""); setCustomMax(""); setPage(1); }}
                    className="btn btn-ghost btn-sm"
                    style={{ padding: "0.1rem 0.4rem", fontSize: "0.7rem", color: "var(--red)" }}
                  >
                    ✕ Reset Range
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Job & Matched Role</th>
              <th>Company</th>
              <th>Location</th>
              <th>Status</th>
              <th>Match Score</th>
              <th>Matched Resume</th>
              <th>Detected</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} style={{ textAlign: "center", padding: "2.5rem", color: "var(--text-muted)" }}>
                  <RefreshCw size={16} style={{ animation: "spin 1s linear infinite", display: "inline" }} />
                  {" "}Loading…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: "center", padding: "2.5rem", color: "var(--text-muted)" }}>
                  No jobs found matching your combination filters. Try toggling other roles, experience, or salary filters.
                </td>
              </tr>
            ) : filtered.map((job) => {
              const badge = statusBadge[job.status] ?? { cls: "badge-gray", label: job.status };
              const app = job.applications?.[0];
              const score = app?.matchScore;
              const scoreColor = score == null ? "" : score >= 80 ? "var(--green)" : score >= 60 ? "var(--yellow)" : "var(--red)";
              const { roles, exps, salary } = getDetectedBadges(job);

              return (
                <tr key={job.id}>
                  <td style={{ maxWidth: 320 }}>
                    <div style={{ fontWeight: 600, fontSize: "0.875rem", marginBottom: "0.35rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {job.title}
                    </div>
                    <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap", alignItems: "center" }}>
                      {roles.map((r) => (
                        <span key={r} className="badge badge-accent" style={{ fontSize: "0.65rem", padding: "0.1rem 0.35rem" }}>
                          {r}
                        </span>
                      ))}
                      {exps.map((e) => (
                        <span key={e} className="badge badge-purple" style={{ fontSize: "0.65rem", padding: "0.1rem 0.35rem" }}>
                          {e}
                        </span>
                      ))}
                      {salary?.displayString ? (
                        <span className="badge badge-green" style={{ fontSize: "0.6875rem", padding: "0.15rem 0.45rem", fontWeight: 600 }}>
                          💵 {salary.displayString}
                        </span>
                      ) : (
                        <span className="badge badge-gray" style={{ fontSize: "0.6875rem", padding: "0.15rem 0.45rem", opacity: 0.7 }}>
                          🏷️ Salary Unspecified
                        </span>
                      )}
                    </div>
                  </td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                      <Building2 size={13} style={{ color: "var(--text-muted)" }} />
                      <span style={{ fontWeight: 500 }}>{job.company.name}</span>
                    </div>
                    <span className="badge mono" style={{ fontSize: "0.6rem", marginTop: "0.25rem" }}>
                      {job.atsType}
                    </span>
                  </td>
                  <td style={{ color: "var(--text-secondary)", fontSize: "0.8125rem" }}>
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
                  <td>
                    <span className={`badge ${badge.cls}`}>{badge.label}</span>
                    {job.filterReason && (
                      <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
                        {job.filterReason.slice(0, 45)}…
                      </div>
                    )}
                  </td>
                  <td>
                    {score != null ? (
                      <span style={{ fontWeight: 600, color: scoreColor }}>
                        {Math.round(score)}%
                      </span>
                    ) : (
                      <span style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>–</span>
                    )}
                  </td>
                  <td style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                    {app?.resume?.label ? `📄 ${app.resume.label}` : "–"}
                  </td>
                  <td style={{ fontSize: "0.8125rem" }}>
                    {(() => {
                      const timeInfo = formatRelativeTime(job.postedAt || job.firstSeenAt);
                      const isLI = isLinkedInJob(job);
                      return (
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "0.2rem",
                                fontWeight: timeInfo.isWithin10h ? 700 : 500,
                                fontSize: "0.75rem",
                                color: timeInfo.isWithin10h ? "#0ea5e9" : "var(--text-secondary)",
                                background: timeInfo.isWithin10h ? "rgba(14, 165, 233, 0.12)" : "transparent",
                                padding: timeInfo.isWithin10h ? "0.1rem 0.35rem" : "0",
                                borderRadius: "0.25rem",
                                border: timeInfo.isWithin10h ? "1px solid rgba(14, 165, 233, 0.3)" : "none",
                              }}
                            >
                              {timeInfo.isWithin10h ? "⚡ " : "🕒 "}
                              {timeInfo.text}
                            </span>
                            {isLI && (
                              <span
                                style={{
                                  fontSize: "0.625rem",
                                  padding: "0.08rem 0.3rem",
                                  borderRadius: "0.25rem",
                                  background: "rgba(10, 102, 194, 0.2)",
                                  color: "#60a5fa",
                                  border: "1px solid rgba(10, 102, 194, 0.4)",
                                  fontWeight: 600,
                                }}
                              >
                                in
                              </span>
                            )}
                          </div>
                          <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
                            {new Date(job.postedAt || job.firstSeenAt).toLocaleDateString()}
                          </span>
                        </div>
                      );
                    })()}
                  </td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                      {job.status === "APPLIED" ? (
                        <Link
                          href="/applied"
                          className="badge badge-green"
                          style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "0.25rem", padding: "0.25rem 0.5rem" }}
                          title="View in Applied Jobs"
                        >
                          <CheckCircle2 size={12} /> Applied
                        </Link>
                      ) : (
                        <button
                          onClick={() => handleApply(job)}
                          disabled={applyingId === job.id}
                          className="btn btn-secondary btn-sm"
                          style={{ fontSize: "0.75rem", padding: "0.2rem 0.55rem", whiteSpace: "nowrap" }}
                          title="Apply to this job and track in Applied Jobs"
                        >
                          <Check size={12} style={{ color: "var(--green)" }} />
                          {applyingId === job.id ? "Saving…" : "Apply"}
                        </button>
                      )}
                      <a href={job.url} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm" style={{ padding: "0.3rem" }} title="Open job posting">
                        <ExternalLink size={12} />
                      </a>
                      <button
                        id={`dismiss-job-${job.id}`}
                        onClick={(e) => handleDismissJob(job, e)}
                        className="btn btn-ghost btn-sm"
                        style={{ padding: "0.3rem", color: "var(--text-muted)", transition: "color 0.15s ease" }}
                        title="Remove from rendered list (Expired / Not useful)"
                        aria-label={`Remove ${job.title} from feed`}
                        onMouseEnter={(e) => { e.currentTarget.style.color = "#ef4444"; e.currentTarget.style.background = "rgba(239, 68, 68, 0.12)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.background = "transparent"; }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", gap: "0.5rem", marginTop: "1.5rem" }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            ← Previous
          </button>
          <span style={{ display: "flex", alignItems: "center", fontSize: "0.875rem", color: "var(--text-secondary)", padding: "0 0.5rem" }}>
            Page {page} of {totalPages}
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

      {/* Web Crawler Control Modal */}
      {showCrawlerModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.78)",
            backdropFilter: "blur(8px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 99999,
            padding: "1rem",
            animation: "fadeIn 0.2s ease-out",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowCrawlerModal(false);
          }}
        >
          <div
            className="card"
            style={{
              width: "100%",
              maxWidth: 860,
              maxHeight: "90vh",
              display: "flex",
              flexDirection: "column",
              background: "#0d1117",
              border: "1px solid rgba(168, 85, 247, 0.35)",
              boxShadow: "0 20px 60px rgba(0, 0, 0, 0.8), 0 0 30px rgba(168, 85, 247, 0.2)",
              borderRadius: "0.75rem",
              overflow: "hidden",
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: "1rem 1.25rem",
                borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(168, 85, 247, 0.15))",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                <span style={{ fontSize: "1.5rem" }}>🕷️</span>
                <div>
                  <h2 style={{ fontSize: "1.1rem", fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    Autonomous Web Crawler Engine
                    {crawlerRunning ? (
                      <span className="badge badge-accent" style={{ fontSize: "0.7rem", animation: "pulse 1.5s infinite" }}>
                        ● Active Crawling
                      </span>
                    ) : (
                      <span className="badge badge-green" style={{ fontSize: "0.7rem" }}>
                        ● System Ready
                      </span>
                    )}
                  </h2>
                  <p style={{ margin: 0, fontSize: "0.75rem", color: "var(--text-muted)" }}>
                    Direct high-frequency crawler for LinkedIn (&lt;10h), 50+ Unicorn ATS boards & tech aggregators
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowCrawlerModal(false)}
                className="btn btn-ghost btn-sm"
                style={{ padding: "0.25rem 0.5rem", color: "var(--text-muted)", fontSize: "1rem" }}
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: "1.25rem", overflowY: "auto", display: "flex", flexDirection: "column", gap: "1rem" }}>
              {/* Stats Bar */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "0.75rem" }}>
                <div style={{ padding: "0.75rem", background: "rgba(255, 255, 255, 0.03)", borderRadius: "0.5rem", border: "1px solid var(--border)" }}>
                  <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Current State</div>
                  <div style={{ fontSize: "1rem", fontWeight: 700, color: crawlerRunning ? "#38bdf8" : "#10b981", marginTop: "0.2rem" }}>
                    {crawlerRunning ? "🔄 Running Sweep" : "🟢 Standby"}
                  </div>
                </div>
                <div style={{ padding: "0.75rem", background: "rgba(255, 255, 255, 0.03)", borderRadius: "0.5rem", border: "1px solid var(--border)" }}>
                  <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Discovered Jobs</div>
                  <div style={{ fontSize: "1rem", fontWeight: 700, color: "#c084fc", marginTop: "0.2rem" }}>
                    {crawlerStatus?.jobsFound ?? 0}
                  </div>
                </div>
                <div style={{ padding: "0.75rem", background: "rgba(255, 255, 255, 0.03)", borderRadius: "0.5rem", border: "1px solid var(--border)" }}>
                  <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Ingested To Database</div>
                  <div style={{ fontSize: "1rem", fontWeight: 700, color: "#10b981", marginTop: "0.2rem" }}>
                    {crawlerStatus?.jobsIngested ?? 0}
                  </div>
                </div>
                <div style={{ padding: "0.75rem", background: "rgba(255, 255, 255, 0.03)", borderRadius: "0.5rem", border: "1px solid var(--border)" }}>
                  <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Autonomous Worker</div>
                  <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "#f59e0b", marginTop: "0.3rem" }}>
                    ⏱️ Every 15 min
                  </div>
                </div>
              </div>

              {/* Crawler Controls */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", padding: "1rem", background: "rgba(255, 255, 255, 0.02)", borderRadius: "0.5rem", border: "1px solid var(--border)" }}>
                <div>
                  <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.4rem", display: "block" }}>
                    Target Crawler Channel:
                  </label>
                  <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                    {[
                      { id: "all", label: "🌐 Full Web Crawl (All Sources)" },
                      { id: "linkedin", label: "⚡ LinkedIn Guest API (<10h Strict)" },
                      { id: "companies", label: "🏢 Top 50+ Tech Unicorn ATS Boards" },
                      { id: "aggregators", label: "📡 Tech Remote Boards (Jobicy/RemoteOK)" },
                    ].map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setCrawlerSource(s.id as any)}
                        disabled={crawlerRunning}
                        className="btn btn-sm"
                        style={{
                          fontSize: "0.75rem",
                          borderRadius: "0.375rem",
                          padding: "0.3rem 0.65rem",
                          background: crawlerSource === s.id ? "var(--accent)" : "var(--bg-secondary)",
                          color: crawlerSource === s.id ? "#fff" : "var(--text-secondary)",
                          border: crawlerSource === s.id ? "1px solid var(--accent)" : "1px solid var(--border)",
                          fontWeight: crawlerSource === s.id ? 600 : 400,
                        }}
                      >
                        {crawlerSource === s.id ? "✓ " : ""}{s.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem", paddingTop: "0.5rem", borderTop: "1px dashed var(--border)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                      Max Age Cutoff:
                    </span>
                    <div style={{ display: "inline-flex", background: "var(--bg-secondary)", borderRadius: "0.375rem", padding: "0.15rem", border: "1px solid var(--border)" }}>
                      {[
                        { hours: 10, label: "⚡ 10 Hours (Strict)" },
                        { hours: 24, label: "🕒 24 Hours" },
                        { hours: 48, label: "📅 48 Hours" },
                      ].map((t) => (
                        <button
                          key={t.hours}
                          type="button"
                          onClick={() => setCrawlerMaxHours(t.hours)}
                          disabled={crawlerRunning}
                          style={{
                            padding: "0.2rem 0.55rem",
                            fontSize: "0.75rem",
                            borderRadius: "0.25rem",
                            border: "none",
                            background: crawlerMaxHours === t.hours ? "var(--purple)" : "transparent",
                            color: crawlerMaxHours === t.hours ? "#fff" : "var(--text-secondary)",
                            fontWeight: crawlerMaxHours === t.hours ? 600 : 400,
                            cursor: crawlerRunning ? "not-allowed" : "pointer",
                          }}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    id="reset-crawl-btn"
                    onClick={handleResetCrawler}
                    className="btn btn-ghost btn-sm"
                    style={{
                      fontSize: "0.75rem",
                      padding: "0.4rem 0.75rem",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.3rem",
                      color: "#f87171",
                      border: "1px solid rgba(239, 68, 68, 0.3)",
                    }}
                    title="Reset crawler status to idle if ever interrupted"
                  >
                    <RotateCcw size={12} />
                    <span>Reset</span>
                  </button>

                  <button
                    id="trigger-crawl-btn"
                    onClick={triggerWebCrawler}
                    disabled={crawlerRunning}
                    className="btn btn-primary"
                    style={{
                      fontSize: "0.8125rem",
                      padding: "0.45rem 1rem",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.4rem",
                      background: "linear-gradient(135deg, #6366f1, #a855f7)",
                      boxShadow: "0 0 15px rgba(168, 85, 247, 0.4)",
                      fontWeight: 700,
                      cursor: crawlerRunning ? "not-allowed" : "pointer",
                    }}
                  >
                    <Play size={14} style={{ fill: "currentColor" }} />
                    <span>{crawlerRunning ? "Crawling in Progress…" : "Start Web Crawl Now"}</span>
                  </button>
                </div>
              </div>

              {/* Terminal Logs Viewport */}
              <div
                style={{
                  background: "#05070d",
                  borderRadius: "0.5rem",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  padding: "0.875rem",
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                  fontSize: "0.75rem",
                  color: "#cbd5e1",
                  maxHeight: 280,
                  overflowY: "auto",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.35rem",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid rgba(255, 255, 255, 0.08)", paddingBottom: "0.4rem", marginBottom: "0.3rem", color: "#64748b" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                    <Terminal size={12} color="#38bdf8" />
                    <span style={{ fontWeight: 600, color: "#38bdf8" }}>LIVE CRAWLER TERMINAL</span>
                  </div>
                  <span>{crawlerStatus?.logs?.length ?? 0} log events</span>
                </div>

                {(!crawlerStatus?.logs || crawlerStatus.logs.length === 0) ? (
                  <div style={{ color: "#64748b", padding: "1.5rem 0", textAlign: "center" }}>
                    Engine standby. The background worker sweeps automatically every 15 minutes.
                    <br />
                    Click <strong style={{ color: "#c084fc" }}>"Start Web Crawl Now"</strong> above to launch an on-demand crawl.
                  </div>
                ) : (
                  crawlerStatus.logs.map((log: any, idx: number) => {
                    const levelColor =
                      log.level === "error" ? "#ef4444" :
                      log.level === "warn" ? "#f59e0b" :
                      log.level === "success" ? "#10b981" : "#94a3b8";
                    const logTime = log.timestamp
                      ? log.timestamp.includes("T")
                        ? new Date(log.timestamp).toLocaleTimeString()
                        : log.timestamp
                      : "";
                    return (
                      <div key={idx} style={{ lineHeight: 1.4, wordBreak: "break-all" }}>
                        <span style={{ color: "#475569", marginRight: "0.4rem" }}>
                          [{logTime}]
                        </span>
                        <span style={{ color: "#a855f7", fontWeight: 600, marginRight: "0.4rem" }}>
                          [{log.source.toUpperCase()}]
                        </span>
                        <span style={{ color: levelColor }}>
                          {log.message}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating Applied / Dismissed Toast Notification */}
      {toastMessage && (
        <div
          style={{
            position: "fixed",
            bottom: "1.5rem",
            right: "1.5rem",
            background: "var(--bg-elevated)",
            border: toastMessage.includes("🗑️") ? "1px solid rgba(239, 68, 68, 0.4)" : "1px solid var(--green)",
            borderRadius: "var(--radius-md)",
            padding: "0.875rem 1.25rem",
            boxShadow: "0 10px 35px rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            gap: "0.875rem",
            zIndex: 9999,
            animation: "fadeIn 0.2s ease-out",
          }}
        >
          <CheckCircle2 size={20} style={{ color: toastMessage.includes("🗑️") ? "#ef4444" : "var(--green)", flexShrink: 0 }} />
          <span style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--text-primary)" }}>
            {toastMessage}
          </span>
          {recentlyDismissed && (
            <button
              onClick={handleUndoDismiss}
              className="btn btn-sm"
              style={{
                fontSize: "0.75rem",
                padding: "0.25rem 0.65rem",
                background: "rgba(255, 255, 255, 0.15)",
                color: "#fff",
                fontWeight: 600,
                whiteSpace: "nowrap",
              }}
            >
              ↩ Undo
            </button>
          )}
          {!recentlyDismissed && (
            <Link
              href="/applied"
              className="btn btn-primary btn-sm"
              style={{ fontSize: "0.75rem", padding: "0.25rem 0.65rem", whiteSpace: "nowrap" }}
            >
              View in Applied Jobs →
            </Link>
          )}
          <button
            onClick={() => { setToastMessage(null); setRecentlyDismissed(null); }}
            className="btn btn-ghost btn-sm"
            style={{ padding: "0.2rem", color: "var(--text-muted)" }}
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
