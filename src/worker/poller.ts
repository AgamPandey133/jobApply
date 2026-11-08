import prisma from "@/lib/db";
import { createQueue } from "@/lib/redis";
import { getAdapter } from "./adapters/factory";
import { PollJobPayload, FilterJobPayload } from "./adapters/types";
import { Job as PrismaJob, AtsType } from "@/generated/client";
import { notifyNewJobDiscovered } from "@/lib/telegram";

const filterQueue = createQueue<FilterJobPayload>("filter");

// ─── Poll a single company ────────────────────────────────────────────────────
export async function pollCompany(companyId: string): Promise<void> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
  });

  if (!company || !company.isActive || company.isPaused) {
    console.log(`[Poller] Skipping company ${companyId}: inactive or paused`);
    return;
  }

  // Global kill switch check
  const killSwitch = await prisma.appSetting.findUnique({
    where: { key: "global_paused" },
  });
  if ((killSwitch?.value as boolean) === true) {
    console.log("[Poller] Global kill switch is ON, skipping all polling");
    return;
  }

  const adapter = getAdapter(company.atsType);
  if (!adapter) {
    await logActivity("WARN", "POLLER", companyId, null,
      `No adapter found for ATS type: ${company.atsType}`
    );
    return;
  }

  console.log(`[Poller] Polling ${company.name} (${company.atsType})...`);

  let fetchedJobs: Awaited<ReturnType<typeof adapter.fetchJobs>> = [];

  try {
    fetchedJobs = await adapter.fetchJobs({
      id: company.id,
      slug: company.slug,
      careersUrl: company.careersUrl,
    });
  } catch (err) {
    await logActivity("ERROR", "POLLER", companyId, null,
      `Failed to fetch jobs for ${company.name}: ${String(err)}`
    );
    return;
  }

  // Update last polled timestamp
  await prisma.company.update({
    where: { id: companyId },
    data: { lastPolledAt: new Date() },
  });

  let newJobCount = 0;

  for (const job of fetchedJobs) {
    try {
      // Upsert: create if new, skip if exists
      const result = await prisma.job.upsert({
        where: {
          companyId_externalId: {
            companyId: company.id,
            externalId: job.externalId,
          },
        },
        update: {}, // Don't update existing jobs (preserve status)
        create: {
          externalId: job.externalId,
          companyId: company.id,
          title: job.title,
          location: job.location,
          isRemote: job.isRemote,
          department: job.department,
          description: job.description,
          url: job.url,
          postedAt: job.postedAt,
          atsType: company.atsType,
          status: "NEW",
        },
      });

      // Check if this is a newly created record
      const isNew =
        result.createdAt.getTime() === result.updatedAt.getTime() ||
        Math.abs(result.createdAt.getTime() - Date.now()) < 5000;

      if (isNew) {
        newJobCount++;
        // Enqueue for filtering
        await filterQueue.add(
          `filter-${result.id}`,
          { jobId: result.id },
          { jobId: result.id }
        );

        console.log(
          `[Poller] New job detected: "${job.title}" @ ${company.name}`
        );

        // Instant notification check
        const alertSetting = await prisma.appSetting.findUnique({
          where: { key: "alert_on_all_new_jobs" },
        });
        const shouldAlert = (alertSetting?.value as boolean) ?? true;

        if (shouldAlert) {
          notifyNewJobDiscovered({
            jobTitle: job.title,
            company: company.name,
            location: job.location,
            isRemote: job.isRemote,
            jobUrl: job.url,
            applyMode: company.applyMode,
            atsType: company.atsType,
          }).catch(console.error);
        }
      }
    } catch (err) {
      // Unique constraint violation means job already exists - that's fine
      if (!String(err).includes("Unique constraint")) {
        await logActivity("ERROR", "POLLER", companyId, null,
          `Failed to upsert job ${job.externalId}: ${String(err)}`
        );
      }
    }
  }

  // Update job count
  await prisma.company.update({
    where: { id: companyId },
    data: { jobsCount: fetchedJobs.length },
  });

  if (newJobCount > 0) {
    await logActivity("INFO", "POLLER", companyId, null,
      `Polled ${company.name}: ${fetchedJobs.length} total jobs, ${newJobCount} new`
    );
  }
}

// ─── Activity Logging ─────────────────────────────────────────────────────────
async function logActivity(
  level: string,
  component: string,
  companyId: string | null,
  jobId: string | null,
  message: string,
  metadata?: Record<string, unknown>
) {
  try {
    await prisma.activityLog.create({
      data: { level, component, companyId, jobId, message, metadata: metadata as any },
    });
  } catch {
    console.error("[Logger] Failed to write activity log");
  }
}
