"use client";

import { useState, useEffect, useCallback } from "react";
import { Save, Plus, Trash2, Globe, MapPin, Sparkles, Check, Info } from "lucide-react";

interface Profile {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  linkedinUrl: string;
  githubUrl: string;
  portfolioUrl: string;
  education: { institution: string; degree: string; major: string; gpa?: number; startDate?: string; endDate?: string }[];
  graduationBatch: string;
  workAuthorization: string;
  requireSponsorship: boolean;
  yearsOfExperience: number;
  bio: string;
  skills: string[];
  preferredLocations: string[];
}

interface QAEntry {
  id: string;
  originalQuestion: string;
  answer: string;
  category: string;
  source: string;
  usageCount: number;
}

const CATEGORIES = ["general", "work_auth", "experience", "cultural", "technical"];

const POPULAR_LOCATIONS = [
  "Bengaluru",
  "Hyderabad",
  "Pune",
  "Delhi-NCR",
  "Mumbai",
  "Chennai",
  "Remote (India)",
  "Remote (Worldwide)",
  "San Francisco, CA",
  "New York, NY",
];

const POPULAR_SKILLS = [
  "Python",
  "Go",
  "Java",
  "Spring Boot",
  "TypeScript",
  "React",
  "Next.js",
  "Node.js",
  "FastAPI",
  "PostgreSQL",
  "Docker",
  "Kubernetes",
  "AWS",
  "Redis",
  "System Design",
  "GenAI / LLMs",
];

const STANDARD_WORK_AUTHS = [
  "Indian Citizen (No visa sponsorship required in India)",
  "Authorized to work in India (Citizen / OCI / PIO)",
  "Living in India (Open to India & Global Remote)",
  "Authorized to work in US without sponsorship",
  "US Citizen",
  "Permanent Resident (Green Card)",
  "OPT / STEM OPT",
  "H1B Visa",
  "Requires US Visa Sponsorship",
  "Authorized for Worldwide Remote (Contractor / EOR)",
  "Authorized to work in Canada",
  "Authorized to work in UK / Europe",
  "Requires Visa Sponsorship",
];

