# JobSniper 🎯
### Autonomous Job Intelligence, Live Web Crawler, Multi-ATS Polling & AI Auto-Apply Platform

JobSniper is a full-stack, enterprise-grade automated career acceleration platform built with **Next.js 16**, **TypeScript**, **Prisma ORM**, **PostgreSQL with pgvector**, **Redis & BullMQ**, **Google Gemini AI (2.0 Flash + Text Embeddings)**, and **Playwright**.

It continuously scans and crawls career platforms every few minutes, matches postings against your resume portfolio using hybrid semantic embeddings + LLM judging, and automates job applications with human-in-the-loop review or full autonomy.

---

## 🌟 Key Features

### 1. 🕷️ Autonomous Multi-Source Web Crawler
- **High-Frequency Guest Crawling**: Discovers fresh developer openings directly from LinkedIn Guest API, 50+ Top Indian Unicorn ATS boards (Greenhouse, Lever, Ashby), and remote job boards (Jobicy, RemoteOK, Arbeitnow, WeWorkRemotely).
- **Non-Blocking Background Execution**: Runs asynchronously without locking HTTP connections or freezing UI state.
- **Live Terminal Monitor**: Streams real-time crawling logs, job ingestion metrics, and timestamped progress directly in the web dashboard.
- **Emergency Circuit Breaker**: One-click status reset mechanism to recover from interrupted sweeps.

### 2. 🗂️ Strict Section Separation
- **💼 Direct & ATS Jobs Feed**: Enforces strict database-level (`excludeLinkedin=true`) and client-level isolation with **zero LinkedIn contamination**. Showcases verified company ATS pipelines (Databricks, Stripe, Datadog, MongoDB, etc.).
- **⚡ LinkedIn Fast-Track (<10h)**: Dedicated feed strictly filtered to fresh opportunities posted within the last 10 hours, featuring precise relative-time badges (e.g. `14m ago`, `2h ago`).

### 3. 💵 Intelligent Salary Extraction & Custom Range Filtering
- **Deep Salary Extraction**: Regex and NLP parser that accurately extracts INR LPA (e.g. `₹12 - ₹18 LPA`), Monthly INR (e.g. `₹40k/month`, `₹1.5L/mo`), and USD (`$120k - $160k/yr`).
- **Granular Salary Controls**: Filter between All, Monthly INR, or Annual LPA, specify custom min/max bounds, and toggle inclusion of salary-unspecified listings.

### 4. 🗑️ Feed Hygiene & One-Click Job Dismissal
- **Automatic Stale Suppression**: Automatically excludes closed listings (`[closed]`, `(closed)`, `no longer accepting`) and low-match discarded records (~7,000+ stale records cleaned by default).
- **Interactive Dismiss**: One-click `Trash` button on any job row immediately removes it from the rendered list, saves preference locally and marks it on the server.
- **Instant Undo & Restore**: Floating toast with immediate `Undo` action, alongside a header `Restore All` option.

### 5. 🤖 Hybrid Semantic AI Matching Engine
- **Vector Embeddings (40%)**: Uses Google Gemini `text-embedding-004` (768 dimensions) to calculate cosine similarity between job descriptions and your resumes.
- **Gemini 2.0 Flash LLM Judge (60%)**: Analyzes requirements, years of experience, core stack alignment, and produces a structured score breakdown with pros, cons, and recommendations.
- **Multi-Resume Portfolio**: Automatically matches the highest-scoring resume (e.g., Backend, Frontend, Fullstack, AI/ML) for each specific role.

### 6. 📝 Playwright Form Automation & Bot Safety
- **ATS Form Fillers**: Dedicated automation adapters for **Greenhouse**, **Lever**, **Ashby**, **Workable**, and **SmartRecruiters**.
- **Grounded Q&A Generation**: Uses your stored profile and Q&A bank to answer custom application questions honestly without hallucinating.
- **🛡️ Anti-Bot & CAPTCHA Safety**: Actively detects bot verification gates (Cloudflare Turnstile, hCaptcha, reCAPTCHA). Halts safely and flags the application as `Needs Manual Action` without bypassing checks.
- **Dual Apply Modes**:
  - **Review Mode (Default)**: Automatically prepares and fills the application, takes a pre-submit screenshot, and notifies you for one-click approval.
  - **Full-Auto Mode**: Submits verified high-scoring applications autonomously and logs confirmation screenshots.

