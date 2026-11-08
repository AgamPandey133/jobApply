import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

// GET all settings
export async function GET() {
  const settings = await prisma.appSetting.findMany();
  const result: Record<string, unknown> = {};
  for (const s of settings) result[s.key] = s.value;
  return NextResponse.json(result);
}

// PATCH: update one or more settings
export async function PATCH(req: NextRequest) {
  const body = await req.json();

  const updates = await Promise.all(
    Object.entries(body).map(([key, value]) =>
      prisma.appSetting.upsert({
        where: { key },
        update: { value: value as never },
        create: { key, value: value as never },
      })
    )
  );

  return NextResponse.json({ ok: true, updated: updates.length });
}
