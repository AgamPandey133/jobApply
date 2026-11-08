import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { detectAtsAsync, slugifyCompany } from "@/lib/ats-detector";

// In-memory cache for companies (30s TTL)
let companiesCache: { data: any; timestamp: number } | null = null;
let lightCache: { data: any; timestamp: number } | null = null;
const CACHE_TTL_MS = 30 * 1000;

export function invalidateCompaniesCache() {
  companiesCache = null;
  lightCache = null;
}

// GET all companies
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const isLight = searchParams.get("light") === "true";
  const now = Date.now();

  // Fast path: light list for dropdowns (id, name, atsType)
  if (isLight) {
    if (lightCache && now - lightCache.timestamp < CACHE_TTL_MS) {
      return NextResponse.json(lightCache.data, {
        headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" },
      });
    }
    const light = await prisma.company.findMany({
      where: { isActive: true },
      select: { id: true, name: true, atsType: true },
      orderBy: { name: "asc" },
    });
    lightCache = { data: light, timestamp: now };
    return NextResponse.json(light, {
      headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" },
    });
  }

  // Full companies list with caching
  if (companiesCache && now - companiesCache.timestamp < CACHE_TTL_MS) {
    return NextResponse.json(companiesCache.data, {
      headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" },
    });
  }

  try {
    const [companies, jobCounts] = await Promise.all([
      prisma.company.findMany({
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          slug: true,
          careersUrl: true,
          atsType: true,
          pollingIntervalMinutes: true,
          applyMode: true,
          isActive: true,
          isPaused: true,
          lastPolledAt: true,
          jobsCount: true,
          createdAt: true,
        },
      }),
      prisma.job.groupBy({
        by: ["companyId"],
        _count: { id: true },
      }),
    ]);

    const countMap = new Map<string, number>();
    for (const c of jobCounts) {
      countMap.set(c.companyId, c._count.id);
    }

    const merged = companies.map((comp) => ({
      ...comp,
      _count: { jobs: countMap.get(comp.id) ?? comp.jobsCount ?? 0 },
    }));

    companiesCache = { data: merged, timestamp: now };
    return NextResponse.json(merged, {
      headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" },
    });
  } catch (err: any) {
    console.error("[api/companies] Error fetching companies:", err);
    return NextResponse.json({ error: "Failed to fetch companies" }, { status: 500 });
  }
}