### 7. 📱 Telegram Notifications & Live Alerts
- Sends instant notifications on new high-match postings, applications ready for review, and successful submissions with direct links.

---

## 🏗️ System Architecture

```mermaid
flowchart TD
    subgraph Frontend ["Web Dashboard (Next.js 16 App Router)"]
        UI["Tailwind CSS + Custom Theme UI"]
        Tabs["Section Switcher (Direct ATS vs LinkedIn <10h)"]
        CrawlerModal["Live Crawler Stream & Controls"]
        Filters["Salary & Role Filters"]
    end

    subgraph Backend ["Next.js Server & APIs"]
        API["REST Endpoints (/api/*)"]
        Prisma["Prisma ORM Client"]
    end

    subgraph Data ["Data Layer"]
        PG[("PostgreSQL + pgvector")]
        Redis[("Redis BullMQ Queues")]
    end

    subgraph Workers ["Autonomous Background Worker Engine"]
        Crawler["Web Crawler Engine (LinkedIn / ATS / Remote)"]
        Poller["ATS Poller Worker"]
        Matcher["Gemini AI Matcher & Embedding Generator"]
        ApplyWorker["Playwright Auto-Apply Worker"]
    end

    subgraph External ["External Services"]
        Gemini["Google Gemini AI API"]
        ATS["Company ATS Boards (Greenhouse/Lever/Ashby)"]
        TG["Telegram Bot API"]
    end

    UI --> API
    API --> Prisma
    Prisma --> PG
    API --> Redis
    Redis --> Workers
    Crawler --> PG
    Poller --> ATS
    Matcher --> Gemini
    ApplyWorker --> ATS
    ApplyWorker --> TG
```

---

## 🚀 Quick Start Guide

