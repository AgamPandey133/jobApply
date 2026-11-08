"use client";

import { useState, useEffect, useCallback } from "react";
import { Upload, Trash2, Star, StarOff, RefreshCw, Sparkles } from "lucide-react";

interface Resume {
  id: string;
  name: string;
  label: string;
  targetRoles: string[];
  filePath: string;
  isDefault: boolean;
  createdAt: string;
  structuredSummary: {
    skills: string[];
    projects: { name: string; description: string }[];
    strengths: string[];
    experience?: string[];
  };
}

const LABELS = ["Backend", "Frontend", "GenAI/ML", "SDE/DSA", "Full Stack", "Mobile", "DevOps", "Data Science"];

export default function ResumesPage() {
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Form state
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [label, setLabel] = useState("Backend");
  const [roles, setRoles] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const fetchResumes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/resumes");
      const data = await res.json();
      if (Array.isArray(data)) setResumes(data);
    } catch {/* ignore */}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchResumes(); }, [fetchResumes]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !name || !label) return;
    setUploading(true);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("name", name);
      fd.append("label", label);
      fd.append("targetRoles", JSON.stringify(roles.split(",").map((r) => r.trim()).filter(Boolean)));
      fd.append("isDefault", String(isDefault));
      const res = await fetch("/api/resumes", { method: "POST", body: fd });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        setUploadError(errData.error || "Failed to upload and process resume.");
        return;
      }
      setFile(null); setName(""); setRoles(""); setIsDefault(false);
      await fetchResumes();
    } catch (err: any) {
      setUploadError(err.message || "Network error uploading resume.");
    } finally {
      setUploading(false);
    }
  };

  const deleteResume = async (id: string) => {
    if (!confirm("Delete this resume?")) return;
    await fetch(`/api/resumes/${id}`, { method: "DELETE" });
    fetchResumes();
  };

  const setDefault = async (id: string) => {
    await fetch(`/api/resumes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isDefault: true }),
    });
    fetchResumes();
  };

  const labelColors: Record<string, string> = {
    "Backend": "var(--accent)", "Frontend": "var(--blue)", "GenAI/ML": "var(--purple)",
    "SDE/DSA": "var(--green)", "Full Stack": "var(--yellow)", "Mobile": "var(--red)",
    "DevOps": "#06b6d4", "Data Science": "#f97316",
  };

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem" }}>Resumes</h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>
          Upload multiple tailored resumes. The system auto-selects the best match per job.
        </p>
      </div>

      {/* Upload Form */}
      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.375rem" }}>
          <Upload size={16} style={{ color: "var(--accent)" }} /> Upload Resume
        </h2>
        {uploadError && (
          <div style={{
            padding: "0.75rem 1rem",
            borderRadius: "var(--radius-sm)",
            marginBottom: "1rem",
            background: "rgba(239,68,68,0.15)",
            border: "1px solid rgba(239,68,68,0.3)",
            color: "#f87171",
            fontSize: "0.875rem",
          }}>
            ⚠️ {uploadError}
          </div>
        )}
        <form onSubmit={handleUpload}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.875rem", marginBottom: "0.875rem" }}>
            <div className="form-group">
              <label className="label" htmlFor="resume-name">Label / Name</label>
              <input id="resume-name" className="input" placeholder="e.g. Backend SWE 2025" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="label" htmlFor="resume-label">Category</label>
              <select id="resume-label" className="input" value={label} onChange={(e) => setLabel(e.target.value)}>
                {LABELS.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="label" htmlFor="resume-roles">Target Roles (comma-separated)</label>
              <input id="resume-roles" className="input" placeholder="backend engineer, SWE, platform" value={roles} onChange={(e) => setRoles(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="label" htmlFor="resume-file">PDF File</label>
              <input id="resume-file" type="file" accept=".pdf" className="input" style={{ padding: "0.375rem" }} onChange={(e) => setFile(e.target.files?.[0] ?? null)} required />
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <label className="toggle-wrap" htmlFor="resume-default">
              <input id="resume-default" type="checkbox" style={{ display: "none" }} checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
              <div className={`toggle ${isDefault ? "on green" : ""}`} onClick={() => setIsDefault(!isDefault)} />
              <span style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>Set as default resume</span>
            </label>
            <button id="upload-resume-btn" type="submit" className="btn btn-primary" disabled={uploading || !file || !name}>
              {uploading ? (
                <>
                  <Sparkles size={14} style={{ animation: "spin 1s linear infinite" }} />
                  <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                  Processing…
                </>
              ) : (
                <><Upload size={14} /> Upload & Process</>
              )}
            </button>
          </div>
          {uploading && (
            <div style={{ marginTop: "0.75rem", fontSize: "0.8125rem", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Sparkles size={13} style={{ color: "var(--accent)" }} />
              Extracting text, generating embedding, and analyzing resume with Gemini…
            </div>
          )}
        </form>
      </div>

      {/* Resume List */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>
          <RefreshCw size={18} style={{ animation: "spin 1s linear infinite", display: "inline" }} />
        </div>
      ) : resumes.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>
          No resumes uploaded yet. Upload your first resume above.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {resumes.map((r) => {
            const color = labelColors[r.label] ?? "var(--accent)";
            const summary = r.structuredSummary;
            const isExpanded = expanded === r.id;
            return (
              <div key={r.id} className="card">
                <div style={{ display: "flex", alignItems: "flex-start", gap: "1rem" }}>
                  {/* Color indicator */}
                  <div style={{ width: 4, alignSelf: "stretch", borderRadius: "999px", background: color, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem", flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 600, fontSize: "0.9375rem" }}>{r.name}</span>
                      <span className="badge" style={{ background: `${color}20`, color }}>{r.label}</span>
                      {r.isDefault && <span className="badge badge-green">Default</span>}
                    </div>
                    {r.targetRoles.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem", marginBottom: "0.5rem" }}>
                        {r.targetRoles.map((role) => (
                          <span key={role} className="badge badge-gray" style={{ fontSize: "0.68rem" }}>{role}</span>
                        ))}
                      </div>
                    )}
                    {summary?.skills?.length > 0 && (
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                        🛠 {summary.skills.slice(0, 8).join(", ")}
                        {summary.skills.length > 8 && ` +${summary.skills.length - 8} more`}
                      </div>
                    )}
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
                      Added {new Date(r.createdAt).toLocaleDateString()}
                    </div>

                    {/* Expanded summary */}
                    {isExpanded && (
                      <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid var(--border-subtle)" }}>
                        {summary?.strengths?.length > 0 && (
                          <div style={{ marginBottom: "0.75rem" }}>
                            <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.375rem" }}>STRENGTHS</div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem" }}>
                              {summary.strengths.map((s) => <span key={s} className="badge badge-accent" style={{ fontSize: "0.7rem" }}>{s}</span>)}
                            </div>
                          </div>
                        )}
                        {summary?.projects?.length > 0 && (
                          <div style={{ marginBottom: "0.75rem" }}>
                            <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.375rem" }}>PROJECTS</div>
                            {summary.projects.map((p) => (
                              <div key={p.name} style={{ marginBottom: "0.375rem" }}>
                                <span style={{ fontWeight: 500, fontSize: "0.8125rem" }}>{p.name}</span>
                                <span style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}> — {p.description}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {Boolean(summary?.experience && summary.experience.length > 0) && (
                          <div>
                            <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.375rem" }}>EXPERIENCE</div>
                            {summary.experience!.map((e, i) => (
                              <div key={i} style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "0.25rem" }}>• {e}</div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div style={{ display: "flex", gap: "0.375rem", flexShrink: 0 }}>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => setExpanded(isExpanded ? null : r.id)}
                      title="View summary"
                    >
                      {isExpanded ? "Hide" : "Details"}
                    </button>
                    {!r.isDefault && (
                      <button
                        id={`set-default-${r.id}`}
                        className="btn btn-ghost btn-sm"
                        onClick={() => setDefault(r.id)}
                        title="Set as default"
                      >
                        <Star size={13} />
                      </button>
                    )}
                    <button
                      id={`delete-resume-${r.id}`}
                      className="btn btn-danger btn-sm"
                      onClick={() => deleteResume(r.id)}
                      style={{ padding: "0.3rem" }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
