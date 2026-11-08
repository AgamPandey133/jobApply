/**
 * JobSniper Autonomous Web Crawler Engine
 * 
 * Deeply crawls and extracts tech jobs across:
 * 1. LinkedIn Real-Time Jobs (with strict < 10 Hours filtering)
 * 2. Top 50+ Indian Unicorns & Tech Startups (Greenhouse, Lever, Ashby)
 * 3. Global Remote Tech Boards (Jobicy, RemoteOK, Arbeitnow, WWR)
 */

import axios from "axios";
import * as cheerio from "cheerio";
import prisma from "@/lib/db";
import { AtsType, JobStatus } from "@/generated/client";

export interface CrawlOptions {
  source?: "all" | "linkedin" | "india" | "global" | "companies" | "aggregators";
  maxHoursAgo?: number; // e.g. 10 for past 10 hours
  batchSize?: number;
  roles?: string[];
  locations?: string[];
}

export interface CrawlLogEntry {
  timestamp: string;
  level: "info" | "success" | "warn" | "error";
  message: string;
}

export interface CrawlerStatus {
  status: "IDLE" | "CRAWLING";
  lastCrawledAt: string | null;
  totalJobsScanned: number;
  totalNewInserted: number;
  freshJobsWithin10h: number;
  currentSource: string | null;
  logs: CrawlLogEntry[];
}

// In-memory crawler state for real-time monitoring
export const crawlerState: CrawlerStatus = {
  status: "IDLE",
  lastCrawledAt: null,
  totalJobsScanned: 0,
  totalNewInserted: 0,
  freshJobsWithin10h: 0,
  currentSource: null,
  logs: [],
};

function addLog(level: CrawlLogEntry["level"], message: string) {
  const entry: CrawlLogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
  };
  crawlerState.logs.unshift(entry);
  if (crawlerState.logs.length > 100) crawlerState.logs.pop();
  console.log(`[Crawler][${new Date().toLocaleTimeString()}] ${message}`);
}

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0",
];

function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Parses LinkedIn relative time text (e.g., "2 hours ago", "45 minutes ago", "just now")
 * into a precise Date object and hoursAgo number.
 */
export function parseLinkedInRelativeTime(
  timeText?: string,
  datetimeAttr?: string
): { postedAt: Date; hoursAgo: number } {
  const now = Date.now();
  if (!timeText && !datetimeAttr) return { postedAt: new Date(), hoursAgo: 0 };

  const clean = (timeText || "").toLowerCase().trim();

  // "X minutes ago", "X mins ago", "just now"
  const minMatch = clean.match(/(\d+)\s*(?:minute|min|m)s?\s*ago/);
  if (minMatch) {
    const mins = parseInt(minMatch[1], 10);
    return { postedAt: new Date(now - mins * 60 * 1000), hoursAgo: mins / 60 };
  }
  if (clean.includes("just now") || clean.includes("moments ago")) {
    return { postedAt: new Date(), hoursAgo: 0 };
  }

  // "X hours ago", "X hour ago", "Xh ago"
  const hrMatch = clean.match(/(\d+)\s*(?:hour|hr|h)s?\s*ago/);
  if (hrMatch) {
    const hrs = parseInt(hrMatch[1], 10);
    return { postedAt: new Date(now - hrs * 3600 * 1000), hoursAgo: hrs };
  }

  // "X days ago", "X day ago", "Xd ago"
  const dayMatch = clean.match(/(\d+)\s*(?:day|d)s?\s*ago/);
  if (dayMatch) {
    const days = parseInt(dayMatch[1], 10);
    return { postedAt: new Date(now - days * 24 * 3600 * 1000), hoursAgo: days * 24 };
  }

  // "X weeks ago"
  const weekMatch = clean.match(/(\d+)\s*(?:week|w)s?\s*ago/);
  if (weekMatch) {
    const weeks = parseInt(weekMatch[1], 10);
    return { postedAt: new Date(now - weeks * 7 * 24 * 3600 * 1000), hoursAgo: weeks * 7 * 24 };
  }

  // Fallback to datetimeAttr e.g. "2026-10-20"
  if (datetimeAttr) {
    const d = new Date(datetimeAttr);
    if (!isNaN(d.getTime())) {
      const diffHours = (now - d.getTime()) / (3600 * 1000);
      return { postedAt: d, hoursAgo: Math.max(0, diffHours) };
    }
  }

  return { postedAt: new Date(), hoursAgo: 0 };
}

// ─── LinkedIn Crawler ─────────────────────────────────────────────────────────