### Prerequisites
- **Node.js**: v20+ or v22+
- **Docker & Docker Compose** (for PostgreSQL and Redis)
- **Google Gemini API Key**: [Get a Gemini API Key](https://aistudio.google.com/)
- **Telegram Bot** (optional, for real-time mobile notifications)

---

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/AgamPandey133/jobApply.git
cd jobApply
npm install
```

---

### 2. Configure Environment Variables

Copy the template file to `.env`:

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
# ── Database & Cache ──
DATABASE_URL="postgresql://jobsniper:jobsniper@localhost:5432/jobsniper?schema=public"
REDIS_URL="redis://localhost:6379"

# ── Gemini AI ──
GEMINI_API_KEY="your_actual_gemini_api_key_here"
GEMINI_MODEL="gemini-2.0-flash"
GEMINI_EMBEDDING_MODEL="text-embedding-004"

# ── Telegram (Optional) ──
TELEGRAM_BOT_TOKEN="your_bot_token"
TELEGRAM_CHAT_ID="your_chat_id"

# ── App & Worker ──
NEXT_PUBLIC_APP_URL="http://localhost:3000"
STORAGE_PATH="./uploads"
PLAYWRIGHT_HEADLESS="false"
DEFAULT_APPLY_MODE="REVIEW"
```

---

### 3. Start Database & Redis via Docker

```bash
# Start PostgreSQL (with pgvector) and Redis in detached mode
docker compose up postgres redis -d
```

---

### 4. Initialize Database Schema & Seed Data

```bash
# Generate Prisma Client & types
npm run db:generate

# Apply database migrations
npm run db:migrate

# Seed initial application settings and default profiles
npm run db:seed
```

---

### 5. Install Playwright Browsers

```bash
npx playwright install chromium
```

---

### 6. Run the Application

Start the web dashboard and worker service in two separate terminals:

```bash
# Terminal 1: Next.js Frontend & API
npm run dev

# Terminal 2: Background BullMQ & Crawler Worker
npm run worker:dev
```

Open your browser and navigate to **[http://localhost:3000](http://localhost:3000)**.

---

## 📁 Repository Directory Structure

```
jobApply/
├── prisma/
│   ├── schema.prisma        # Complete database schema with pgvector
│   └── seed.ts              # Initial seed data for settings & profiles
├── public/                  # Static assets & brand icons
├── src/
│   ├── app/                 # Next.js App Router
│   │   ├── api/             # REST APIs (jobs, crawler, sync, dismiss, resumes, etc.)
│   │   ├── applications/    # Application management dashboard
│   │   ├── applied/         # Applied jobs tracker
│   │   ├── companies/       # ATS company boards monitor
│   │   ├── jobs/            # Primary jobs explorer with section switcher
│   │   ├── profile/         # Personal profile & Q&A bank editor
│   │   ├── resumes/         # Multi-resume manager with AI parsing
│   │   ├── settings/        # System configuration & match thresholds
│   │   ├── globals.css      # Design tokens, variables & dark mode styles
│   │   └── layout.tsx       # Root layout with responsive navigation
│   ├── components/          # Reusable UI components (Header, Sidebar, KillSwitch)
│   ├── lib/                 # Core utilities
│   │   ├── db.ts            # Prisma client singleton
│   │   ├── gemini.ts        # Gemini AI embeddings & prompt pipelines
│   │   ├── redis.ts         # Redis & BullMQ queue connections
│   │   ├── salary-parser.ts # Regex & NLP salary detection engine
│   │   └── telegram.ts      # Telegram notification dispatcher
│   └── worker/              # Background Worker Subsystem
│       ├── adapters/        # ATS scraping adapters (Greenhouse, Lever, Ashby, etc.)
│       ├── apply/           # Playwright automation scripts & bot detection
│       ├── crawler.ts       # Multi-source autonomous web crawler engine
│       ├── filter.ts        # Fast keyword & location filtration pipeline
│       ├── india-stream.ts  # India-specific job stream synchronizer
│       ├── matcher.ts       # Resume vector embedding & LLM scoring
│       ├── poller.ts        # Periodic ATS job poller
│       └── workers.ts       # BullMQ worker consumers
├── uploads/                 # Local directory for user resumes and screenshots
│   ├── resumes/             # Uploaded PDF resumes (gitignored)
│   └── screenshots/         # Pre-submit & error screenshots (gitignored)
├── .env.example             # Clean environment variable template
├── .gitignore               # Strict ignore rules for secrets, builds & user uploads
├── docker-compose.yml       # Production/development container orchestration
├── Dockerfile.web           # Container definition for web app
├── Dockerfile.worker        # Container definition for worker service
├── package.json             # Dependencies and operational scripts
└── tsconfig.json            # TypeScript configuration
```

---

## 🔒 Security, Privacy & Compliance

- **No Secrets in Source Control**: `.env` and personal credentials are never tracked. Only `.env.example` is committed.
- **User Upload Protection**: All uploaded resumes and application capture screenshots in `uploads/` are strictly ignored by Git to preserve privacy.
- **CAPTCHA & Access Gate Integrity**: The platform strictly respects security barriers and anti-bot challenges. If CAPTCHA or Cloudflare protection is detected, the application halts and requests user action.
- **Honest AI Generation**: The Gemini prompt pipeline is constrained to information supplied in your resume and profile bank, eliminating hallucinated work history or credentials.

---

## 📜 Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Starts the Next.js development server at `http://localhost:3000` |
| `npm run worker:dev` | Starts the BullMQ workers in watch mode with `tsx` |
| `npm run build` | Builds the Next.js production bundle |
| `npm run build:worker` | Bundles worker TypeScript code using `tsup` |
| `npm run db:generate` | Generates the Prisma client and types |
| `npm run db:migrate` | Runs database migrations |
| `npm run db:seed` | Seeds database with initial settings and sample profile |
| `npm run lint` | Runs ESLint analysis across the project |

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
