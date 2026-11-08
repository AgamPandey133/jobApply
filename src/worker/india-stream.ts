import axios from "axios";
import * as cheerio from "cheerio";
import prisma from "@/lib/db";
import { AtsType, JobStatus } from "@/generated/client";
import { parseSalary } from "@/lib/salary-parser";

interface ScrapedIndiaJob {
  externalId: string;
  title: string;
  companyName: string;
  location: string;
  url: string;
  description: string;
  isRemote: boolean;
  postedAt?: Date;
}

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0",
];

const INDIA_LOCATION_NAMES = [
  "India",
  "Bengaluru, Karnataka, India",
  "Hyderabad, Telangana, India",
  "Pune, Maharashtra, India",
  "Gurgaon, Haryana, India",
  "Noida, Uttar Pradesh, India",
  "Mumbai, Maharashtra, India",
  "Chennai, Tamil Nadu, India",
  "Delhi, India",
  "Remote, India",
];

// Rich matrix of Indian tech job titles
const INDIA_TECH_ROLES = [
  // Core Software Engineering
  "Software Engineer",
  "Software Development Engineer",
  "SDE 1",
  "SDE",
  "Junior Software Engineer",
  "Associate Software Engineer",
  "Graduate Engineer Trainee",
  
  // Full Stack & Web
  "Full Stack Developer",
  "Full Stack Engineer",
  "Frontend Developer",
  "Frontend Engineer",
  "Backend Developer",
  "Backend Engineer",
  "React Developer",
  "Node.js Developer",
  "Java Developer",
  "Python Developer",
  "Golang Developer",
  
  // Mobile & Android
  "Android Developer",
  "Android Engineer",
  "Mobile Developer",
  "iOS Developer",
  "Flutter Developer",
  
  // AI, ML & Data
  "AI Engineer",
  "Machine Learning Engineer",
  "Data Scientist",
  "Data Engineer",
  "LLM Engineer",
  
  // DevOps & Cloud
  "DevOps Engineer",
  "Cloud Engineer",
  "Site Reliability Engineer",
  
  // Internships & Freshers
  "Software Engineer Intern",
  "Software Development Intern",
  "Frontend Intern",
  "Backend Intern",
  "Android Intern",
  "AI ML Intern",
  "Data Science Intern",
  "Web Developer Intern",
];

