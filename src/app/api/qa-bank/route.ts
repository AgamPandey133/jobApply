import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

// GET Q&A bank entries
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");

  const entries = await prisma.questionAnswerBank.findMany({
    where: category ? { category } : {},
    orderBy: { usageCount: "desc" },
  });
  return NextResponse.json(entries);
}

// POST: Add new Q&A entry
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { originalQuestion, answer, category } = body;

  if (!originalQuestion || !answer) {
    return NextResponse.json(
      { error: "originalQuestion and answer are required" },
      { status: 400 }
    );
  }

  const questionPattern = originalQuestion
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);

  const entry = await prisma.questionAnswerBank.create({
    data: {
      questionPattern,
      originalQuestion,
      answer,
      category: category ?? "general",
      source: "MANUAL",
    },
  });

  return NextResponse.json(entry, { status: 201 });
}
