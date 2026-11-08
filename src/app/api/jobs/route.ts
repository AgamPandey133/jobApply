import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { Prisma, JobStatus } from "@/generated/client";

const ROLE_KEYWORD_MAP: Record<string, string[]> = {
  android: ["android", "kotlin", "mobile"],
  ai_ml: ["ai", "machine learning", "deep learning", "data scientist", "ml", "llm", "nlp"],
  sde: ["sde", "software engineer", "software development engineer", "swe"],
  fullstack: ["fullstack", "full-stack", "full stack"],
  backend: ["backend", "back-end", "go", "java", "node", "golang"],
  frontend: ["frontend", "front-end", "react", "web"],
  devops: ["devops", "cloud", "infrastructure", "platform", "sre"],
};

const EXP_KEYWORD_MAP: Record<string, string[]> = {
  intern: ["intern", "internship", "co-op", "trainee"],
  freshers: [
    "fresher",
    "fresh graduate",
    "new grad",
    "new graduate",
    "graduate",
    "entry",
    "campus",
    "trainee",
    "sde 1",
    "sde-1",
    "associate engineer",
    "associate software",
  ],
  "1-2_years": ["1 year", "2 year", "0-2 year", "1-2 year", "1-3 year", "1+ year", "2+ year"],
  junior: ["junior", "jr.", "jr ", "associate"],
  mid: ["mid-level", "mid level", "2-4 years", "3-5 years"],
};

// Fast in-memory cache for recent queries (10s TTL)
const jobsQueryCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL_MS = 10 * 1000;

export function invalidateJobsCache() {
  jobsQueryCache.clear();
}

import { parseSalary, matchesSalaryFilter } from "@/lib/salary-parser";

const INDIA_LOCATIONS = [
  "india", "bengaluru", "bangalore", "pune", "hyderabad", "gurgaon", "gurugram",
  "noida", "delhi", "mumbai", "chennai", "kolkata", "ahmedabad", "remote - india",
  "karnataka", "maharashtra", "telangana", "haryana", "uttar pradesh", "tamil nadu",
  "kochi", "coimbatore", "chandigarh", "indore", "jaipur"
];

