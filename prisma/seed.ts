/**
 * Prisma Seed Script for JobSniper
 * Run: npm run db:seed
 */

import "dotenv/config";
import { PrismaClient, AtsType, ApplyMode } from "../src/generated/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Seeding JobSniper database...");

  // ── App Settings ─────────────────────────────────────────────────────────
  const settings = [
    { key: "global_paused", value: false },
    { key: "default_apply_mode", value: "REVIEW" },
    { key: "embedding_weight", value: 0.4 },
    { key: "llm_judge_weight", value: 0.6 },
    { key: "min_match_score", value: 70 },
    { key: "pause_on_unanswerable", value: false },
    { key: "company_cooldown_days", value: 0 }, // 0 = disabled
  ];

  for (const s of settings) {
    await prisma.appSetting.upsert({
      where: { key: s.key },
      update: { value: s.value as never },
      create: { key: s.key, value: s.value as never },
    });
  }
  console.log("✅ App settings created");

  // ── Sample Profile ────────────────────────────────────────────────────────
  const existingProfile = await prisma.profile.findFirst();
  if (!existingProfile) {
    await prisma.profile.create({
      data: {
        fullName: "Alex Johnson",
        email: "alex.johnson@example.com",
        phone: "+1-555-0192",
        location: "San Francisco, CA",
        linkedinUrl: "https://linkedin.com/in/alexjohnson",
        githubUrl: "https://github.com/alexjohnson",
        portfolioUrl: "https://alexjohnson.dev",
        education: [
          {
            institution: "University of California, Berkeley",
            degree: "Bachelor of Science",
            major: "Computer Science",
            gpa: 3.8,
            startDate: "2021-08",
            endDate: "2025-05",
            current: true,
          },
        ],
        graduationBatch: "2025",
        workAuthorization: "Authorized to work in US without sponsorship",
        requireSponsorship: false,
        yearsOfExperience: 1.5,
        bio: "Passionate software engineer with experience in backend systems, distributed computing, and AI/ML applications. Looking for full-time SWE roles starting May 2025.",
        skills: [
          "Python",
          "TypeScript",
          "Go",
          "React",
          "Node.js",
          "PostgreSQL",
          "Redis",
          "Docker",
          "Kubernetes",
          "AWS",
          "Machine Learning",
          "LLM APIs",
          "GraphQL",
          "REST APIs",
        ],
        preferredLocations: ["San Francisco, CA", "New York, NY", "Seattle, WA", "Remote"],
      },
    });
    console.log("✅ Sample profile created");
  }

  // ── Sample Q&A Bank ───────────────────────────────────────────────────────
  const qaEntries = [
    {
      questionPattern: "why do you want to work here",
      originalQuestion: "Why do you want to work at our company?",
      answer:
        "I'm excited about the opportunity to work on challenging technical problems that have real-world impact. I've been following the company's work and am impressed by the engineering culture and focus on innovation. I believe my skills in backend systems and distributed computing would be a great fit for your team.",
      category: "cultural",
      source: "MANUAL",
    },
    {
      questionPattern: "tell me about yourself",
      originalQuestion: "Tell us about yourself.",
      answer:
        "I'm a software engineering student at UC Berkeley graduating in May 2025, with 1.5 years of experience through internships and projects. I specialize in backend systems, APIs, and ML applications. I'm passionate about writing clean, scalable code and building systems that solve real problems.",
      category: "general",
      source: "MANUAL",
    },
    {
      questionPattern: "are you authorized to work in the united states",
      originalQuestion: "Are you authorized to work in the United States?",
      answer: "Yes",
      category: "work_auth",
      source: "MANUAL",
    },
    {
      questionPattern: "will you now or in the future require sponsorship",
      originalQuestion:
        "Will you now or in the future require sponsorship for employment visa status (e.g., H-1B status)?",
      answer: "No",
      category: "work_auth",
      source: "MANUAL",
    },
    {
      questionPattern: "what is your expected salary",
      originalQuestion: "What is your expected salary range?",
      answer: "I'm flexible and open to discussing compensation based on the role and total compensation package.",
      category: "general",
      source: "MANUAL",
    },
    {
      questionPattern: "what are your greatest strengths",
      originalQuestion: "What are your greatest strengths?",
      answer:
        "My greatest strengths are problem-solving under pressure and the ability to quickly learn and apply new technologies. I'm particularly strong at system design and debugging complex distributed systems issues.",
      category: "general",
      source: "MANUAL",
    },
    {
      questionPattern: "where do you see yourself in 5 years",
      originalQuestion: "Where do you see yourself in 5 years?",
      answer:
        "In 5 years, I see myself as a senior engineer who has shipped impactful products and mentored junior team members. I want to develop deep expertise in distributed systems and continue growing both technically and in terms of cross-functional collaboration.",
      category: "cultural",
      source: "MANUAL",
    },
    {
      questionPattern: "when can you start",
      originalQuestion: "When can you start?",
      answer: "I'm available to start May 2025 upon graduation, or as soon as possible for internship roles.",
      category: "general",
      source: "MANUAL",
    },
    // 🇮🇳 Indian Job Application Q&As
    {
      questionPattern: "are you authorized to work in india",
      originalQuestion: "Are you legally authorized to work in India?",
      answer: "Yes, I am an Indian citizen with full, unrestricted legal work authorization in India.",
      category: "work_auth",
      source: "MANUAL",
    },
    {
      questionPattern: "will you now or in the future require visa sponsorship to work in india",
      originalQuestion: "Will you now or in the future require visa sponsorship to work in India?",
      answer: "No, I do not require any visa sponsorship or work permit in India.",
      category: "work_auth",
      source: "MANUAL",
    },
    {
      questionPattern: "what is your notice period",
      originalQuestion: "What is your current notice period / how soon can you join?",
      answer: "Immediate to 30 days (negotiable / can join promptly).",
      category: "general",
      source: "MANUAL",
    },
    {
      questionPattern: "what is your current and expected ctc",
      originalQuestion: "What is your current and expected CTC / compensation?",
      answer: "Open to industry standard compensation and negotiable based on role requirements and total package.",
      category: "general",
      source: "MANUAL",
    },
    {
      questionPattern: "are you willing to relocate within india",
      originalQuestion: "Are you willing to relocate to Bengaluru, Hyderabad, Pune, NCR, or other locations in India?",
      answer: "Yes, I am fully open to relocating to major tech hubs across India.",
      category: "general",
      source: "MANUAL",
    },
    {
      questionPattern: "what is your nationality or citizenship",
      originalQuestion: "What is your nationality / citizenship?",
      answer: "Indian",
      category: "work_auth",
      source: "MANUAL",
    },
    {
      questionPattern: "are you comfortable with hybrid or in office work",
      originalQuestion: "Are you comfortable with a hybrid or in-office work schedule?",
      answer: "Yes, I am comfortable with both hybrid and in-office work setups as per company policy.",
      category: "cultural",
      source: "MANUAL",
    },
    {
      questionPattern: "are you authorized to work in the country of this role",
      originalQuestion: "Are you legally authorized to work in the country where this position is located?",
      answer: "Yes",
      category: "work_auth",
      source: "MANUAL",
    },
  ];

  for (const entry of qaEntries) {
    await prisma.questionAnswerBank.upsert({
      where: { id: `seed-${entry.questionPattern.replace(/\s+/g, "-").slice(0, 30)}` },
      update: {},
      create: {
        id: `seed-${entry.questionPattern.replace(/\s+/g, "-").slice(0, 30)}`,
        ...entry,
      },
    });
  }
  console.log("✅ Q&A bank seeded with", qaEntries.length, "entries");

  // ── Sample Famous Companies & Major Job Boards ──────────────────────────────
  const companies = [
    // Major Tech Job Boards
    { name: "RemoteOK", slug: "remoteok", careersUrl: "https://remoteok.com/api", atsType: AtsType.CUSTOM },
    { name: "Arbeitnow", slug: "arbeitnow", careersUrl: "https://www.arbeitnow.com/api/job-board-api", atsType: AtsType.CUSTOM },
    { name: "Jobicy", slug: "jobicy", careersUrl: "https://jobicy.com/api/v2/remote-jobs", atsType: AtsType.CUSTOM },

    // Global Tech Giants & AI Labs
    { name: "OpenAI", slug: "openai", careersUrl: "https://jobs.ashbyhq.com/openai", atsType: AtsType.ASHBY },
    { name: "Anthropic", slug: "anthropic", careersUrl: "https://jobs.ashbyhq.com/anthropic", atsType: AtsType.ASHBY },
    { name: "Perplexity AI", slug: "perplexity", careersUrl: "https://jobs.ashbyhq.com/perplexity", atsType: AtsType.ASHBY },
    { name: "Cohere", slug: "cohere", careersUrl: "https://jobs.ashbyhq.com/cohere", atsType: AtsType.ASHBY },
    { name: "LangChain", slug: "langchain", careersUrl: "https://jobs.ashbyhq.com/langchain", atsType: AtsType.ASHBY },
    { name: "Modal Labs", slug: "modal", careersUrl: "https://jobs.ashbyhq.com/modal", atsType: AtsType.ASHBY },
    { name: "Supabase", slug: "supabase", careersUrl: "https://jobs.ashbyhq.com/supabase", atsType: AtsType.ASHBY },
    { name: "Neon", slug: "neon", careersUrl: "https://jobs.ashbyhq.com/neon", atsType: AtsType.ASHBY },
    { name: "Vercel", slug: "vercel", careersUrl: "https://jobs.ashbyhq.com/vercel", atsType: AtsType.ASHBY },
    { name: "Ramp", slug: "ramp", careersUrl: "https://jobs.ashbyhq.com/ramp", atsType: AtsType.ASHBY },
    { name: "Pinecone", slug: "pinecone", careersUrl: "https://jobs.ashbyhq.com/pinecone", atsType: AtsType.ASHBY },
    { name: "Resend", slug: "resend", careersUrl: "https://jobs.ashbyhq.com/resend", atsType: AtsType.ASHBY },
    { name: "Clerk", slug: "clerk", careersUrl: "https://jobs.ashbyhq.com/clerk", atsType: AtsType.ASHBY },

    // Top Engineering & Cloud Leaders (Greenhouse)
    { name: "Stripe", slug: "stripe", careersUrl: "https://boards.greenhouse.io/stripe", atsType: AtsType.GREENHOUSE },
    { name: "Databricks", slug: "databricks", careersUrl: "https://boards.greenhouse.io/databricks", atsType: AtsType.GREENHOUSE },
    { name: "Cloudflare", slug: "cloudflare", careersUrl: "https://boards.greenhouse.io/cloudflare", atsType: AtsType.GREENHOUSE },
    { name: "Figma", slug: "figma", careersUrl: "https://boards.greenhouse.io/figma", atsType: AtsType.GREENHOUSE },
    { name: "Reddit", slug: "reddit", careersUrl: "https://boards.greenhouse.io/reddit", atsType: AtsType.GREENHOUSE },
    { name: "DoorDash", slug: "doordash", careersUrl: "https://boards.greenhouse.io/doordash", atsType: AtsType.GREENHOUSE },
    { name: "Coinbase", slug: "coinbase", careersUrl: "https://boards.greenhouse.io/coinbase", atsType: AtsType.GREENHOUSE },
    { name: "Datadog", slug: "datadog", careersUrl: "https://boards.greenhouse.io/datadog", atsType: AtsType.GREENHOUSE },
    { name: "MongoDB", slug: "mongodb", careersUrl: "https://boards.greenhouse.io/mongodb", atsType: AtsType.GREENHOUSE },
    { name: "Elastic", slug: "elastic", careersUrl: "https://boards.greenhouse.io/elastic", atsType: AtsType.GREENHOUSE },
    { name: "Airbnb", slug: "airbnb", careersUrl: "https://boards.greenhouse.io/airbnb", atsType: AtsType.GREENHOUSE },
    { name: "Pinterest", slug: "pinterest", careersUrl: "https://boards.greenhouse.io/pinterest", atsType: AtsType.GREENHOUSE },
    { name: "GitLab", slug: "gitlab", careersUrl: "https://boards.greenhouse.io/gitlab", atsType: AtsType.GREENHOUSE },
    { name: "Discord", slug: "discord", careersUrl: "https://boards.greenhouse.io/discord", atsType: AtsType.GREENHOUSE },
    { name: "Robinhood", slug: "robinhood", careersUrl: "https://boards.greenhouse.io/robinhood", atsType: AtsType.GREENHOUSE },
    { name: "Scale AI", slug: "scaleai", careersUrl: "https://boards.greenhouse.io/scaleai", atsType: AtsType.GREENHOUSE },
    { name: "Affirm", slug: "affirm", careersUrl: "https://boards.greenhouse.io/affirm", atsType: AtsType.GREENHOUSE },
    { name: "Instacart", slug: "instacart", careersUrl: "https://boards.greenhouse.io/instacart", atsType: AtsType.GREENHOUSE },
    { name: "Gusto", slug: "gusto", careersUrl: "https://boards.greenhouse.io/gusto", atsType: AtsType.GREENHOUSE },
    { name: "Brex", slug: "brex", careersUrl: "https://boards.greenhouse.io/brex", atsType: AtsType.GREENHOUSE },
    { name: "Duolingo", slug: "duolingo", careersUrl: "https://boards.greenhouse.io/duolingo", atsType: AtsType.GREENHOUSE },
    { name: "PagerDuty", slug: "pagerduty", careersUrl: "https://boards.greenhouse.io/pagerduty", atsType: AtsType.GREENHOUSE },
    { name: "Dropbox", slug: "dropbox", careersUrl: "https://boards.greenhouse.io/dropbox", atsType: AtsType.GREENHOUSE },
    { name: "Twitch", slug: "twitch", careersUrl: "https://boards.greenhouse.io/twitch", atsType: AtsType.GREENHOUSE },

    // Top Indian Tech Unicorns & Global Hubs
    { name: "Swiggy", slug: "swiggy", careersUrl: "https://boards.greenhouse.io/swiggy", atsType: AtsType.GREENHOUSE },
    { name: "Razorpay", slug: "razorpay", careersUrl: "https://jobs.lever.co/razorpay", atsType: AtsType.LEVER },
    { name: "Zepto", slug: "zepto", careersUrl: "https://jobs.ashbyhq.com/zepto", atsType: AtsType.ASHBY },
    { name: "PhonePe", slug: "phonepe", careersUrl: "https://boards.greenhouse.io/phonepe", atsType: AtsType.GREENHOUSE },
    { name: "Groww", slug: "groww", careersUrl: "https://boards.greenhouse.io/groww", atsType: AtsType.GREENHOUSE },
    { name: "InMobi", slug: "inmobi", careersUrl: "https://boards.greenhouse.io/inmobi", atsType: AtsType.GREENHOUSE },
    { name: "Postman", slug: "postman", careersUrl: "https://jobs.lever.co/postman", atsType: AtsType.LEVER },
    { name: "BrowserStack", slug: "browserstack", careersUrl: "https://jobs.lever.co/browserstack", atsType: AtsType.LEVER },
    { name: "CRED", slug: "cred", careersUrl: "https://jobs.lever.co/cred", atsType: AtsType.LEVER },
    { name: "Meesho", slug: "meesho", careersUrl: "https://jobs.lever.co/meesho", atsType: AtsType.LEVER },
    { name: "Notion", slug: "notion", careersUrl: "https://jobs.lever.co/notion", atsType: AtsType.LEVER },
    { name: "Linear", slug: "linear", careersUrl: "https://jobs.lever.co/linear", atsType: AtsType.LEVER },
  ];

  for (const company of companies) {
    await prisma.company.upsert({
      where: { slug: company.slug },
      update: { careersUrl: company.careersUrl, atsType: company.atsType },
      create: {
        ...company,
        applyMode: ApplyMode.REVIEW,
        pollingIntervalMinutes: 5,
        isActive: true, // Active so jobs start getting detected automatically
        isPaused: false,
      },
    });
  }
  console.log("✅ Famous companies seeded successfully");

  // ── Sample Job Filter ─────────────────────────────────────────────────────
  const existingFilter = await prisma.jobFilter.findFirst();
  if (!existingFilter) {
    await prisma.jobFilter.create({
      data: {
        name: "Default Filter",
        isActive: true,
        includeTitleKeywords: [
          "software engineer",
          "software developer",
          "swe",
          "backend",
          "fullstack",
          "full stack",
          "full-stack",
          "platform engineer",
        ],
        excludeTitleKeywords: ["senior", "staff", "principal", "director", "manager", "vp", "vice president"],
        allowedLocations: [],
        allowRemote: true,
        allowOnsite: true,
        allowHybrid: true,
        experienceLevels: ["intern", "new_grad", "junior"],
        graduationBatch: "2025",
      },
    });
    console.log("✅ Default job filter created");
  }

  console.log("\n🎉 Database seeded successfully!");
  console.log("\nNext steps:");
  console.log("  1. Upload your resume(s) via the Resumes page");
  console.log("  2. Update your profile via the Profile page");
  console.log("  3. Add target companies via the Companies page");
  console.log("  4. Activate companies to start polling");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