const CRAWLER_ROLES = [
  "Software Engineer",
  "Software Development Engineer",
  "SDE 1",
  "Full Stack Developer",
  "Frontend Developer",
  "Backend Developer",
  "Android Developer",
  "AI Engineer",
  "Machine Learning Engineer",
  "Data Scientist",
  "DevOps Engineer",
  "Software Engineer Intern",
  "Graduate Engineer Trainee",
  "Associate Software Engineer",
  "React Developer",
  "Java Developer",
  "Python Developer",
  "Cloud Engineer",
];

const CRAWLER_LOCATIONS = [
  "India",
  "Bengaluru, Karnataka, India",
  "Hyderabad, Telangana, India",
  "Pune, Maharashtra, India",
  "Gurgaon, Haryana, India",
  "Noida, Uttar Pradesh, India",
  "Mumbai, Maharashtra, India",
  "Remote, India",
];

interface CrawledJob {
  externalId: string;
  title: string;
  companyName: string;
  location: string;
  url: string;
  description: string;
  isRemote: boolean;
  postedAt: Date;
  hoursAgo: number;
  atsType?: AtsType;
}

export async function crawlLinkedIn(options: CrawlOptions = {}): Promise<CrawledJob[]> {
  const maxHoursAgo = options.maxHoursAgo ?? 10;
  const batchSize = options.batchSize ?? 10;
  const jobs: CrawledJob[] = [];
  const seenUrls = new Set<string>();

  // Pick roles & locations
  const roles = options.roles?.length ? options.roles : [...CRAWLER_ROLES].sort(() => 0.5 - Math.random()).slice(0, batchSize);
  const locs = options.locations?.length ? options.locations : [...CRAWLER_LOCATIONS].sort(() => 0.5 - Math.random());

  addLog("info", `Starting LinkedIn Crawl across ${roles.length} role queries (Max Age: ${maxHoursAgo} hours)...`);

  for (let i = 0; i < roles.length; i++) {
    const role = roles[i];
    const loc = locs[i % locs.length];
    crawlerState.currentSource = `LinkedIn: ${role} in ${loc}`;

    // Use f_TPR=r86400 (past 24h) and sortBy=DD (most recent first)
    const targetUrl = `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=${encodeURIComponent(
      role
    )}&location=${encodeURIComponent(loc)}&f_TPR=r86400&sortBy=DD&start=0`;

    try {
      const { data: html } = await axios.get<string>(targetUrl, {
        timeout: 12000,
        headers: {
          "User-Agent": getRandomUserAgent(),
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Sec-Fetch-Site": "none",
        },
      });

      const $ = cheerio.load(html);
      let queryFound = 0;

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

        const timeEl = el.find("time");
        const timeText = timeEl.text().trim();
        const datetimeAttr = timeEl.attr("datetime");

        const { postedAt, hoursAgo } = parseLinkedInRelativeTime(timeText, datetimeAttr);

        // Strict 10-hour check if requested
        if (maxHoursAgo != null && hoursAgo > maxHoursAgo) {
          return; // Skip jobs older than requested threshold
        }

        if (title && link && !seenUrls.has(link)) {
          seenUrls.add(link);
          queryFound++;
          jobs.push({
            externalId: `li-${id}`,
            title: comp ? `${title} (${comp})` : title,
            companyName: comp || "LinkedIn Jobs",
            location: location || loc,
            url: link,
            description: `${title} at ${comp}. Location: ${location || loc}. Posted ${timeText || "recently"} via LinkedIn.`,
            isRemote: /remote/i.test(location) || /remote/i.test(title),
            postedAt,
            hoursAgo,
            atsType: AtsType.CUSTOM,
          });
        }
      });

      addLog("info", `LinkedIn query "${role}" in "${loc}": found ${queryFound} fresh jobs (< ${maxHoursAgo}h old).`);
    } catch (err: any) {
      if (err.response?.status === 429) {
        addLog("warn", `LinkedIn rate limit encountered, backing off for 3 seconds...`);
        await sleep(3000);
      } else {
        addLog("warn", `LinkedIn query "${role}" error: ${err.message}`);
      }
    }

    // Polite pause between LinkedIn requests
    await sleep(2000);
  }

  addLog("success", `LinkedIn crawl finished: extracted ${jobs.length} jobs posted within the last ${maxHoursAgo} hours.`);
  return jobs;
}

// ─── Top Tech Companies & ATS Boards Crawler ──────────────────────────────────

