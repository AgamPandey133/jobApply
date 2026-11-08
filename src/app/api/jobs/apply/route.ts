import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const { jobId, action, resumeId } = await req.json();
    if (!jobId) {
      return NextResponse.json({ error: "jobId is required" }, { status: 400 });
    }

    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: { applications: true, company: true },
    });

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Determine resume to use: selected resume, or existing application resume, or default resume
    let targetResumeId = resumeId || job.applications[0]?.resumeId;
    if (!targetResumeId) {
      const defaultResume =
        (await prisma.resume.findFirst({ where: { isDefault: true } })) ||
        (await prisma.resume.findFirst());
      targetResumeId = defaultResume?.id;
    }

    if (action === "mark_applied") {
      const now = new Date();
      // Upsert application
      const application = await prisma.application.upsert({
        where: { jobId },
        create: {
          jobId,
          resumeId: targetResumeId,
          status: "SUBMITTED",
          submittedAt: now,
          mode: "MANUAL",
          confirmationText: "Applied successfully (Marked by user)",
        },
        update: {
          status: "SUBMITTED",
          submittedAt: now,
          resumeId: targetResumeId ?? undefined,
          confirmationText: "Applied successfully (Marked by user)",
        },
        include: {
          job: { include: { company: true } },
          resume: true,
        },
      });

      await prisma.job.update({
        where: { id: jobId },
        data: { status: "APPLIED" },
      });

      return NextResponse.json({ ok: true, application });
    }

    if (action === "auto_apply") {
      const application = await prisma.application.upsert({
        where: { jobId },
        create: {
          jobId,
          resumeId: targetResumeId,
          status: "SUBMITTING",
          mode: "FULL_AUTO",
        },
        update: {
          status: "SUBMITTING",
          mode: "FULL_AUTO",
          resumeId: targetResumeId ?? undefined,
        },
        include: {
          job: { include: { company: true } },
          resume: true,
        },
      });

      if (targetResumeId) {
        const { applyQueue } = await import("@/worker/workers");
        await applyQueue.add(`apply-${jobId}`, {
          jobId,
          applicationId: application.id,
          resumeId: targetResumeId,
          mode: "FULL_AUTO",
        });
      }

      return NextResponse.json({ ok: true, application });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err) {
    console.error("Error applying to job:", err);
    return NextResponse.json({ error: "Failed to process application" }, { status: 500 });
  }
}