// POST: Add a new company or seed famous companies
export async function POST(req: NextRequest) {
  const body = await req.json();

  if (body.action === "seed_famous") {
    const famous = [
      // ── Major Tech Job Boards ──
      { name: "RemoteOK", slug: "remoteok", careersUrl: "https://remoteok.com/api", atsType: "CUSTOM" },
      { name: "Arbeitnow", slug: "arbeitnow", careersUrl: "https://www.arbeitnow.com/api/job-board-api", atsType: "CUSTOM" },
      { name: "Jobicy", slug: "jobicy", careersUrl: "https://jobicy.com/api/v2/remote-jobs", atsType: "CUSTOM" },

      // ── Global Tech Giants & AI Labs ──
      { name: "OpenAI", slug: "openai", careersUrl: "https://jobs.ashbyhq.com/openai", atsType: "ASHBY" },
      { name: "Anthropic", slug: "anthropic", careersUrl: "https://jobs.ashbyhq.com/anthropic", atsType: "ASHBY" },
      { name: "Perplexity AI", slug: "perplexity", careersUrl: "https://jobs.ashbyhq.com/perplexity", atsType: "ASHBY" },
      { name: "Cohere", slug: "cohere", careersUrl: "https://jobs.ashbyhq.com/cohere", atsType: "ASHBY" },
      { name: "LangChain", slug: "langchain", careersUrl: "https://jobs.ashbyhq.com/langchain", atsType: "ASHBY" },
      { name: "Modal Labs", slug: "modal", careersUrl: "https://jobs.ashbyhq.com/modal", atsType: "ASHBY" },
      { name: "Supabase", slug: "supabase", careersUrl: "https://jobs.ashbyhq.com/supabase", atsType: "ASHBY" },
      { name: "Neon", slug: "neon", careersUrl: "https://jobs.ashbyhq.com/neon", atsType: "ASHBY" },
      { name: "Vercel", slug: "vercel", careersUrl: "https://jobs.ashbyhq.com/vercel", atsType: "ASHBY" },
      { name: "Ramp", slug: "ramp", careersUrl: "https://jobs.ashbyhq.com/ramp", atsType: "ASHBY" },
      { name: "Pinecone", slug: "pinecone", careersUrl: "https://jobs.ashbyhq.com/pinecone", atsType: "ASHBY" },
      { name: "Resend", slug: "resend", careersUrl: "https://jobs.ashbyhq.com/resend", atsType: "ASHBY" },
      { name: "Clerk", slug: "clerk", careersUrl: "https://jobs.ashbyhq.com/clerk", atsType: "ASHBY" },

      // ── Top Engineering & Cloud Leaders (Greenhouse) ──
      { name: "Stripe", slug: "stripe", careersUrl: "https://boards.greenhouse.io/stripe", atsType: "GREENHOUSE" },
      { name: "Databricks", slug: "databricks", careersUrl: "https://boards.greenhouse.io/databricks", atsType: "GREENHOUSE" },
      { name: "Cloudflare", slug: "cloudflare", careersUrl: "https://boards.greenhouse.io/cloudflare", atsType: "GREENHOUSE" },
      { name: "Figma", slug: "figma", careersUrl: "https://boards.greenhouse.io/figma", atsType: "GREENHOUSE" },
      { name: "Reddit", slug: "reddit", careersUrl: "https://boards.greenhouse.io/reddit", atsType: "GREENHOUSE" },
      { name: "DoorDash", slug: "doordash", careersUrl: "https://boards.greenhouse.io/doordash", atsType: "GREENHOUSE" },
      { name: "Coinbase", slug: "coinbase", careersUrl: "https://boards.greenhouse.io/coinbase", atsType: "GREENHOUSE" },
      { name: "Datadog", slug: "datadog", careersUrl: "https://boards.greenhouse.io/datadog", atsType: "GREENHOUSE" },
      { name: "MongoDB", slug: "mongodb", careersUrl: "https://boards.greenhouse.io/mongodb", atsType: "GREENHOUSE" },
      { name: "Elastic", slug: "elastic", careersUrl: "https://boards.greenhouse.io/elastic", atsType: "GREENHOUSE" },
      { name: "Airbnb", slug: "airbnb", careersUrl: "https://boards.greenhouse.io/airbnb", atsType: "GREENHOUSE" },
      { name: "Pinterest", slug: "pinterest", careersUrl: "https://boards.greenhouse.io/pinterest", atsType: "GREENHOUSE" },
      { name: "GitLab", slug: "gitlab", careersUrl: "https://boards.greenhouse.io/gitlab", atsType: "GREENHOUSE" },
      { name: "Discord", slug: "discord", careersUrl: "https://boards.greenhouse.io/discord", atsType: "GREENHOUSE" },
      { name: "Robinhood", slug: "robinhood", careersUrl: "https://boards.greenhouse.io/robinhood", atsType: "GREENHOUSE" },
      { name: "Scale AI", slug: "scaleai", careersUrl: "https://boards.greenhouse.io/scaleai", atsType: "GREENHOUSE" },
      { name: "Affirm", slug: "affirm", careersUrl: "https://boards.greenhouse.io/affirm", atsType: "GREENHOUSE" },
      { name: "Instacart", slug: "instacart", careersUrl: "https://boards.greenhouse.io/instacart", atsType: "GREENHOUSE" },
      { name: "Gusto", slug: "gusto", careersUrl: "https://boards.greenhouse.io/gusto", atsType: "GREENHOUSE" },
      { name: "Brex", slug: "brex", careersUrl: "https://boards.greenhouse.io/brex", atsType: "GREENHOUSE" },
      { name: "Duolingo", slug: "duolingo", careersUrl: "https://boards.greenhouse.io/duolingo", atsType: "GREENHOUSE" },
      { name: "PagerDuty", slug: "pagerduty", careersUrl: "https://boards.greenhouse.io/pagerduty", atsType: "GREENHOUSE" },
      { name: "Dropbox", slug: "dropbox", careersUrl: "https://boards.greenhouse.io/dropbox", atsType: "GREENHOUSE" },
      { name: "Twitch", slug: "twitch", careersUrl: "https://boards.greenhouse.io/twitch", atsType: "GREENHOUSE" },

      // ── Top Indian Tech Unicorns & Global Hubs ──
      { name: "Swiggy", slug: "swiggy", careersUrl: "https://boards.greenhouse.io/swiggy", atsType: "GREENHOUSE" },
      { name: "Razorpay", slug: "razorpay", careersUrl: "https://jobs.lever.co/razorpay", atsType: "LEVER" },
      { name: "Zepto", slug: "zepto", careersUrl: "https://jobs.ashbyhq.com/zepto", atsType: "ASHBY" },
      { name: "PhonePe", slug: "phonepe", careersUrl: "https://boards.greenhouse.io/phonepe", atsType: "GREENHOUSE" },
      { name: "Groww", slug: "groww", careersUrl: "https://boards.greenhouse.io/groww", atsType: "GREENHOUSE" },
      { name: "InMobi", slug: "inmobi", careersUrl: "https://boards.greenhouse.io/inmobi", atsType: "GREENHOUSE" },
      { name: "Postman", slug: "postman", careersUrl: "https://jobs.lever.co/postman", atsType: "LEVER" },
      { name: "BrowserStack", slug: "browserstack", careersUrl: "https://jobs.lever.co/browserstack", atsType: "LEVER" },
      { name: "CRED", slug: "cred", careersUrl: "https://jobs.lever.co/cred", atsType: "LEVER" },
      { name: "Meesho", slug: "meesho", careersUrl: "https://jobs.lever.co/meesho", atsType: "LEVER" },
      { name: "Notion", slug: "notion", careersUrl: "https://jobs.lever.co/notion", atsType: "LEVER" },
      { name: "Linear", slug: "linear", careersUrl: "https://jobs.lever.co/linear", atsType: "LEVER" },
    ];

    for (const c of famous) {
      await prisma.company.upsert({
        where: { slug: c.slug },
        update: { name: c.name, careersUrl: c.careersUrl, atsType: c.atsType as any },
        create: {
          name: c.name,
          slug: c.slug,
          careersUrl: c.careersUrl,
          atsType: c.atsType as any,
          pollingIntervalMinutes: 5,
          applyMode: "REVIEW",
          isActive: true,
          isPaused: false,
        },
      });
    }

    const all = await prisma.company.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { jobs: true } } },
    });
    return NextResponse.json(all);
  }

  const { name, careersUrl, pollingIntervalMinutes, applyMode } = body;

  if (!name || !careersUrl) {
    return NextResponse.json(
      { error: "name and careersUrl are required" },
      { status: 400 }
    );
  }

  const { atsType, slug: detectedSlug } = await detectAtsAsync(careersUrl);
  const slug = detectedSlug ?? slugifyCompany(name);

  try {
    const company = await prisma.company.create({
      data: {
        name,
        slug,
        careersUrl,
        atsType,
        pollingIntervalMinutes: pollingIntervalMinutes ?? 2,
        applyMode: applyMode ?? "REVIEW",
        isActive: true,
        isPaused: false,
      },
    });
    invalidateCompaniesCache();
    return NextResponse.json(company, { status: 201 });
  } catch (err) {
    if (String(err).includes("Unique constraint")) {
      return NextResponse.json(
        { error: "Company with this slug already exists" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Failed to create company" }, { status: 500 });
  }
}
