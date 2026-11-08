import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

// Test run: trigger full pipeline up to submit step
export async function POST(req: NextRequest) {
  const { companyId } = await req.json();

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  // Get the latest job for this company
  const latestJob = await prisma.job.findFirst({
    where: { companyId },
    orderBy: { firstSeenAt: "desc" },
  });

  if (!latestJob) {
    return NextResponse.json({
      error: "No jobs found for this company. Poll the company first."
    }, { status: 404 });
  }

  // Get default resume
  const resume = await prisma.resume.findFirst({
    where: { isDefault: true },
  }) ?? await prisma.resume.findFirst();

  if (!resume) {
    return NextResponse.json({
      error: "No resume uploaded. Please upload a resume first."
    }, { status: 404 });
  }

  // Queue a test apply
  const { applyQueue } = await import("@/worker/workers");

  // Create or get test application
  let application = await prisma.application.findFirst({
    where: { jobId: latestJob.id },
  });

  if (!application) {
    application = await prisma.application.create({
      data: {
        jobId: latestJob.id,
        resumeId: resume.id,
        status: "READY_FOR_REVIEW",
        mode: "REVIEW",
        matchScore: 0,
      },
    });
  }

  await applyQueue.add(
    `test-run-${companyId}-${Date.now()}`,
    {
      jobId: latestJob.id,
      applicationId: application.id,
      resumeId: resume.id,
      mode: "REVIEW",
      isTestRun: true,
    }
  );

  return NextResponse.json({
    ok: true,
    message: "Test run started. Check the application record for the screenshot.",
    applicationId: application.id,
    jobTitle: latestJob.title,
    jobUrl: latestJob.url,
  });
}
