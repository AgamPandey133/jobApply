import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

// PATCH: update company (toggle active, pause, change mode, etc.)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();

  const company = await prisma.company.update({
    where: { id },
    data: {
      ...(body.isActive !== undefined && { isActive: body.isActive }),
      ...(body.isPaused !== undefined && { isPaused: body.isPaused }),
      ...(body.applyMode !== undefined && { applyMode: body.applyMode }),
      ...(body.pollingIntervalMinutes !== undefined && {
        pollingIntervalMinutes: body.pollingIntervalMinutes,
      }),
    },
  });
  return NextResponse.json(company);
}

// DELETE: remove company
export async function DELETE(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.company.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
