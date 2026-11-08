"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Briefcase,
  FileCheck,
  CheckCircle2,
  FileText,
  Building2,
  User,
  Settings,
  Zap,
} from "lucide-react";

const navItems = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/jobs", label: "Jobs", icon: Briefcase },
  { href: "/applications", label: "Applications", icon: FileCheck },
  { href: "/applied", label: "Applied Jobs", icon: CheckCircle2 },
];

const manageItems = [
  { href: "/resumes", label: "Resumes", icon: FileText },
  { href: "/companies", label: "Companies", icon: Building2 },
  { href: "/profile", label: "Profile & Q&A", icon: User },
  { href: "/settings", label: "Settings", icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <nav className="sidebar" role="navigation" aria-label="Main navigation">
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">🎯</div>
        <span className="sidebar-logo-text">JobSniper</span>
      </div>

      {/* Live status indicator */}
      <div
        style={{
          padding: "0.5rem 1rem",
          borderBottom: "1px solid var(--border-subtle)",
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          fontSize: "0.75rem",
          color: "var(--text-muted)",
        }}
      >
        <span className="live-dot" />
        System Active
      </div>

      {/* Navigation */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0.5rem 0" }}>
        <div className="nav-section">
          <div className="nav-section-label">Dashboard</div>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-link ${isActive ? "active" : ""}`}
                id={`nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
              >
                <Icon className="nav-icon" size={16} />
                {item.label}
              </Link>
            );
          })}
        </div>

        <div className="nav-section">
          <div className="nav-section-label">Manage</div>
          {manageItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-link ${isActive ? "active" : ""}`}
                id={`nav-${item.label.toLowerCase().replace(/[^a-z]/g, "-")}`}
              >
                <Icon className="nav-icon" size={16} />
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div
        style={{
          padding: "0.75rem 1rem",
          borderTop: "1px solid var(--border-subtle)",
          fontSize: "0.75rem",
          color: "var(--text-muted)",
          display: "flex",
          alignItems: "center",
          gap: "0.375rem",
        }}
      >
        <Zap size={12} />
        Powered by Gemini AI
      </div>
    </nav>
  );
}
