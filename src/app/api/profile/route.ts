import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

// GET profile
export async function GET() {
  const profile = await prisma.profile.findFirst();
  if (!profile) return NextResponse.json(null);
  return NextResponse.json(profile);
}

// POST / UPSERT profile
export async function POST(req: NextRequest) {
  const body = await req.json();

  const existing = await prisma.profile.findFirst();
  let profile;

  if (existing) {
    profile = await prisma.profile.update({ where: { id: existing.id }, data: body });
  } else {
    profile = await prisma.profile.create({ data: body });
  }

  return NextResponse.json(profile);
}
