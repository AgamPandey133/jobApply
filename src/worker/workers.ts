import path from "path";
import fs from "fs";
import { chromium } from "playwright";
import prisma from "@/lib/db";
import {
  createQueue,
  createWorker,
  QUEUE_NAMES,
  connection,
} from "@/lib/redis";
import {
  notifyJobAwaitingReview,
  notifyApplicationSubmitted,
  notifyNeedsManualAction,
  notifyLowMatch,
} from "@/lib/telegram";
import { pollCompany } from "./poller";
import { filterJob } from "./filter";
import { matchJobToResume } from "./matcher";
import { GreenhouseApplyHandler } from "./apply/greenhouse";
import { LeverApplyHandler } from "./apply/lever";
import { AshbyApplyHandler } from "./apply/ashby";
import { WorkableApplyHandler } from "./apply/workable";
import { SmartRecruitersApplyHandler } from "./apply/smartrecruiters";
import {
  PollJobPayload,
  FilterJobPayload,
  MatchJobPayload,
  ApplyJobPayload,
} from "./adapters/types";
import { ApplyContext } from "./apply/types";
import { AtsType, ApplicationStatus } from "@/generated/client";

// ─── Apply Handler Registry ───────────────────────────────────────────────────
const applyHandlers = {
  [AtsType.GREENHOUSE]: new GreenhouseApplyHandler(),
  [AtsType.LEVER]: new LeverApplyHandler(),
  [AtsType.ASHBY]: new AshbyApplyHandler(),
  [AtsType.WORKABLE]: new WorkableApplyHandler(),
  [AtsType.SMARTRECRUITERS]: new SmartRecruitersApplyHandler(),
};

// ─── Queue Instances ──────────────────────────────────────────────────────────
const pollQueue = createQueue<PollJobPayload>(QUEUE_NAMES.POLLING);
const filterQueue = createQueue<FilterJobPayload>(QUEUE_NAMES.FILTER);
const matchQueue = createQueue<MatchJobPayload>(QUEUE_NAMES.MATCH);
const applyQueue = createQueue<ApplyJobPayload>(QUEUE_NAMES.APPLY);

export { pollQueue, filterQueue, matchQueue, applyQueue };

// ─── 1. POLL Worker ───────────────────────────────────────────────────────────
const pollWorker = createWorker<PollJobPayload>(
  QUEUE_NAMES.POLLING,
  async (job) => {
    console.log(`[Worker:Poll] Processing company ${job.data.companyId}`);
    await pollCompany(job.data.companyId);
  },
  parseInt(process.env.WORKER_POLL_CONCURRENCY ?? "5")
);

// ─── 2. FILTER Worker ────────────────────────────────────────────────────────
const filterWorker = createWorker<FilterJobPayload>(
  QUEUE_NAMES.FILTER,
  async (job) => {
    const { jobId } = job.data;
    console.log(`[Worker:Filter] Filtering job ${jobId}`);

    const result = await filterJob(jobId);

    if (!result.passed) {
      await prisma.job.update({
        where: { id: jobId },
        data: { status: "FILTERED", filterReason: result.reason },
      });
      console.log(`[Worker:Filter] Job ${jobId} filtered: ${result.reason}`);
      return;
    }

    // Passed — enqueue for matching
    await prisma.job.update({ where: { id: jobId }, data: { status: "MATCHING" } });
    await matchQueue.add(`match-${jobId}`, { jobId }, { jobId });
    console.log(`[Worker:Filter] Job ${jobId} passed filters, queued for matching`);
  },
  3
);

