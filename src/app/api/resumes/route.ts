import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import prisma from "@/lib/db";
import { embedText } from "@/lib/gemini";
import { extractResumeSummary } from "@/lib/gemini";

const STORAGE_PATH = process.env.STORAGE_PATH ?? "./uploads";

// GET all resumes
export async function GET() {
  const resumes = await prisma.resume.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      label: true,
      targetRoles: true,
      filePath: true,
      structuredSummary: true,
      isDefault: true,
      createdAt: true,
    },
  });
  return NextResponse.json(resumes);
}

// POST: Upload a new resume
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const name = formData.get("name") as string;
    const label = formData.get("label") as string;
    const targetRoles = JSON.parse(
      (formData.get("targetRoles") as string) ?? "[]"
    ) as string[];
    const isDefault = formData.get("isDefault") === "true";

    if (!file || !name || !label) {
      return NextResponse.json(
        { error: "file, name, and label are required" },
        { status: 400 }
      );
    }

    if (file.type !== "application/pdf") {
      return NextResponse.json(
        { error: "Only PDF files are supported" },
        { status: 400 }
      );
    }

    // Save file to disk
    const resumeDir = path.join(STORAGE_PATH, "resumes");
    fs.mkdirSync(resumeDir, { recursive: true });

    const fileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
    const filePath = path.join("resumes", fileName);
    const absolutePath = path.join(STORAGE_PATH, filePath);

    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(absolutePath, buffer);

    // Extract text from PDF
    let fileText = "";
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pdfModule: any = await import("pdf-parse");
      const PDFParser = pdfModule.PDFParse || pdfModule.default?.PDFParse || pdfModule.default || pdfModule;
      if (typeof PDFParser === "function") {
        try {
          const parser = new PDFParser({ data: buffer });
          const data = await parser.getText();
          fileText = data.text || "";
          if (parser.destroy) await parser.destroy().catch(() => {});
        } catch {
          const data = await PDFParser(buffer);
          fileText = data.text || "";
        }
      }
    } catch (err) {
      console.warn("PDF text extraction failed:", err);
    }

    if (!fileText.trim()) {
      fileText = `${name} - Resume for ${targetRoles.join(", ")}`;
    }

    // Generate structured summary with Gemini
    let structuredSummary: any;
    try {
      structuredSummary = await extractResumeSummary(fileText);
    } catch (err) {
      console.warn("Failed to generate summary with Gemini, using fallback:", err);
      structuredSummary = {
        skills: targetRoles,
        projects: [{ name: "Professional Experience", description: fileText.slice(0, 300) }],
        strengths: ["Software Engineering", "Problem Solving"],
        experience: targetRoles,
      };
    }

    // Generate embedding
    let embeddingVector: number[] = [];
    try {
      embeddingVector = await embedText(
        `${name}\n${label}\n${fileText}`.slice(0, 10000)
      );
    } catch (err) {
      console.warn("Failed to generate embedding with Gemini:", err);
    }

    // If isDefault, unset others
    if (isDefault) {
      await prisma.resume.updateMany({ data: { isDefault: false } });
    }

    // Save to DB
    const resume = await prisma.resume.create({
      data: {
        name,
        label,
        targetRoles,
        filePath,
        fileText,
        structuredSummary: structuredSummary as any,
        isDefault,
      },
    });

    // Save pgvector embedding
    if (embeddingVector && embeddingVector.length > 0) {
      try {
        const vectorStr = `[${embeddingVector.join(",")}]`;
        await prisma.$executeRawUnsafe(
          `UPDATE "Resume" SET embedding = $1::vector WHERE id = $2`,
          vectorStr,
          resume.id
        );
      } catch (e) {
        console.warn("Could not save vector embedding:", e);
      }
    }

    return NextResponse.json(
      {
        id: resume.id,
        name: resume.name,
        label: resume.label,
        structuredSummary,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("Resume upload error:", err);
    return NextResponse.json(
      { error: "Failed to process resume" },
      { status: 500 }
    );
  }
}
