import prisma from "@/lib/db";

// ─── Filter Result ────────────────────────────────────────────────────────────
interface FilterResult {
  passed: boolean;
  reason?: string;
}

// ─── Run filter pipeline for a job ───────────────────────────────────────────
export async function filterJob(jobId: string): Promise<FilterResult> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: { company: true },
  });

  if (!job) return { passed: false, reason: "Job not found" };

  // Load active filter config (first active filter)
  const filterConfig = await prisma.jobFilter.findFirst({
    where: { isActive: true },
  });

  if (!filterConfig) {
    // No filter configured — pass everything
    return { passed: true };
  }

  const title = job.title.toLowerCase();
  const description = job.description.toLowerCase();

  // ── Include title keywords (at least one must match if configured) ──────────
  if (filterConfig.includeTitleKeywords.length > 0) {
    const hasInclude = filterConfig.includeTitleKeywords.some((kw) =>
      title.includes(kw.toLowerCase())
    );
    if (!hasInclude) {
      return {
        passed: false,
        reason: `Title "${job.title}" doesn't match include keywords: ${filterConfig.includeTitleKeywords.join(", ")}`,
      };
    }
  }

  // ── Exclude title keywords (none must match) ───────────────────────────────
  for (const kw of filterConfig.excludeTitleKeywords) {
    if (title.includes(kw.toLowerCase())) {
      return {
        passed: false,
        reason: `Title "${job.title}" matches exclude keyword: "${kw}"`,
      };
    }
  }

  // ── Location filter ────────────────────────────────────────────────────────
  if (filterConfig.allowedLocations.length > 0 && !job.isRemote) {
    const locationLower = job.location.toLowerCase();
    const hasLocation = filterConfig.allowedLocations.some((loc) =>
      locationLower.includes(loc.toLowerCase())
    );
    if (!hasLocation) {
      return {
        passed: false,
        reason: `Location "${job.location}" not in allowed locations: ${filterConfig.allowedLocations.join(", ")}`,
      };
    }
  }

  // ── Remote/Onsite preference ───────────────────────────────────────────────
  if (job.isRemote && !filterConfig.allowRemote) {
    return { passed: false, reason: "Remote jobs excluded by filter" };
  }
  if (!job.isRemote && !filterConfig.allowOnsite) {
    return { passed: false, reason: "Onsite jobs excluded by filter" };
  }

  // ── Experience level filter ────────────────────────────────────────────────
  if (filterConfig.experienceLevels.length > 0) {
    const descAndTitle = title + " " + description;

    const levelPatterns: Record<string, RegExp> = {
      intern: /intern|internship|co-op|coop|trainee/i,
      new_grad: /fresher|fresh graduate|new grad|new graduate|entry[- ]level|0[- ]1 year|campus|graduate engineer/i,
      freshers: /fresher|fresh graduate|new grad|new graduate|entry[- ]level|0[- ]1 year|campus|graduate engineer/i,
      "1-2_years": /\b[12][-– ]year|\b0[-– ]2 year|\b1[-– ]3 year|\b1\+ year|\b2\+ year/i,
      "1_2_years": /\b[12][-– ]year|\b0[-– ]2 year|\b1[-– ]3 year|\b1\+ year|\b2\+ year/i,
      junior: /junior|jr\.|associate/i,
      mid: /mid[- ]level|\b2[-–]4 years|\b3[-–]5 years/i,
      senior: /senior|sr\.|staff|principal|lead|director|manager/i,
    };

    const matchesLevel = filterConfig.experienceLevels.some((level) => {
      const pattern = levelPatterns[level];
      return pattern ? pattern.test(descAndTitle) : true;
    });

    // Also allow if no clear level mentioned in JD (give benefit of doubt)
    const hasAnyLevel = Object.values(levelPatterns).some((p) =>
      p.test(descAndTitle)
    );

    if (hasAnyLevel && !matchesLevel) {
      return {
        passed: false,
        reason: `Experience level in job doesn't match filter: ${filterConfig.experienceLevels.join(", ")}`,
      };
    }
  }

  // ── Graduation batch filter ────────────────────────────────────────────────
  if (filterConfig.graduationBatch) {
    const batch = filterConfig.graduationBatch;
    // Only filter if the job description explicitly mentions a batch
    const hasBatchInJd = /class of \d{4}|graduation.*\d{4}|\d{4}.*graduation/i.test(
      description
    );
    if (hasBatchInJd && !description.includes(batch)) {
      return {
        passed: false,
        reason: `Job requires different graduation batch than: ${batch}`,
      };
    }
  }

  return { passed: true };
}
