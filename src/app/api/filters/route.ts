import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

export async function GET() {
  const filter = await prisma.jobFilter.findFirst({ where: { isActive: true } });
  return NextResponse.json(filter ?? null);
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  // Deactivate all existing filters
  await prisma.jobFilter.updateMany({ data: { isActive: false } });

  // Create new active filter
  const filter = await prisma.jobFilter.create({
    data: {
      name: "Default Filter",
      isActive: true,
      includeTitleKeywords: body.includeTitleKeywords ?? [],
      excludeTitleKeywords: body.excludeTitleKeywords ?? [],
      allowedLocations: body.allowedLocations ?? [],
      allowRemote: body.allowRemote ?? true,
      allowOnsite: body.allowOnsite ?? true,
      allowHybrid: body.allowHybrid ?? true,
      experienceLevels: body.experienceLevels ?? [],
      graduationBatch: body.graduationBatch ?? null,
    },
  });

  return NextResponse.json(filter, { status: 201 });
}