export async function GET(req: NextRequest) {
  const cacheKey = req.url;
  const now = Date.now();
  const cached = jobsQueryCache.get(cacheKey);
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return NextResponse.json(cached.data, {
      headers: { "Cache-Control": "public, s-maxage=10, stale-while-revalidate=20" },
    });
  }
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? undefined;
  const company = searchParams.get("company") ?? undefined;
  const search = searchParams.get("search")?.trim() ?? undefined;
  const rolesParam = searchParams.get("roles")?.trim() ?? "";
  const expParam = searchParams.get("experience")?.trim() ?? "";
  const indiaOnly = searchParams.get("indiaOnly") === "true";
  const linkedinOnly = searchParams.get("linkedinOnly") === "true";
  const excludeLinkedin = searchParams.get("excludeLinkedin") === "true";
  const withinHours = searchParams.get("withinHours") ? parseFloat(searchParams.get("withinHours")!) : undefined;
  const includeUnspecified = searchParams.get("includeUnspecified") === "true";
  const salaryMode = (searchParams.get("salaryMode") as "lpa" | "monthly") || "all";
  const minLpa = searchParams.get("minLpa") ? parseFloat(searchParams.get("minLpa")!) : undefined;
  const maxLpa = searchParams.get("maxLpa") ? parseFloat(searchParams.get("maxLpa")!) : undefined;
  const minMonthly = searchParams.get("minMonthly") ? parseFloat(searchParams.get("minMonthly")!) : undefined;
  const maxMonthly = searchParams.get("maxMonthly") ? parseFloat(searchParams.get("maxMonthly")!) : undefined;
  const salaryOnly = searchParams.get("salaryOnly") === "true";
  const dismissedIdsParam = searchParams.get("dismissedIds")?.trim();
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(100, Math.max(10, parseInt(searchParams.get("limit") ?? "50")));

  try {
    const andConditions: Prisma.JobWhereInput[] = [];

    if (status) {
      andConditions.push({ status: status as JobStatus });
    } else {
      // By default exclude discarded/filtered/failed jobs from feed so user sees only active useful jobs
      andConditions.push({
        status: {
          notIn: [JobStatus.FILTERED, JobStatus.FAILED, JobStatus.SKIPPED_LOW_MATCH],
        },
      });
    }

    // Always exclude jobs marked as closed or expired
    andConditions.push({
      NOT: [
        { title: { contains: "[closed]", mode: "insensitive" } },
        { title: { contains: "(closed)", mode: "insensitive" } },
        { title: { contains: "position closed", mode: "insensitive" } },
        { title: { contains: "hiring closed", mode: "insensitive" } },
        { title: { contains: "no longer accepting", mode: "insensitive" } },
        { title: { contains: "test job", mode: "insensitive" } },
      ],
    });

    // Exclude client-dismissed jobs if provided
    if (dismissedIdsParam) {
      const dismissedIds = dismissedIdsParam.split(",").map((s) => s.trim()).filter(Boolean);
      if (dismissedIds.length > 0) {
        andConditions.push({ id: { notIn: dismissedIds } });
      }
    }

    if (company) {
      andConditions.push({ companyId: company });
    }

    if (search) {
      andConditions.push({
        OR: [
          { title: { contains: search, mode: "insensitive" } },
          { company: { name: { contains: search, mode: "insensitive" } } },
        ],
      });
    }

    // Handle India Only filter
    if (indiaOnly) {
      andConditions.push({
        OR: [
          ...INDIA_LOCATIONS.map((loc) => ({
            location: { contains: loc, mode: "insensitive" as const },
          })),
          { title: { contains: "india", mode: "insensitive" as const } },
        ],
      });
    }

    // Handle Experience filters
    if (expParam) {
      const selectedExpIds = expParam.split(",").map((s) => s.trim()).filter(Boolean);
      const expKeywords = Array.from(
        new Set(selectedExpIds.flatMap((id) => EXP_KEYWORD_MAP[id] || [id]))
      );

      if (expKeywords.length > 0) {
        andConditions.push({
          OR: expKeywords.map((kw) => ({
            title: { contains: kw, mode: "insensitive" },
          })),
        });
      }
    }

    // Handle Roles filters
    if (rolesParam) {
      const selectedRoleIds = rolesParam.split(",").map((s) => s.trim()).filter(Boolean);
      const roleKeywords = Array.from(
        new Set(selectedRoleIds.flatMap((id) => ROLE_KEYWORD_MAP[id] || [id]))
      );

      if (roleKeywords.length > 0) {
        andConditions.push({
          OR: roleKeywords.map((kw) => ({
            title: { contains: kw, mode: "insensitive" },
          })),
        });
      }
    }

    // Handle withinHours filter (e.g. within 10 hours)
    if (withinHours && withinHours > 0) {
      const cutoff = new Date(Date.now() - withinHours * 3600 * 1000);
      andConditions.push({
        OR: [
          { postedAt: { gte: cutoff } },
          { postedAt: null, firstSeenAt: { gte: cutoff } },
        ],
      });
    }

    // Handle LinkedIn only filter
    if (linkedinOnly) {
      andConditions.push({
        OR: [
          { url: { contains: "linkedin.com", mode: "insensitive" } },
          { externalId: { startsWith: "li-" } },
          { company: { name: { contains: "linkedin", mode: "insensitive" } } },
        ],
      });
    }

    // Handle Strict Exclude LinkedIn filter (for remaining / non-LinkedIn section)
    if (excludeLinkedin) {
      andConditions.push({
        NOT: [
          { url: { contains: "linkedin.com", mode: "insensitive" } },
          { externalId: { startsWith: "li-" } },
          { company: { name: { contains: "linkedin", mode: "insensitive" } } },
        ],
      });
    }

    // If salary filter is strictly demanded and NOT including unspecified jobs
    if (!includeUnspecified && (salaryOnly || (minLpa && minLpa > 0) || (minMonthly && minMonthly > 0))) {
      andConditions.push({
        OR: [
          { description: { contains: "lpa", mode: "insensitive" } },
          { description: { contains: "ctc", mode: "insensitive" } },
          { description: { contains: "stipend", mode: "insensitive" } },
          { description: { contains: "salary", mode: "insensitive" } },
          { description: { contains: "per month", mode: "insensitive" } },
          { description: { contains: "/mo", mode: "insensitive" } },
          { description: { contains: "₹", mode: "insensitive" } },
          { description: { contains: "inr", mode: "insensitive" } },
          { description: { contains: "rs.", mode: "insensitive" } },
          { description: { contains: "$", mode: "insensitive" } },
          { title: { contains: "lpa", mode: "insensitive" } },
          { title: { contains: "stipend", mode: "insensitive" } },
          { title: { contains: "₹", mode: "insensitive" } },
        ],
      });
    }

    const where: Prisma.JobWhereInput =
      andConditions.length > 0 ? { AND: andConditions } : {};

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where,
        take: limit,
        skip: (page - 1) * limit,
        orderBy: { firstSeenAt: "desc" },
        include: {
          company: { select: { id: true, name: true, atsType: true } },
          applications: {
            select: {
              id: true,
              status: true,
              matchScore: true,
              resume: { select: { id: true, label: true, name: true } },
            },
          },
        },
      }),
      prisma.job.count({ where }),
    ]);

    // Attach parsed salary to each job and slim down description for fast transfer
    let enhancedJobs = jobs.map((j) => {
      const fullText = `${j.title} ${(j.description || "").slice(0, 3500)}`;
      const salary = parseSalary(fullText);
      return {
        ...j,
        description: j.description ? j.description.slice(0, 600) : "",
        salary,
      };
    });

    if (salaryOnly || (minLpa && minLpa > 0) || (minMonthly && minMonthly > 0) || (maxLpa && maxLpa > 0) || (maxMonthly && maxMonthly > 0)) {
      enhancedJobs = enhancedJobs.filter((j) => {
        return matchesSalaryFilter(j.salary, {
          mode: salaryMode,
          minLpa,
          maxLpa,
          minMonthly,
          maxMonthly,
          includeUnspecified,
        });
      });
    }

    const result = { jobs: enhancedJobs, total, page, limit };
    jobsQueryCache.set(cacheKey, { data: result, timestamp: now });

    return NextResponse.json(result, {
      headers: { "Cache-Control": "public, s-maxage=10, stale-while-revalidate=20" },
    });
  } catch (err: any) {
    console.error("[api/jobs] Error fetching jobs:", err);
    return NextResponse.json({ error: "Failed to fetch jobs" }, { status: 500 });
  }
}

