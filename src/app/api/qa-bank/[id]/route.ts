import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

export async function DELETE(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.questionAnswerBank.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const entry = await prisma.questionAnswerBank.update({
    where: { id },
    data: {
      ...(body.answer !== undefined && { answer: body.answer }),
      ...(body.category !== undefined && { category: body.category }),
    },
  });
  return NextResponse.json(entry);
}
