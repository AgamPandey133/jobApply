import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import KillSwitchBanner from "@/components/KillSwitchBanner";

export const metadata: Metadata = {
  title: "JobSniper — Autonomous Job Application Engine",
  description:
    "Monitor company career pages, auto-match your best resume, and apply to jobs within minutes of posting.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
      </head>
      <body>
        <div className="app-shell">
          <Sidebar />
          <div className="main-content">
            <KillSwitchBanner />
            <Header />
            <main className="page-body animate-fade-in">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
