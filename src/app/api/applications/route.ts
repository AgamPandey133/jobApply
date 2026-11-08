import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

// In-memory cache for applications (8s TTL)
interface AppsCacheEntry {
  data: any;
  timestamp: number;
}
const appsCache = new Map<string, AppsCacheEntry>();
const APPS_CACHE_TTL_MS = 8000;

export function clearApplicationsCache() {
  appsCache.clear();
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? undefined;
  const limit = parseInt(searchParams.get("limit") ?? "100");

  const cacheKey = `${status || "all"}-${limit}`;
  const now = Date.now();
  const cached = appsCache.get(cacheKey);
  if (cached && now - cached.timestamp < APPS_CACHE_TTL_MS) {
    return NextResponse.json(cached.data, {
      headers: {
        "Cache-Control": "public, max-age=8, stale-while-revalidate=15",
      },
    });
  }

  const orderBy = status === "SUBMITTED"
    ? [{ submittedAt: "desc" as const }, { createdAt: "desc" as const }]
    : [{ createdAt: "desc" as const }];

  const where = status === "SUBMITTED"
    ? {
        OR: [
          { status: { in: ["SUBMITTED", "SUBMITTING"] as never } },
          { job: { status: "APPLIED" as never } },
        ],
      }
    : status
    ? { status: status as never }
    : {};

  const [applications, totalSubmitted, totalAwaiting] = await Promise.all([
    prisma.application.findMany({
      where,
      orderBy,
      take: limit,
      include: {
        job: {
          include: {
            company: { select: { id: true, name: true, atsType: true, slug: true } },
          },
        },
        resume: { select: { id: true, label: true, name: true } },
      },
    }),
    prisma.application.count({
      where: {
        OR: [
          { status: { in: ["SUBMITTED", "SUBMITTING"] as never } },
          { job: { status: "APPLIED" as never } },
        ],
      },
    }),
    prisma.application.count({ where: { status: "READY_FOR_REVIEW" } }),
  ]);

  const payload = {
    applications,
    counts: {
      submitted: totalSubmitted,
      awaitingReview: totalAwaiting,
    },
  };

  appsCache.set(cacheKey, { data: payload, timestamp: now });

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "public, max-age=8, stale-while-revalidate=15",
    },
  });
}