// ─── 3. MATCH Worker ─────────────────────────────────────────────────────────
const matchWorker = createWorker<MatchJobPayload>(
  QUEUE_NAMES.MATCH,
  async (job) => {
    const { jobId } = job.data;
    console.log(`[Worker:Match] Matching job ${jobId}`);

    const jobRecord = await prisma.job.findUnique({
      where: { id: jobId },
      include: { company: true },
    });
    if (!jobRecord) return;

    // Check kill switch
    const killSwitch = await prisma.appSetting.findUnique({ where: { key: "global_paused" } });
    if ((killSwitch?.value as boolean) === true) {
      console.log("[Worker:Match] Global kill switch ON, skipping");
      return;
    }

    const matchResult = await matchJobToResume(jobId);

    // Get apply mode
    const applyModeSetting = await prisma.appSetting.findUnique({ where: { key: "default_apply_mode" } });
    const companyMode = jobRecord.company.applyMode;
    const globalMode = (applyModeSetting?.value as string) ?? process.env.DEFAULT_APPLY_MODE ?? "REVIEW";
    const applyMode = companyMode ?? globalMode;

    if (!matchResult.meetsThreshold || !matchResult.bestResumeId) {
      // Create application record as skipped
      const application = await prisma.application.create({
        data: {
          jobId,
          resumeId: matchResult.bestResumeId,
          status: "FAILED",
          mode: applyMode as never,
          matchScore: matchResult.bestScore,
          allScores: matchResult.allScores as never,
          matchReason: matchResult.matchReason,
        },
      });

      await prisma.job.update({
        where: { id: jobId },
        data: { status: "SKIPPED_LOW_MATCH" },
      });

      // Notify about low match
      const minScoreSetting = await prisma.appSetting.findUnique({ where: { key: "min_match_score" } });
      const minScore = (minScoreSetting?.value as number) ?? 70;

      await notifyLowMatch({
        jobTitle: jobRecord.title,
        company: jobRecord.company.name,
        jobUrl: jobRecord.url,
        matchScore: matchResult.bestScore,
        threshold: minScore,
        applicationId: application.id,
      });
      return;
    }

    // Create application record
    const bestResume = await prisma.resume.findUnique({ where: { id: matchResult.bestResumeId } });
    const isManual = applyMode === "MANUAL";
    const isReview = applyMode === "REVIEW";

    const application = await prisma.application.create({
      data: {
        jobId,
        resumeId: matchResult.bestResumeId,
        status: (isReview || isManual) ? "READY_FOR_REVIEW" : "SUBMITTING",
        mode: applyMode as never,
        matchScore: matchResult.bestScore,
        allScores: matchResult.allScores as never,
        matchReason: matchResult.matchReason,
      },
    });

    await prisma.job.update({
      where: { id: jobId },
      data: { status: (isReview || isManual) ? "AWAITING_REVIEW" : "APPLYING" },
    });

    if (isManual) {
      // Manual / Alert-Only: Notify user with job & resume match details without browser automation
      await notifyJobAwaitingReview({
        jobTitle: jobRecord.title,
        company: jobRecord.company.name,
        jobUrl: jobRecord.url,
        matchScore: matchResult.bestScore,
        resumeLabel: bestResume?.label ?? "Resume",
        matchReason: matchResult.matchReason ?? "Manual mode — notification only",
        applicationId: application.id,
      });
      console.log(`[Worker:Match] Job ${jobId} alert sent for manual application`);
    } else if (isReview) {
      // Notify user to review
      await notifyJobAwaitingReview({
        jobTitle: jobRecord.title,
        company: jobRecord.company.name,
        jobUrl: jobRecord.url,
        matchScore: matchResult.bestScore,
        resumeLabel: bestResume?.label ?? "Resume",
        matchReason: matchResult.matchReason ?? "",
        applicationId: application.id,
      });

      // Still run form fill for preview (without submitting)
      await applyQueue.add(
        `apply-${application.id}`,
        {
          jobId,
          applicationId: application.id,
          resumeId: matchResult.bestResumeId,
          mode: "REVIEW",
        },
        { jobId: application.id }
      );
    } else {
      // Full-Auto: queue for immediate apply
      await applyQueue.add(
        `apply-${application.id}`,
        {
          jobId,
          applicationId: application.id,
          resumeId: matchResult.bestResumeId,
          mode: "FULL_AUTO",
        },
        { jobId: application.id }
      );
    }

    console.log(
      `[Worker:Match] Job ${jobId} matched with score ${matchResult.bestScore}%, mode: ${applyMode}`
    );
  },
  2
);