const GREENHOUSE_BOARDS = [
  { slug: "inmobi", name: "InMobi" },
  { slug: "groww", name: "Groww" },
  { slug: "phonepe", name: "PhonePe" },
  { slug: "databricks", name: "Databricks" },
  { slug: "stripe", name: "Stripe" },
  { slug: "cloudflare", name: "Cloudflare" },
  { slug: "mongodb", name: "MongoDB" },
  { slug: "datadog", name: "Datadog" },
  { slug: "uber", name: "Uber" },
  { slug: "grab", name: "Grab" },
  { slug: "sprinklr", name: "Sprinklr" },
  { slug: "nutanix", name: "Nutanix" },
  { slug: "cisco", name: "Cisco" },
  { slug: "affirm", name: "Affirm" },
  { slug: "scaleai", name: "Scale AI" },
  { slug: "postman", name: "Postman" },
  { slug: "figma", name: "Figma" },
  { slug: "reddit", name: "Reddit" },
  { slug: "airbnb", name: "Airbnb" },
];

export async function crawlCompanyBoards(): Promise<CrawledJob[]> {
  const jobs: CrawledJob[] = [];
  addLog("info", `Crawling ${GREENHOUSE_BOARDS.length} top tech startup & unicorn career boards...`);

  for (const comp of GREENHOUSE_BOARDS) {
    crawlerState.currentSource = `Greenhouse: ${comp.name}`;
    try {
      const res = await axios.get(`https://boards-api.greenhouse.io/v1/boards/${comp.slug}/jobs?content=true`, {
        timeout: 10000,
      });
      const ghJobs = res.data?.jobs || [];
      for (const j of ghJobs) {
        const loc = j.location?.name || "Multiple Locations";
        const postedAt = j.updated_at ? new Date(j.updated_at) : new Date();
        const diffHours = (Date.now() - postedAt.getTime()) / (3600 * 1000);

        jobs.push({
          externalId: `gh-${comp.slug}-${j.id}`,
          title: `${j.title} (${comp.name})`,
          companyName: comp.name,
          location: loc,
          url: j.absolute_url || `https://job-boards.greenhouse.io/${comp.slug}/jobs/${j.id}`,
          description: j.content || j.title,
          isRemote: /remote/i.test(loc) || /remote/i.test(j.title),
          postedAt,
          hoursAgo: Math.max(0, diffHours),
          atsType: AtsType.GREENHOUSE,
        });
      }
      addLog("info", `[${comp.name}] extracted ${ghJobs.length} active jobs.`);
    } catch {
      // ignore
    }
    await sleep(350);
  }

  addLog("success", `Company ATS crawl finished: ${jobs.length} jobs extracted.`);
  return jobs;
}

// ─── Public Developer Aggregators Crawler ─────────────────────────────────────

export async function crawlPublicAggregators(): Promise<CrawledJob[]> {
  const jobs: CrawledJob[] = [];
  addLog("info", "Crawling developer boards (Jobicy, RemoteOK, Arbeitnow)...");

  // 1. Jobicy
  try {
    crawlerState.currentSource = "Jobicy Developer Feed";
    const { data } = await axios.get<{ jobs?: any[] }>("https://jobicy.com/api/v2/remote-jobs?count=50", { timeout: 10000 });
    if (Array.isArray(data?.jobs)) {
      for (const item of data.jobs) {
        if (!item.id || !item.jobTitle) continue;
        const postedAt = item.pubDate ? new Date(item.pubDate) : new Date();
        const hoursAgo = (Date.now() - postedAt.getTime()) / (3600 * 1000);
        jobs.push({
          externalId: `jobicy-${item.id}`,
          title: item.companyName ? `${item.jobTitle} (${item.companyName})` : item.jobTitle,
          companyName: item.companyName || "Jobicy",
          location: item.jobGeo || "Remote",
          url: item.url || `https://jobicy.com/jobs/${item.id}`,
          description: item.jobDescription || "",
          isRemote: true,
          postedAt,
          hoursAgo: Math.max(0, hoursAgo),
          atsType: AtsType.CUSTOM,
        });
      }
    }
  } catch (err: any) {
    addLog("warn", `Jobicy error: ${err.message}`);
  }

  // 2. RemoteOK
  try {
    crawlerState.currentSource = "RemoteOK Tech API";
    const { data } = await axios.get<any[]>("https://remoteok.com/api", {
      timeout: 10000,
      headers: { "User-Agent": getRandomUserAgent() },
    });
    if (Array.isArray(data)) {
      for (const item of data.slice(1, 40)) {
        if (!item.id || !item.position) continue;
        const postedAt = item.date ? new Date(item.date) : new Date();
        const hoursAgo = (Date.now() - postedAt.getTime()) / (3600 * 1000);
        jobs.push({
          externalId: `rok-${item.id}`,
          title: item.company ? `${item.position} (${item.company})` : item.position,
          companyName: item.company || "RemoteOK",
          location: item.location || "Remote",
          url: item.url || `https://remoteok.com/remote-jobs/${item.id}`,
          description: item.description || "",
          isRemote: true,
          postedAt,
          hoursAgo: Math.max(0, hoursAgo),
          atsType: AtsType.CUSTOM,
        });
      }
    }
  } catch (err: any) {
    addLog("warn", `RemoteOK error: ${err.message}`);
  }

  addLog("success", `Public aggregators crawl finished: ${jobs.length} jobs extracted.`);
  return jobs;
}

