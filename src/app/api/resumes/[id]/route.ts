import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import prisma from "@/lib/db";

const STORAGE_PATH = process.env.STORAGE_PATH ?? "./uploads";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();

  if (body.isDefault) {
    await prisma.resume.updateMany({ data: { isDefault: false } });
  }

  const resume = await prisma.resume.update({
    where: { id },
    data: {
      ...(body.isDefault !== undefined && { isDefault: body.isDefault }),
      ...(body.name !== undefined && { name: body.name }),
      ...(body.label !== undefined && { label: body.label }),
      ...(body.targetRoles !== undefined && { targetRoles: body.targetRoles }),
    },
  });

  return NextResponse.json(resume);
}

export async function DELETE(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const resume = await prisma.resume.findUnique({ where: { id } });
  if (!resume) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Delete file from disk
  try {
    const absPath = path.join(STORAGE_PATH, resume.filePath);
    if (fs.existsSync(absPath)) fs.unlinkSync(absPath);
  } catch { /* ignore */ }

  await prisma.resume.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
