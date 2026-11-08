import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { clearApplicationsCache } from "../route";

export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const app = await prisma.application.findUnique({
    where: { id },
    include: {
      job: { include: { company: true } },
      resume: true,
    },
  });
  if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(app);
}

// Approve & Submit action
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { action } = await req.json();

  if (action === "approve") {
    // Re-queue the application with FULL_AUTO mode
    const app = await prisma.application.findUnique({
      where: { id },
      include: { job: true },
    });
    if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { applyQueue } = await import("@/worker/workers");
    await applyQueue.add(
      `approve-${id}`,
      {
        jobId: app.jobId,
        applicationId: id,
        resumeId: app.resumeId!,
        mode: "FULL_AUTO",
      }
    );

    await prisma.application.update({
      where: { id },
      data: { status: "SUBMITTING" },
    });

    clearApplicationsCache();
    return NextResponse.json({ ok: true, message: "Application queued for submission" });
  }

  if (action === "retry") {
    const app = await prisma.application.findUnique({
      where: { id },
      include: { job: true },
    });
    if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { applyQueue } = await import("@/worker/workers");
    await applyQueue.add(
      `retry-${id}-${Date.now()}`,
      {
        jobId: app.jobId,
        applicationId: id,
        resumeId: app.resumeId!,
        mode: app.mode as "REVIEW" | "FULL_AUTO",
      }
    );

    await prisma.application.update({
      where: { id },
      data: { status: "SUBMITTING", retryCount: { increment: 1 } },
    });

    clearApplicationsCache();
    return NextResponse.json({ ok: true, message: "Application retry queued" });
  }

  if (action === "mark_submitted") {
    const app = await prisma.application.findUnique({
      where: { id },
      include: { job: true },
    });
    if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const now = new Date();
    const updated = await prisma.application.update({
      where: { id },
      data: {
        status: "SUBMITTED",
        submittedAt: now,
        confirmationText: "Applied successfully (Manual / Auto verified)",
      },
      include: {
        job: { include: { company: true } },
        resume: true,
      },
    });

    await prisma.job.update({
      where: { id: app.jobId },
      data: { status: "APPLIED" },
    });

    clearApplicationsCache();
    return NextResponse.json({ ok: true, message: "Application marked as submitted", application: updated });
  }

  if (action === "unmark_submitted") {
    const app = await prisma.application.findUnique({
      where: { id },
      include: { job: true },
    });
    if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const updated = await prisma.application.update({
      where: { id },
      data: {
        status: "READY_FOR_REVIEW",
        submittedAt: null,
      },
      include: {
        job: { include: { company: true } },
        resume: true,
      },
    });

    await prisma.job.update({
      where: { id: app.jobId },
      data: { status: "AWAITING_REVIEW" },
    });

    clearApplicationsCache();
    return NextResponse.json({ ok: true, message: "Application reverted to review queue", application: updated });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

// PATCH: Update application fields (e.g. switch resume)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const { resumeId } = body;

  if (!resumeId) {
    return NextResponse.json({ error: "resumeId is required" }, { status: 400 });
  }

  const resume = await prisma.resume.findUnique({ where: { id: resumeId } });
  if (!resume) {
    return NextResponse.json({ error: "Resume not found" }, { status: 404 });
  }

  const updated = await prisma.application.update({
    where: { id },
    data: { resumeId },
    include: {
      job: { include: { company: true } },
      resume: true,
    },
  });

  clearApplicationsCache();
  return NextResponse.json(updated);
}