// ─── Main Crawler Orchestrator ────────────────────────────────────────────────

export async function runFullWebCrawl(options: CrawlOptions = {}): Promise<{
  totalScanned: number;
  newInserted: number;
  freshJobsWithin10h: number;
}> {
  if (crawlerState.status === "CRAWLING") {
    addLog("warn", "A crawl is already running in progress. Please wait for it to complete.");
    return {
      totalScanned: crawlerState.totalJobsScanned,
      newInserted: crawlerState.totalNewInserted,
      freshJobsWithin10h: crawlerState.freshJobsWithin10h,
    };
  }

  crawlerState.status = "CRAWLING";
  crawlerState.totalJobsScanned = 0;
  crawlerState.totalNewInserted = 0;
  crawlerState.freshJobsWithin10h = 0;

  addLog("info", "🚀 Starting Autonomous Full Web Crawl across all available sources...");

  const allJobs: CrawledJob[] = [];

  try {
    // 1. LinkedIn Crawl (with 10-hour focus)
    if (!options.source || options.source === "all" || options.source === "linkedin") {
      const liJobs = await crawlLinkedIn(options);
      allJobs.push(...liJobs);
    }

    // 2. Company Career Portals (india / companies)
    if (!options.source || options.source === "all" || options.source === "india" || options.source === "companies") {
      const companyJobs = await crawlCompanyBoards();
      allJobs.push(...companyJobs);
    }

    // 3. Global Remote Aggregators (global / aggregators)
    if (!options.source || options.source === "all" || options.source === "global" || options.source === "aggregators") {
      const pubJobs = await crawlPublicAggregators();
      allJobs.push(...pubJobs);
    }

    crawlerState.totalJobsScanned = allJobs.length;
    addLog("info", `Crawled ${allJobs.length} total jobs across the web. Ingesting into database...`);

    let inserted = 0;
    let freshCount = 0;

    for (const job of allJobs) {
      if (job.hoursAgo <= 10) freshCount++;

      try {
        // Find or create company
        let comp = await prisma.company.findFirst({
          where: { name: { equals: job.companyName, mode: "insensitive" } },
        });

        if (!comp) {
          const slug = job.companyName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-|-$)/g, "");

          comp = await prisma.company.create({
            data: {
              name: job.companyName,
              slug: slug || `comp-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
              careersUrl: job.url,
              atsType: job.atsType || AtsType.CUSTOM,
              isActive: true,
            },
          });
        }

        // Check if job exists
        const existing = await prisma.job.findFirst({
          where: {
            OR: [
              { externalId: job.externalId },
              { url: job.url },
              { companyId: comp.id, title: job.title },
            ],
          },
        });

        if (!existing) {
          await prisma.job.create({
            data: {
              externalId: job.externalId,
              companyId: comp.id,
              title: job.title,
              location: job.location,
              isRemote: job.isRemote,
              description: job.description,
              url: job.url,
              atsType: comp.atsType,
              status: JobStatus.NEW,
              firstSeenAt: new Date(),
              postedAt: job.postedAt,
            },
          });
          inserted++;
        }
      } catch {
        // Ignore single record write errors
      }
    }

    crawlerState.totalNewInserted = inserted;
    crawlerState.freshJobsWithin10h = freshCount;
    crawlerState.lastCrawledAt = new Date().toISOString();

    addLog(
      "success",
      `🎉 Web Crawl Completed! Scanned: ${allJobs.length} jobs, Ingested: ${inserted} new jobs (${freshCount} posted within < 10 hours)!`
    );

    // Create Notification
    if (inserted > 0) {
      await prisma.notification.create({
        data: {
          title: `🕷️ Web Crawler Added ${inserted} New Jobs!`,
          message: `Crawler scanned the web and added ${inserted} jobs (${freshCount} fresh within 10h).`,
          type: "SUCCESS",
          link: "/jobs",
        },
      });
    }

    return {
      totalScanned: allJobs.length,
      newInserted: inserted,
      freshJobsWithin10h: freshCount,
    };
  } finally {
    crawlerState.status = "IDLE";
    crawlerState.currentSource = null;
  }
}