// ─── 4. APPLY Worker ─────────────────────────────────────────────────────────
const applyWorker = createWorker<ApplyJobPayload>(
  QUEUE_NAMES.APPLY,
  async (job) => {
    const { jobId, applicationId, resumeId, mode, isTestRun } = job.data;
    console.log(
      `[Worker:Apply] Applying to job ${jobId}, mode: ${mode}, testRun: ${isTestRun}`
    );

    const jobRecord = await prisma.job.findUnique({
      where: { id: jobId },
      include: { company: true },
    });
    const resume = await prisma.resume.findUnique({ where: { id: resumeId } });
    const profile = await prisma.profile.findFirst();

    if (!jobRecord || !resume || !profile) {
      await prisma.application.update({
        where: { id: applicationId },
        data: {
          status: "FAILED",
          errorMessage: "Missing job, resume, or profile data",
        },
      });
      return;
    }

    // Kill switch
    const killSwitch = await prisma.appSetting.findUnique({ where: { key: "global_paused" } });
    if ((killSwitch?.value as boolean) === true && !isTestRun) {
      console.log("[Worker:Apply] Global kill switch ON, skipping apply");
      return;
    }

    // Get apply handler
    const handler = applyHandlers[jobRecord.atsType as keyof typeof applyHandlers];
    if (!handler) {
      await prisma.application.update({
        where: { id: applicationId },
        data: {
          status: "NEEDS_MANUAL_ACTION",
          errorMessage: `No apply handler for ATS: ${jobRecord.atsType}`,
        },
      });
      await notifyNeedsManualAction({
        jobTitle: jobRecord.title,
        company: jobRecord.company.name,
        jobUrl: jobRecord.url,
        reason: `No automated apply handler for ${jobRecord.atsType}`,
        applicationId,
      });
      return;
    }

    // Build apply context
    const ctx: ApplyContext = {
      jobId,
      applicationId,
      jobUrl: jobRecord.url,
      resumeFilePath: resume.filePath,
      profile: {
        fullName: profile.fullName,
        email: profile.email,
        phone: profile.phone,
        location: profile.location,
        linkedinUrl: profile.linkedinUrl,
        githubUrl: profile.githubUrl,
        portfolioUrl: profile.portfolioUrl,
        education: profile.education as never,
        graduationBatch: profile.graduationBatch,
        workAuthorization: profile.workAuthorization,
        requireSponsorship: profile.requireSponsorship,
        yearsOfExperience: profile.yearsOfExperience,
        bio: profile.bio,
        skills: profile.skills,
        preferredLocations: profile.preferredLocations,
      },
      resumeText: resume.fileText,
      isTestRun: isTestRun ?? false,
      mode,
    };

    // Launch browser
    const headless = process.env.PLAYWRIGHT_HEADLESS !== "false";
    const slowMo = parseInt(process.env.PLAYWRIGHT_SLOW_MO ?? "0");

    const browser = await chromium.launch({ headless, slowMo });
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });
    const page = await context.newPage();

    let result;
    try {
      result = await handler.apply(page, ctx);
    } finally {
      await browser.close();
    }

    // Save result to DB
    let newStatus: ApplicationStatus;
    let newJobStatus;

    if (result.needsManualAction) {
      newStatus = "NEEDS_MANUAL_ACTION";
      newJobStatus = "NEEDS_MANUAL_ACTION";
    } else if (result.submitted) {
      newStatus = "SUBMITTED";
      newJobStatus = "APPLIED";
    } else if (result.success && mode === "REVIEW") {
      newStatus = "READY_FOR_REVIEW";
      newJobStatus = "AWAITING_REVIEW";
    } else if (!result.success) {
      newStatus = "FAILED";
      newJobStatus = "FAILED";
    } else {
      newStatus = "READY_FOR_REVIEW";
      newJobStatus = "AWAITING_REVIEW";
    }

    await prisma.application.update({
      where: { id: applicationId },
      data: {
        status: newStatus as never,
        screenshotPath: result.screenshotPath,
        confirmationText: result.confirmationText,
        errorMessage: result.errorMessage,
        formAnswers: result.formAnswers as never,
        submittedAt: result.submitted ? new Date() : undefined,
      },
    });

    await prisma.job.update({
      where: { id: jobId },
      data: { status: newJobStatus as never },
    });

    // Notifications
    const matchScore = (
      await prisma.application.findUnique({ where: { id: applicationId } })
    )?.matchScore ?? 0;

    if (result.needsManualAction) {
      await notifyNeedsManualAction({
        jobTitle: jobRecord.title,
        company: jobRecord.company.name,
        jobUrl: jobRecord.url,
        reason: result.manualActionReason ?? "CAPTCHA or bot protection detected",
        applicationId,
      });
    } else if (result.submitted) {
      await notifyApplicationSubmitted({
        jobTitle: jobRecord.title,
        company: jobRecord.company.name,
        jobUrl: jobRecord.url,
        matchScore,
        resumeLabel: resume.label,
        applicationId,
        screenshotPath: result.screenshotPath,
      });
    }

    console.log(
      `[Worker:Apply] Job ${jobId} apply result: submitted=${result.submitted}, status=${newStatus}`
    );
  },
  parseInt(process.env.WORKER_APPLY_CONCURRENCY ?? "2")
);

// ─── Worker Event Handlers ────────────────────────────────────────────────────
for (const [name, worker] of [
  ["poll", pollWorker],
  ["filter", filterWorker],
  ["match", matchWorker],
  ["apply", applyWorker],
] as const) {
  worker.on("completed", (job) => {
    console.log(`[Worker:${name}] Job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[Worker:${name}] Job ${job?.id} failed:`, err.message);
  });
}

export { pollWorker, filterWorker, matchWorker, applyWorker };