const INDIAN_PRESETS = [
  {
    originalQuestion: "Are you legally authorized to work in India?",
    answer: "Yes, I am an Indian citizen with full, unrestricted legal work authorization in India.",
    category: "work_auth",
  },
  {
    originalQuestion: "Will you now or in the future require visa sponsorship to work in India?",
    answer: "No, I do not require any visa sponsorship or work permit in India.",
    category: "work_auth",
  },
  {
    originalQuestion: "What is your current notice period / how soon can you join?",
    answer: "Immediate to 30 days (negotiable / can join promptly).",
    category: "general",
  },
  {
    originalQuestion: "What is your current and expected CTC / compensation?",
    answer: "Open to industry standard compensation and negotiable based on role requirements and total package.",
    category: "general",
  },
  {
    originalQuestion: "Are you willing to relocate to Bengaluru, Hyderabad, Pune, NCR, or other locations in India?",
    answer: "Yes, I am fully open to relocating to major tech hubs across India.",
    category: "general",
  },
  {
    originalQuestion: "What is your nationality / citizenship?",
    answer: "Indian",
    category: "work_auth",
  },
  {
    originalQuestion: "Are you comfortable with a hybrid or in-office work schedule?",
    answer: "Yes, I am comfortable with both hybrid and in-office work setups as per company policy.",
    category: "cultural",
  },
  {
    originalQuestion: "Are you legally authorized to work in the country where this position is located?",
    answer: "Yes",
    category: "work_auth",
  },
];

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile>({
    fullName: "", email: "", phone: "", location: "",
    linkedinUrl: "", githubUrl: "", portfolioUrl: "",
    education: [{ institution: "", degree: "", major: "", gpa: undefined, startDate: "", endDate: "" }],
    graduationBatch: "", workAuthorization: "Indian Citizen (No visa sponsorship required in India)",
    requireSponsorship: false, yearsOfExperience: 0, bio: "", skills: [], preferredLocations: [],
  });
  const [isCustomAuth, setIsCustomAuth] = useState(false);
  const [customAuthText, setCustomAuthText] = useState("");
  const [qaEntries, setQaEntries] = useState<QAEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState<"profile" | "qa">("profile");
  const [skillsInput, setSkillsInput] = useState("");
  const [locationsInput, setLocationsInput] = useState("");
  const [qaFilter, setQaFilter] = useState("");
  const [qaCategoryFilter, setQaCategoryFilter] = useState<string>("ALL");
  const [addingPresets, setAddingPresets] = useState(false);

  // New Q&A form
  const [newQ, setNewQ] = useState("");
  const [newA, setNewA] = useState("");
  const [newCat, setNewCat] = useState("general");
  const [addingQA, setAddingQA] = useState(false);

  const fetchData = useCallback(async () => {
    const [profileRes, qaRes] = await Promise.all([
      fetch("/api/profile"),
      fetch("/api/qa-bank"),
    ]);
    const profileData = await profileRes.json();
    const qaData = await qaRes.json();
    if (profileData) {
      setProfile(profileData);
      setSkillsInput(profileData.skills?.join(", ") ?? "");
      setLocationsInput(profileData.preferredLocations?.join(", ") ?? "");

      if (profileData.workAuthorization && !STANDARD_WORK_AUTHS.includes(profileData.workAuthorization)) {
        setIsCustomAuth(true);
        setCustomAuthText(profileData.workAuthorization);
      }
    }
    setQaEntries(qaData ?? []);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleWorkAuthSelect = (val: string) => {
    if (val === "CUSTOM") {
      setIsCustomAuth(true);
      setProfile(prev => ({ ...prev, workAuthorization: customAuthText || "Custom Authorization" }));
    } else {
      setIsCustomAuth(false);
      const isIndian = val.includes("Indian");
      const requiresSponsor = val.includes("Requires");
      setProfile(prev => ({
        ...prev,
        workAuthorization: val,
        // Smart toggle suggestion: if Indian citizen, sponsorship is typically false
        requireSponsorship: requiresSponsor ? true : (isIndian ? false : prev.requireSponsorship)
      }));
    }
  };

  const handleCustomAuthChange = (val: string) => {
    setCustomAuthText(val);
    setProfile(prev => ({ ...prev, workAuthorization: val }));
  };

  const toggleLocationChip = (loc: string) => {
    const parts = locationsInput.split(",").map((s) => s.trim()).filter(Boolean);
    const exists = parts.some(p => p.toLowerCase() === loc.toLowerCase());
    if (exists) {
      setLocationsInput(parts.filter(p => p.toLowerCase() !== loc.toLowerCase()).join(", "));
    } else {
      setLocationsInput([...parts, loc].join(", "));
    }
  };

  const toggleSkillChip = (skill: string) => {
    const parts = skillsInput.split(",").map((s) => s.trim()).filter(Boolean);
    const exists = parts.some(p => p.toLowerCase() === skill.toLowerCase());
    if (exists) {
      setSkillsInput(parts.filter(p => p.toLowerCase() !== skill.toLowerCase()).join(", "));
    } else {
      setSkillsInput([...parts, skill].join(", "));
    }
  };

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const toSave = {
        ...profile,
        workAuthorization: isCustomAuth ? (customAuthText.trim() || profile.workAuthorization) : profile.workAuthorization,
        skills: skillsInput.split(",").map((s) => s.trim()).filter(Boolean),
        preferredLocations: locationsInput.split(",").map((s) => s.trim()).filter(Boolean),
      };
      await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toSave),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const addQA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQ || !newA) return;
    setAddingQA(true);
    try {
      await fetch("/api/qa-bank", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ originalQuestion: newQ, answer: newA, category: newCat }),
      });
      setNewQ(""); setNewA(""); setNewCat("general");
      await fetchData();
    } finally {
      setAddingQA(false);
    }
  };

  const addIndianPresets = async () => {
    setAddingPresets(true);
    try {
      for (const preset of INDIAN_PRESETS) {
        await fetch("/api/qa-bank", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(preset),
        });
      }
      await fetchData();
    } finally {
      setAddingPresets(false);
    }
  };

  const deleteQA = async (id: string) => {
    await fetch(`/api/qa-bank/${id}`, { method: "DELETE" });
    fetchData();
  };

  const updateEdu = (i: number, field: string, val: string | number) => {
    const edu = [...profile.education];
    edu[i] = { ...edu[i], [field]: val };
    setProfile({ ...profile, education: edu });
  };

  const activeLocationsList = locationsInput.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  const activeSkillsList = skillsInput.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);

  const filteredQA = qaEntries.filter((q) => {
    const matchesCategory = qaCategoryFilter === "ALL" || q.category === qaCategoryFilter;
    const matchesSearch = !qaFilter ||
      q.originalQuestion.toLowerCase().includes(qaFilter.toLowerCase()) ||
      q.answer.toLowerCase().includes(qaFilter.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const sourceBadge: Record<string, string> = { MANUAL: "badge-blue", LLM_GENERATED: "badge-purple" };

  return (
    <div style={{ maxWidth: 940, margin: "0 auto" }}>
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem" }}>Profile & Q&A Bank</h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>
          Your profile and Q&A bank auto-fill job applications across India, the US, and remote companies.
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "0.35rem", marginBottom: "1.5rem", background: "var(--bg-secondary)", padding: "0.25rem", borderRadius: "var(--radius-sm)", width: "fit-content" }}>
        <button
          id="tab-profile"
          onClick={() => setActiveTab("profile")}
          className="btn btn-sm"
          style={{
            background: activeTab === "profile" ? "var(--bg-card)" : "transparent",
            color: activeTab === "profile" ? "var(--text-primary)" : "var(--text-muted)",
            border: activeTab === "profile" ? "1px solid var(--border)" : "1px solid transparent",
          }}
        >
          👤 Profile Information
        </button>
        <button
          id="tab-qa"
          onClick={() => setActiveTab("qa")}
          className="btn btn-sm"
          style={{
            background: activeTab === "qa" ? "var(--bg-card)" : "transparent",
            color: activeTab === "qa" ? "var(--text-primary)" : "var(--text-muted)",
            border: activeTab === "qa" ? "1px solid var(--border)" : "1px solid transparent",
          }}
        >
          💬 Q&A Bank ({qaEntries.length})
        </button>
      </div>

      {activeTab === "profile" && (
        <form onSubmit={saveProfile}>
          {/* Work Auth Banner */}
          <div className="card" style={{ marginBottom: "1.25rem", borderLeft: "4px solid var(--accent)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
              <Globe size={18} style={{ color: "var(--accent)" }} />
              <h2 style={{ fontSize: "1rem", fontWeight: 600 }}>Work Authorization & Target Regions</h2>
            </div>
            <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "1rem", lineHeight: 1.5 }}>
              Choose your primary legal authorization. The engine intelligently answers questions like <em>"Are you authorized to work in India?"</em>, <em>"Are you authorized to work in the US?"</em>, and sponsorship queries based on the job location.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: "1rem" }}>
              <div className="form-group">
                <label className="label" htmlFor="work-auth">Work Authorization Status</label>
                <select
                  id="work-auth"
                  className="input"
                  value={isCustomAuth ? "CUSTOM" : profile.workAuthorization}
                  onChange={(e) => handleWorkAuthSelect(e.target.value)}
                >
                  <optgroup label="🇮🇳 India (Targeting Indian Tech Roles & GCCs)">
                    <option value="Indian Citizen (No visa sponsorship required in India)">
                      🇮🇳 Indian Citizen (No visa sponsorship required in India)
                    </option>
                    <option value="Authorized to work in India (Citizen / OCI / PIO)">
                      🇮🇳 Authorized to work in India (Citizen / OCI / PIO)
                    </option>
                    <option value="Living in India (Open to India & Global Remote)">
                      🇮🇳 Living in India (Open to India & Global Remote)
                    </option>
                  </optgroup>
                  <optgroup label="🇺🇸 United States">
                    <option value="Authorized to work in US without sponsorship">
                      🇺🇸 Authorized to work in US without sponsorship
                    </option>
                    <option value="US Citizen">🇺🇸 US Citizen</option>
                    <option value="Permanent Resident (Green Card)">🇺🇸 Permanent Resident (Green Card)</option>
                    <option value="OPT / STEM OPT">🇺🇸 OPT / STEM OPT</option>
                    <option value="H1B Visa">🇺🇸 H1B Visa</option>
                    <option value="Requires US Visa Sponsorship">🇺🇸 Requires US Visa Sponsorship</option>
                  </optgroup>
                  <optgroup label="🌍 Global & Remote">
                    <option value="Authorized for Worldwide Remote (Contractor / EOR)">
                      🌍 Authorized for Worldwide Remote (Contractor / EOR)
                    </option>
                    <option value="Authorized to work in Canada">🇨🇦 Authorized to work in Canada</option>
                    <option value="Authorized to work in UK / Europe">🇬🇧 Authorized to work in UK / Europe</option>
                    <option value="Requires Visa Sponsorship">Requires Visa Sponsorship</option>
                    <option value="CUSTOM">✏️ Other / Custom status...</option>
                  </optgroup>
                </select>

                {isCustomAuth && (
                  <div style={{ marginTop: "0.5rem" }}>
                    <label className="label" htmlFor="custom-work-auth">Custom Authorization Text</label>
                    <input
                      id="custom-work-auth"
                      className="input"
                      placeholder="e.g., Canadian Citizen, UK Tier 2, etc."
                      value={customAuthText}
                      onChange={(e) => handleCustomAuthChange(e.target.value)}
                    />
                  </div>
                )}
              </div>

              <div className="form-group">
                <label className="label" htmlFor="years-exp">Total Years of Experience</label>
                <input
                  id="years-exp"
                  type="number"
                  step="0.5"
                  className="input"
                  value={profile.yearsOfExperience}
                  onChange={(e) => setProfile({ ...profile, yearsOfExperience: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>

            <div style={{ marginTop: "0.875rem", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem" }}>
              <label className="toggle-wrap" htmlFor="sponsorship-toggle" style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <div
                  id="sponsorship-toggle"
                  className={`toggle ${profile.requireSponsorship ? "on" : ""}`}
                  onClick={() => setProfile({ ...profile, requireSponsorship: !profile.requireSponsorship })}
                />
                <span style={{ fontSize: "0.875rem", color: "var(--text-primary)", fontWeight: 500 }}>
                  Requires visa sponsorship for abroad jobs (e.g., US H-1B)
                </span>
              </label>

              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                {profile.workAuthorization.includes("Indian") && !profile.requireSponsorship
                  ? "✓ Configured for Indian jobs (answers Yes to Indian work rights, No to sponsorship)"
                  : profile.requireSponsorship
                  ? "⚠️ Sponsorship flagged: Will request sponsorship on international ATS forms"
                  : "✓ Work authorization configured"}
              </div>
            </div>

            {/* Quick Helper Banner */}
            <div style={{
              marginTop: "0.875rem",
              padding: "0.65rem 0.85rem",
              background: "var(--bg-secondary)",
              borderRadius: "var(--radius-sm)",
              fontSize: "0.75rem",
              color: "var(--text-secondary)",
              display: "flex",
              alignItems: "flex-start",
              gap: "0.5rem"
            }}>
              <Info size={14} style={{ color: "var(--accent)", flexShrink: 0, marginTop: "2px" }} />
              <div>
                <strong>For Indian applicants:</strong> If you are applying to jobs in India (Bengaluru, Hyderabad, Gurgaon, etc.), select <strong>Indian Citizen</strong> and keep sponsorship <strong>OFF</strong>. The bot will automatically answer "Yes" to Indian authorization questions and "No" to sponsorship.
              </div>
            </div>
          </div>

          {/* Personal Info */}
          <div className="card" style={{ marginBottom: "1rem" }}>
            <h2 style={{ fontSize: "0.9375rem", fontWeight: 600, marginBottom: "1rem" }}>Personal Information</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.875rem" }}>
              <div className="form-group">
                <label className="label" htmlFor="full-name">Full Name</label>
                <input id="full-name" className="input" placeholder="e.g. Rahul Sharma" value={profile.fullName} onChange={(e) => setProfile({ ...profile, fullName: e.target.value })} required />
              </div>
              <div className="form-group">
                <label className="label" htmlFor="email">Email</label>
                <input id="email" type="email" className="input" placeholder="e.g. rahul@example.com" value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} required />
              </div>
              <div className="form-group">
                <label className="label" htmlFor="phone">Phone</label>
                <input id="phone" className="input" placeholder="+91 98765 43210" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="label" htmlFor="location">Current Location</label>
                <input id="location" className="input" placeholder="Bengaluru, Karnataka, India" value={profile.location} onChange={(e) => setProfile({ ...profile, location: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="label" htmlFor="linkedin">LinkedIn URL</label>
                <input id="linkedin" className="input" placeholder="https://linkedin.com/in/username" value={profile.linkedinUrl} onChange={(e) => setProfile({ ...profile, linkedinUrl: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="label" htmlFor="github">GitHub URL</label>
                <input id="github" className="input" placeholder="https://github.com/username" value={profile.githubUrl} onChange={(e) => setProfile({ ...profile, githubUrl: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="label" htmlFor="portfolio">Portfolio / Personal Website</label>
                <input id="portfolio" className="input" placeholder="https://myportfolio.dev" value={profile.portfolioUrl} onChange={(e) => setProfile({ ...profile, portfolioUrl: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="label" htmlFor="graduation-batch">Graduation Batch / Year</label>
                <input id="graduation-batch" className="input" placeholder="e.g. 2024 or 2025" value={profile.graduationBatch} onChange={(e) => setProfile({ ...profile, graduationBatch: e.target.value })} />
              </div>
            </div>
            <div className="form-group" style={{ marginTop: "0.875rem" }}>
              <label className="label" htmlFor="bio">Bio / Professional Summary</label>
              <textarea id="bio" className="input" rows={3} placeholder="Brief professional summary for applications and cover letters…" value={profile.bio} onChange={(e) => setProfile({ ...profile, bio: e.target.value })} />
            </div>
          </div>

          {/* Education */}
          <div className="card" style={{ marginBottom: "1rem" }}>
            <h2 style={{ fontSize: "0.9375rem", fontWeight: 600, marginBottom: "1rem" }}>Education</h2>
            {profile.education.map((edu, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.875rem", marginBottom: "0.875rem" }}>
                <div className="form-group">
                  <label className="label">Institution / College</label>
                  <input className="input" placeholder="e.g. IIT Bombay / BITS Pilani / NIT Trichy" value={edu.institution} onChange={(e) => updateEdu(i, "institution", e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="label">Degree</label>
                  <input className="input" placeholder="B.Tech / Bachelor of Technology / B.E." value={edu.degree} onChange={(e) => updateEdu(i, "degree", e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="label">Major / Specialization</label>
                  <input className="input" placeholder="Computer Science & Engineering" value={edu.major} onChange={(e) => updateEdu(i, "major", e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="label">Graduation Date</label>
                  <input className="input" placeholder="May 2025" value={edu.endDate ?? ""} onChange={(e) => updateEdu(i, "endDate", e.target.value)} />
                </div>
              </div>
            ))}
          </div>

          {/* Preferred Locations & Skills */}
          <div className="card" style={{ marginBottom: "1.25rem" }}>
            <h2 style={{ fontSize: "0.9375rem", fontWeight: 600, marginBottom: "0.875rem" }}>Target Locations & Skills</h2>
            
            {/* Preferred Locations */}
            <div className="form-group" style={{ marginBottom: "1.25rem" }}>
              <label className="label" htmlFor="pref-locations">
                Preferred Locations (comma-separated)
              </label>
              <input
                id="pref-locations"
                className="input"
                placeholder="Bengaluru, Hyderabad, Pune, Remote (India)..."
                value={locationsInput}
                onChange={(e) => setLocationsInput(e.target.value)}
                style={{ marginBottom: "0.5rem" }}
              />
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", alignItems: "center" }}>
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginRight: "0.25rem" }}>
                  <MapPin size={12} style={{ display: "inline", verticalAlign: "middle", marginRight: "2px" }} />
                  Quick add:
                </span>
                {POPULAR_LOCATIONS.map((loc) => {
                  const isSelected = activeLocationsList.includes(loc.toLowerCase());
                  return (
                    <button
                      key={loc}
                      type="button"
                      onClick={() => toggleLocationChip(loc)}
                      className="btn btn-sm"
                      style={{
                        padding: "0.2rem 0.55rem",
                        fontSize: "0.75rem",
                        borderRadius: "1rem",
                        background: isSelected ? "var(--accent)" : "var(--bg-secondary)",
                        color: isSelected ? "#fff" : "var(--text-secondary)",
                        border: isSelected ? "1px solid var(--accent)" : "1px solid var(--border)",
                      }}
                    >
                      {isSelected ? "✓ " : "+ "}{loc}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Skills */}
            <div className="form-group">
              <label className="label" htmlFor="skills">Skills (comma-separated)</label>
              <textarea
                id="skills"
                className="input"
                rows={2}
                placeholder="Python, Java, Spring Boot, React, Next.js, PostgreSQL, Docker..."
                value={skillsInput}
                onChange={(e) => setSkillsInput(e.target.value)}
                style={{ marginBottom: "0.5rem" }}
              />
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", alignItems: "center" }}>
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginRight: "0.25rem" }}>
                  <Sparkles size={12} style={{ display: "inline", verticalAlign: "middle", marginRight: "2px" }} />
                  Quick add:
                </span>
                {POPULAR_SKILLS.map((skill) => {
                  const isSelected = activeSkillsList.includes(skill.toLowerCase());
                  return (
                    <button
                      key={skill}
                      type="button"
                      onClick={() => toggleSkillChip(skill)}
                      className="btn btn-sm"
                      style={{
                        padding: "0.2rem 0.55rem",
                        fontSize: "0.75rem",
                        borderRadius: "1rem",
                        background: isSelected ? "var(--accent)" : "var(--bg-secondary)",
                        color: isSelected ? "#fff" : "var(--text-secondary)",
                        border: isSelected ? "1px solid var(--accent)" : "1px solid var(--border)",
                      }}
                    >
                      {isSelected ? "✓ " : "+ "}{skill}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <button id="save-profile-btn" type="submit" className="btn btn-primary" disabled={saving} style={{ minWidth: 150 }}>
            <Save size={14} />
            {saved ? "✓ Profile Saved!" : saving ? "Saving…" : "Save Profile"}
          </button>
        </form>
      )}

      {activeTab === "qa" && (
        <div>
          {/* Indian Preset Quick Action Banner */}
          <div className="card" style={{ marginBottom: "1.25rem", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem", background: "linear-gradient(90deg, rgba(59, 130, 246, 0.05) 0%, rgba(139, 92, 246, 0.05) 100%)" }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: "0.9375rem", display: "flex", alignItems: "center", gap: "0.35rem" }}>
                🇮🇳 Indian Application Preset Pack
              </div>
              <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", margin: 0, marginTop: "0.2rem" }}>
                Instant answers for Indian work rights, notice period (Immediate/30 days), expected CTC, and relocation to Bengaluru/Hyderabad/Pune/NCR.
              </p>
            </div>
            <button
              id="add-indian-presets-btn"
              type="button"
              className="btn btn-sm"
              onClick={addIndianPresets}
              disabled={addingPresets}
              style={{ background: "var(--accent)", color: "#fff", display: "flex", alignItems: "center", gap: "0.35rem", padding: "0.45rem 0.85rem" }}
            >
              <Sparkles size={13} />
              {addingPresets ? "Adding Presets…" : "Add Indian Q&A Presets"}
            </button>
          </div>

          {/* Add Q&A Form */}
          <div className="card" style={{ marginBottom: "1.25rem" }}>
            <h2 style={{ fontSize: "0.9375rem", fontWeight: 600, marginBottom: "1rem" }}>Add Custom Q&A Entry</h2>
            <form onSubmit={addQA}>
              <div className="form-group" style={{ marginBottom: "0.75rem" }}>
                <label className="label" htmlFor="new-question">Question / ATS Prompt</label>
                <input id="new-question" className="input" placeholder="e.g. What is your notice period or availability to join?" value={newQ} onChange={(e) => setNewQ(e.target.value)} required />
              </div>
              <div className="form-group" style={{ marginBottom: "0.75rem" }}>
                <label className="label" htmlFor="new-answer">Stored Answer</label>
                <textarea id="new-answer" className="input" rows={2} placeholder="e.g. Immediate to 30 days (negotiable / serving notice)." value={newA} onChange={(e) => setNewA(e.target.value)} required />
              </div>
              <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
                <select id="new-category" className="input" style={{ width: "auto" }} value={newCat} onChange={(e) => setNewCat(e.target.value)}>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <button id="add-qa-btn" type="submit" className="btn btn-primary btn-sm" disabled={addingQA}>
                  <Plus size={13} /> {addingQA ? "Adding…" : "Add Q&A Entry"}
                </button>
              </div>
            </form>
          </div>

          {/* Search & Category Filter */}
          <div style={{ marginBottom: "1rem", display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
            <input
              id="qa-search"
              className="input"
              placeholder="Search questions or answers…"
              value={qaFilter}
              onChange={(e) => setQaFilter(e.target.value)}
              style={{ flex: 1, minWidth: 200 }}
            />
            <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }}>
              {["ALL", ...CATEGORIES].map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setQaCategoryFilter(cat)}
                  className="btn btn-sm"
                  style={{
                    fontSize: "0.75rem",
                    padding: "0.25rem 0.6rem",
                    background: qaCategoryFilter === cat ? "var(--accent)" : "var(--bg-secondary)",
                    color: qaCategoryFilter === cat ? "#fff" : "var(--text-secondary)",
                    border: qaCategoryFilter === cat ? "1px solid var(--accent)" : "1px solid var(--border)",
                  }}
                >
                  {cat.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Q&A List */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
            {filteredQA.length === 0 ? (
              <div className="card" style={{ textAlign: "center", padding: "2.5rem 1rem", color: "var(--text-muted)" }}>
                No Q&A entries found matching your filter.
              </div>
            ) : filteredQA.map((qa) => (
              <div key={qa.id} className="card" style={{ padding: "0.875rem 1rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap", marginBottom: "0.375rem", alignItems: "center" }}>
                      <span className={`badge ${sourceBadge[qa.source] ?? "badge-gray"}`} style={{ fontSize: "0.65rem" }}>{qa.source?.replace("_", " ")}</span>
                      <span className="badge badge-gray" style={{ fontSize: "0.65rem" }}>{qa.category}</span>
                      {qa.originalQuestion.toLowerCase().includes("india") && (
                        <span className="badge badge-accent" style={{ fontSize: "0.65rem" }}>🇮🇳 India</span>
                      )}
                      {qa.usageCount > 0 && <span className="badge badge-accent" style={{ fontSize: "0.65rem" }}>Used {qa.usageCount}×</span>}
                    </div>
                    <div style={{ fontWeight: 600, fontSize: "0.875rem", color: "var(--text-primary)", marginBottom: "0.25rem" }}>
                      {qa.originalQuestion}
                    </div>
                    <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                      {qa.answer}
                    </div>
                  </div>
                  <button
                    id={`delete-qa-${qa.id}`}
                    className="btn btn-danger btn-sm"
                    onClick={() => deleteQA(qa.id)}
                    style={{ padding: "0.35rem", alignSelf: "flex-start", flexShrink: 0 }}
                    title="Delete entry"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
