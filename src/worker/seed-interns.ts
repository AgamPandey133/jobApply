import axios from "axios";
import * as cheerio from "cheerio";
import prisma from "../lib/db";
import { AtsType, JobStatus } from "../generated/client";

interface ScrapedJob {
  externalId: string;
  title: string;
  companyName: string;
  location: string;
  url: string;
  description: string;
  isRemote: boolean;
}

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0",
];

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function scrapeLinkedInQueries(): Promise<ScrapedJob[]> {
  const queries = [
    { kw: "Software Engineer Intern", loc: "India" },
    { kw: "Graduate Engineer Trainee", loc: "India" },
    { kw: "Associate Software Engineer", loc: "India" },
    { kw: "Android Intern", loc: "India" },
    { kw: "Frontend Intern", loc: "India" },
    { kw: "AI ML Intern", loc: "India" },
    { kw: "Software Engineering Intern", loc: "India" },
    { kw: "Software Development Engineer Intern", loc: "India" },
    { kw: "SDE Intern", loc: "India" },
    { kw: "Web Developer Intern", loc: "India" },
  ];

  const results: ScrapedJob[] = [];
  const seenUrls = new Set<string>();

  for (let i = 0; i < queries.length; i++) {
    const q = queries[i];
    const userAgent = USER_AGENTS[i % USER_AGENTS.length];
    const url = `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=${encodeURIComponent(
      q.kw
    )}&location=${encodeURIComponent(q.loc)}&start=0`;

    console.log(`[LinkedIn] Scraping query: "${q.kw}" (${q.loc})`);
    try {
      const res = await axios.get<string>(url, {
        timeout: 12000,
        headers: {
          "User-Agent": userAgent,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });

      const $ = cheerio.load(res.data);
      let count = 0;

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
          count++;
          results.push({
            externalId: `li-${id}`,
            title: comp ? `${title} (${comp})` : title,
            companyName: comp || "LinkedIn Jobs",
            location: location || "India",
            url: link,
            description: `${title} at ${comp}. Location: ${location}. Apply directly on LinkedIn.`,
            isRemote: /remote/i.test(location) || /remote/i.test(title),
          });
        }
      });

      console.log(`[LinkedIn] Query "${q.kw}" yielded ${count} jobs.`);
    } catch (err: any) {
      console.warn(`[LinkedIn] Query "${q.kw}" error: ${err.message}`);
    }

    // Polite delay between queries to avoid 429
    await sleep(2200);
  }

  return results;
}

// Scrape additional top Indian and global internship aggregators
async function scrapeJobicyInterns(): Promise<ScrapedJob[]> {
  const results: ScrapedJob[] = [];
  try {
    const { data } = await axios.get<{ jobs?: any[] }>(
      "https://jobicy.com/api/v2/remote-jobs?count=50&tag=engineering",
      { timeout: 12000 }
    );
    if (Array.isArray(data?.jobs)) {
      for (const item of data.jobs) {
        if (!item.id || !item.jobTitle) continue;
        const isEarly = /intern|junior|entry|fresher|graduate|associate|trainee/i.test(
          item.jobTitle
        );
        if (isEarly) {
          results.push({
            externalId: `jobicy-${item.id}`,
            title: item.companyName
              ? `${item.jobTitle} (${item.companyName})`
              : item.jobTitle,
            companyName: item.companyName || "Jobicy",
            location: item.jobGeo || "Remote",
            url: item.url || `https://jobicy.com/jobs/${item.id}`,
            description: item.jobDescription || "",
            isRemote: true,
          });
        }
      }
    }
    console.log(`[Jobicy] Yielded ${results.length} early-career jobs.`);
  } catch (err: any) {
    console.warn(`[Jobicy] Error: ${err.message}`);
  }
  return results;
}