function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── 1. Scrape LinkedIn India Stream ───────────────────────────────────────────
export async function scrapeLinkedInStream(batchSize: number = 8): Promise<ScrapedIndiaJob[]> {
  const jobs: ScrapedIndiaJob[] = [];
  const seenUrls = new Set<string>();

  // Pick a random sample of roles and locations for this batch to ensure diverse coverage
  const shuffledRoles = [...INDIA_TECH_ROLES].sort(() => 0.5 - Math.random()).slice(0, batchSize);
  const shuffledLocs = [...INDIA_LOCATION_NAMES].sort(() => 0.5 - Math.random());

  for (let i = 0; i < shuffledRoles.length; i++) {
    const role = shuffledRoles[i];
    const loc = shuffledLocs[i % shuffledLocs.length];

    const targetUrl = `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=${encodeURIComponent(
      role
    )}&location=${encodeURIComponent(loc)}&sortBy=DD&start=0`;

    try {
      const { data: html } = await axios.get<string>(targetUrl, {
        timeout: 10000,
        headers: {
          "User-Agent": getRandomUserAgent(),
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });

      const $ = cheerio.load(html);
      $("li").each((_, elem) => {
        const el = $(elem);
        const title = el.find(".base-search-card__title").text().trim();
        const comp = el.find(".base-search-card__subtitle").text().trim();
        const location = el.find(".job-search-card__location").text().trim();
        const rawLink = el.find("a.base-card__full-link").attr("href");
        const link = rawLink ? rawLink.split("?")[0] : "";
        const urn = el.find(".base-card").attr("data-entity-urn") || "";
        const id =
          urn.replace(/\D/g, "") ||
          Buffer.from(link).toString("base64").slice(0, 24);

        if (title && link && !seenUrls.has(link)) {
          seenUrls.add(link);
          jobs.push({
            externalId: `li-${id}`,
            title: comp ? `${title} (${comp})` : title,
            companyName: comp || "LinkedIn Jobs",
            location: location || loc,
            url: link,
            description: `${title} at ${comp}. Location: ${location || loc}. Apply directly via LinkedIn India.`,
            isRemote: /remote/i.test(location) || /remote/i.test(title),
            postedAt: new Date(),
          });
        }
      });
    } catch (err: any) {
      console.warn(`[IndiaStream] LinkedIn query "${role}" in "${loc}" notice:`, err.message);
    }

    // Short polite pause between queries
    await sleep(1500);
  }

  return jobs;
}

// ── 2. Scrape Greenhouse Tech Hubs in India ─────────────────────────────────────
const GREENHOUSE_INDIA_COMPANIES = [
  { slug: "inmobi", name: "InMobi" },
  { slug: "groww", name: "Groww" },
  { slug: "phonepe", name: "PhonePe" },
  { slug: "databricks", name: "Databricks India" },
  { slug: "stripe", name: "Stripe India" },
  { slug: "cloudflare", name: "Cloudflare India" },
  { slug: "mongodb", name: "MongoDB India" },
  { slug: "datadog", name: "Datadog India" },
  { slug: "uber", name: "Uber India" },
  { slug: "grab", name: "Grab India" },
  { slug: "atlassian", name: "Atlassian India" },
  { slug: "nutanix", name: "Nutanix India" },
  { slug: "sprinklr", name: "Sprinklr India" },
];

export async function scrapeGreenhouseIndia(): Promise<ScrapedIndiaJob[]> {
  const jobs: ScrapedIndiaJob[] = [];

  for (const comp of GREENHOUSE_INDIA_COMPANIES) {
    try {
      const res = await axios.get(`https://boards-api.greenhouse.io/v1/boards/${comp.slug}/jobs?content=true`, {
        timeout: 10000,
      });
      const ghJobs = res.data?.jobs || [];
      for (const j of ghJobs) {
        const loc = j.location?.name || "";
        const isIndia = /india|bengaluru|bangalore|hyderabad|pune|gurgaon|noida|mumbai|chennai|remote/i.test(loc);
        if (isIndia) {
          jobs.push({
            externalId: `gh-${comp.slug}-${j.id}`,
            title: `${j.title} (${comp.name})`,
            companyName: comp.name,
            location: loc || "India",
            url: j.absolute_url || `https://job-boards.greenhouse.io/${comp.slug}/jobs/${j.id}`,
            description: j.content || j.title,
            isRemote: /remote/i.test(loc) || /remote/i.test(j.title),
            postedAt: j.updated_at ? new Date(j.updated_at) : new Date(),
          });
        }
      }
    } catch {
      // ignore individual company failures
    }
    await sleep(400);
  }

  return jobs;
}

// ── 3. Main Ingestion Function: Ingest India Jobs into Database ─────────────────
export async function ingestIndiaJobs(batchSize: number = 8): Promise<{
  totalScanned: number;
  newInserted: number;
}> {
  console.log(`[IndiaStream] Starting Indian tech jobs ingestion batch...`);

  const [linkedInJobs, greenhouseJobs] = await Promise.all([
    scrapeLinkedInStream(batchSize),
    scrapeGreenhouseIndia(),
  ]);

  const allFound = [...linkedInJobs, ...greenhouseJobs];
  let inserted = 0;

  for (const item of allFound) {
    try {
      // Find or create company
      let comp = await prisma.company.findFirst({
        where: { name: { equals: item.companyName, mode: "insensitive" } },
      });

      if (!comp) {
        const slug = item.companyName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "");

        comp = await prisma.company.create({
          data: {
            name: item.companyName,
            slug: slug || `comp-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            careersUrl: item.url,
            atsType: AtsType.CUSTOM,
            isActive: true,
          },
        });
      }

      // Check if job exists
      const existing = await prisma.job.findFirst({
        where: {
          OR: [
            { externalId: item.externalId },
            { url: item.url },
            {
              companyId: comp.id,
              title: item.title,
            },
          ],
        },
      });

      if (!existing) {
        await prisma.job.create({
          data: {
            externalId: item.externalId,
            companyId: comp.id,
            title: item.title,
            location: item.location,
            isRemote: item.isRemote,
            description: item.description,
            url: item.url,
            atsType: comp.atsType,
            status: JobStatus.NEW,
            firstSeenAt: new Date(),
            postedAt: item.postedAt || new Date(),
          },
        });
        inserted++;
      }
    } catch {
      // ignore duplicate conflicts
    }
  }

  if (inserted > 0) {
    // Create an in-app Notification
    try {
      await prisma.notification.create({
        data: {
          title: `🇮🇳 ${inserted} New India Tech Jobs Ingested!`,
          message: `Discovered and added ${inserted} fresh jobs across Indian startups, MNCs, and LinkedIn.`,
          type: "INFO",
          link: "/jobs?indiaOnly=true",
        },
      });
    } catch {
      /* ignore */
    }
  }

  console.log(`[IndiaStream] Ingestion finished. Scanned: ${allFound.length}, New inserted: ${inserted}`);
  return { totalScanned: allFound.length, newInserted: inserted };
}
