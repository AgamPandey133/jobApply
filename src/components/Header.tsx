"use client";

import { useState, useEffect, useCallback } from "react";
import { Bell, BellDot } from "lucide-react";

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  link?: string;
  isRead: boolean;
  createdAt: string;
}

export default function Header() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      if (!res.ok) return;
      const data = await res.json();
      setNotifications(data.notifications ?? []);
      setUnreadCount(data.unreadCount ?? 0);
    } catch {/* ignore */}
  }, []);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 15000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const markAllRead = async () => {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
    setUnreadCount(0);
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  };

  const typeColor: Record<string, string> = {
    SUCCESS: "var(--green)",
    ERROR: "var(--red)",
    ACTION_REQUIRED: "var(--yellow)",
    WARNING: "var(--yellow)",
    INFO: "var(--accent)",
  };

  return (
    <header className="page-header" style={{ justifyContent: "flex-end" }}>
      {/* Notification bell */}
      <div style={{ position: "relative" }}>
        <button
          id="notifications-bell"
          onClick={() => { setOpen(!open); if (!open && unreadCount > 0) markAllRead(); }}
          className="btn btn-ghost btn-sm"
          style={{ padding: "0.4rem", position: "relative" }}
          aria-label="Notifications"
        >
          {unreadCount > 0 ? <BellDot size={18} style={{ color: "var(--accent)" }} /> : <Bell size={18} />}
          {unreadCount > 0 && (
            <span style={{
              position: "absolute", top: -4, right: -4,
              background: "var(--accent)", color: "#fff",
              borderRadius: "999px", fontSize: "0.6rem",
              fontWeight: 700, width: 16, height: 16,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>

        {open && (
          <>
            <div
              style={{ position: "fixed", inset: 0, zIndex: 48 }}
              onClick={() => setOpen(false)}
            />
            <div id="notifications-panel" style={{
              position: "absolute", top: "calc(100% + 8px)", right: 0,
              width: 360, background: "var(--bg-card)", border: "1px solid var(--border)",
              borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-md)",
              zIndex: 50, overflow: "hidden",
            }}>
              <div style={{
                padding: "0.875rem 1rem", borderBottom: "1px solid var(--border-subtle)",
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>
                <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>Notifications</span>
                {unreadCount > 0 && (
                  <button className="btn btn-ghost btn-sm" style={{ fontSize: "0.75rem" }} onClick={markAllRead}>
                    Mark all read
                  </button>
                )}
              </div>
              <div style={{ maxHeight: 400, overflowY: "auto" }}>
                {notifications.length === 0 ? (
                  <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.875rem" }}>
                    No notifications
                  </div>
                ) : notifications.map((n) => (
                  <a
                    key={n.id}
                    href={n.link ?? "#"}
                    style={{
                      display: "block", padding: "0.875rem 1rem",
                      borderBottom: "1px solid var(--border-subtle)",
                      textDecoration: "none",
                      background: n.isRead ? "transparent" : "rgba(99,102,241,0.04)",
                      transition: "background var(--transition)",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = n.isRead ? "transparent" : "rgba(99,102,241,0.04)")}
                  >
                    <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
                      <div style={{
                        width: 8, height: 8, borderRadius: "50%", flexShrink: 0, marginTop: 4,
                        background: typeColor[n.type] ?? "var(--text-muted)",
                      }} />
                      <div>
                        <div style={{ fontSize: "0.8125rem", fontWeight: 500, color: "var(--text-primary)" }}>
                          {n.title}
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: 2, lineHeight: 1.4 }}>
                          {n.message}
                        </div>
                        <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: 4 }}>
                          {new Date(n.createdAt).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