async function scrapeGreenhouseCompanyInterns(companySlug: string, companyName: string): Promise<ScrapedJob[]> {
  const results: ScrapedJob[] = [];
  try {
    const res = await axios.get(`https://boards-api.greenhouse.io/v1/boards/${companySlug}/jobs?content=true`, {
      timeout: 12000,
    });
    const jobs = res.data.jobs || [];
    for (const j of jobs) {
      const isEarly = /\b(intern|interns|internship|trainee|fresher|new grad|graduate|junior|associate)\b/i.test(
        j.title
      );
      if (isEarly && !/\binternational\b/i.test(j.title.replace(/internship|intern/i, ""))) {
        results.push({
          externalId: `gh-${companySlug}-${j.id}`,
          title: `${j.title} (${companyName})`,
          companyName,
          location: j.location?.name || "Multiple Locations",
          url: j.absolute_url || `https://job-boards.greenhouse.io/${companySlug}/jobs/${j.id}`,
          description: j.content || j.title,
          isRemote: /remote/i.test(j.location?.name || "") || /remote/i.test(j.title),
        });
      }
    }
    console.log(`[Greenhouse - ${companyName}] Yielded ${results.length} intern/early-career jobs.`);
  } catch (err: any) {
    console.warn(`[Greenhouse - ${companyName}] Error: ${err.message}`);
  }
  return results;
}

export async function populateInternJobs() {
  console.log("=== Starting Freshers & Interns Population ===");

  // 1. Ensure a dedicated Company record exists for LinkedIn Jobs
  let linkedInComp = await prisma.company.findUnique({
    where: { slug: "linkedin" },
  });
  if (!linkedInComp) {
    linkedInComp = await prisma.company.create({
      data: {
        name: "LinkedIn Jobs (India & Global)",
        slug: "linkedin",
        careersUrl:
          "https://www.linkedin.com/jobs/search?keywords=Software+Engineer+Intern&location=India",
        atsType: AtsType.CUSTOM,
        pollingIntervalMinutes: 2,
        applyMode: "REVIEW",
        isActive: true,
      },
    });
  }

  // 2. Scrape LinkedIn Guest API
  const linkedInJobs = await scrapeLinkedInQueries();

  // 3. Scrape Jobicy
  const jobicyJobs = await scrapeJobicyInterns();

  // 4. Scrape top Greenhouse tech companies with active early career programs
  const topGreenhouseBoards = [
    { slug: "affirm", name: "Affirm" },
    { slug: "scaleai", name: "Scale AI" },
    { slug: "databricks", name: "Databricks" },
    { slug: "stripe", name: "Stripe" },
    { slug: "cloudflare", name: "Cloudflare" },
    { slug: "datadog", name: "Datadog" },
    { slug: "mongodb", name: "MongoDB" },
    { slug: "postman", name: "Postman" },
    { slug: "browserstack", name: "BrowserStack" },
    { slug: "harness", name: "Harness" },
    { slug: "groww", name: "Groww" },
  ];

  const ghJobs: ScrapedJob[] = [];
  for (const b of topGreenhouseBoards) {
    const list = await scrapeGreenhouseCompanyInterns(b.slug, b.name);
    ghJobs.push(...list);
    await sleep(500);
  }

  const allFound = [...linkedInJobs, ...jobicyJobs, ...ghJobs];
  console.log(`\nTotal scraped early-career/intern jobs: ${allFound.length}`);

  let inserted = 0;
  let updated = 0;

  for (const job of allFound) {
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
            slug: slug || `comp-${Date.now()}`,
            careersUrl: job.url,
            atsType: AtsType.CUSTOM,
            isActive: true,
          },
        });
      }

      // Check if job already exists
      const existing = await prisma.job.findFirst({
        where: {
          OR: [
            { externalId: job.externalId },
            { url: job.url },
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
          },
        });
        inserted++;
      } else {
        // If it was FILTERED by the old rule, reset to NEW
        if (existing.status === JobStatus.FILTERED) {
          await prisma.job.update({
            where: { id: existing.id },
            data: { status: JobStatus.NEW, filterReason: null },
          });
          updated++;
        }
      }
    } catch (err: any) {
      console.warn(`Error storing job "${job.title}":`, err.message);
    }
  }

  console.log(`=== Done! Inserted ${inserted} new jobs, reset/updated ${updated} jobs to NEW. ===`);
}

if (require.main === module) {
  populateInternJobs()
    .then(() => prisma.$disconnect())
    .catch((err) => {
      console.error(err);
      prisma.$disconnect();
    });
}
