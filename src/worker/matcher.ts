import prisma from "@/lib/db";
import { embedText, cosineSimilarity, judgeResumeMatch } from "@/lib/gemini";

// ─── Score Weights (from settings or defaults) ────────────────────────────────
async function getWeights() {
  const embeddingSetting = await prisma.appSetting.findUnique({
    where: { key: "embedding_weight" },
  });
  const llmSetting = await prisma.appSetting.findUnique({
    where: { key: "llm_judge_weight" },
  });
  const thresholdSetting = await prisma.appSetting.findUnique({
    where: { key: "min_match_score" },
  });

  return {
    embeddingWeight: (embeddingSetting?.value as number) ?? parseFloat(process.env.EMBEDDING_WEIGHT ?? "0.4"),
    llmWeight: (llmSetting?.value as number) ?? parseFloat(process.env.LLM_JUDGE_WEIGHT ?? "0.6"),
    minScore: (thresholdSetting?.value as number) ?? parseFloat(process.env.MIN_MATCH_SCORE_THRESHOLD ?? "70"),
  };
}

// ─── Score Result ─────────────────────────────────────────────────────────────
// ─── Score Result ─────────────────────────────────────────────────────────────
interface ResumeScore {
  resumeId: string;
  name: string;
  label: string;
  embeddingScore: number;
  llmScore: number;
  domainScore: number;
  finalScore: number;
  reason: string;
}

// ─── Domain & Role Affinity Score ─────────────────────────────────────────────
function computeDomainAffinity(
  jobTitle: string,
  targetRoles: string[],
  label: string,
  name: string
): number {
  const title = jobTitle.toLowerCase();
  const targets = [...targetRoles, label, name].map((t) => t.toLowerCase());

  // Domain checks
  const isAndroidJob = /android|kotlin|\bmobile\b/i.test(title);
  const isMLJob = /\bai\b|machine learning|deep learning|data scientist|\bml\b|llm|nlp|computer vision/i.test(title);
  const isFullstackJob = /full[- ]?stack|fullstack/i.test(title);
  const isBackendJob = /backend|back[- ]end|distributed systems|\bgo\b|\bjava\b|\bnode\b/i.test(title);
  const isFrontendJob = /frontend|front[- ]end|\breact\b|\bweb\b/i.test(title);

  const isAndroidResume = targets.some((t) => /android|\bmobile\b|kotlin/i.test(t));
  const isMLResume = targets.some((t) => /\bai\b|machine learning|\bml\b|data science/i.test(t));
  const isFullstackResume = targets.some((t) => /fullstack|full[- ]?stack|\bweb\b|\bsde\b/i.test(t));
  const isBackendResume = targets.some((t) => /backend|back[- ]end/i.test(t));

  // Direct domain alignment bonuses
  if (isAndroidJob && isAndroidResume) return 100;
  if (isMLJob && isMLResume) return 100;
  if (isFullstackJob && isFullstackResume) return 95;
  if (isBackendJob && (isBackendResume || isFullstackResume)) return 95;

  // Direct keyword containment in target roles
  for (const target of targets) {
    if (target.length > 2 && title.includes(target)) return 90;
    const words = target.split(/\s+/).filter((w) => w.length > 3);
    if (words.some((w) => title.includes(w))) return 80;
  }

  // Cross-track mismatch penalty (e.g. Android job evaluated against non-Android resume)
  if (isAndroidJob && !isAndroidResume) return 35;
  if (isMLJob && !isMLResume) return 35;

  return 60; // General software engineering
}

// ─── Match job to best resume ─────────────────────────────────────────────────
export async function matchJobToResume(jobId: string): Promise<{
  bestResumeId: string | null;
  bestScore: number;
  allScores: ResumeScore[];
  matchReason: string;
  meetsThreshold: boolean;
}> {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) throw new Error(`Job ${jobId} not found`);

  // Retrieve all resumes with their vector embeddings from PostgreSQL
  const resumes = await prisma.$queryRaw<
    Array<{
      id: string;
      name: string;
      label: string;
      targetRoles: string[];
      structuredSummary: any;
      isDefault: boolean;
      embedding_text: string | null;
    }>
  >`
    SELECT id, name, label, "targetRoles", "structuredSummary", "isDefault", embedding::text as embedding_text
    FROM "Resume"
  `;

  if (!resumes || resumes.length === 0) {
    return {
      bestResumeId: null,
      bestScore: 0,
      allScores: [],
      matchReason: "No resumes uploaded",
      meetsThreshold: false,
    };
  }

  const { embeddingWeight, llmWeight, minScore } = await getWeights();

  // Generate job embedding
  const jobText = `${job.title}\n\n${job.description}`;
  let jobEmbedding: number[] = [];
  try {
    jobEmbedding = await embedText(jobText.slice(0, 10000));
  } catch (err) {
    console.warn("[Matcher] Job embedding failed, continuing with LLM judge:", err);
  }

  const scores: ResumeScore[] = [];

  for (const resume of resumes) {
    // 1. Embedding score
    let embeddingScore = 50; // Default midpoint
    if (jobEmbedding.length > 0 && resume.embedding_text) {
      try {
        const resumeVector = JSON.parse(resume.embedding_text) as number[];
        if (Array.isArray(resumeVector) && resumeVector.length > 0) {
          const sim = cosineSimilarity(jobEmbedding, resumeVector);
          embeddingScore = Math.round((sim + 1) * 50); // Normalize from [-1,1] to [0,100]
        }
      } catch {
        // Fallback
      }
    }

    // 2. Domain & Role Affinity Score
    const domainScore = computeDomainAffinity(
      job.title,
      resume.targetRoles ?? [],
      resume.label ?? "",
      resume.name ?? ""
    );

    // 3. LLM judge score
    const summary = (resume.structuredSummary ?? {}) as {
      skills: string[];
      projects: { name: string; description: string }[];
      strengths: string[];
      experience?: string[];
    };

    let judgeResult = {
      score: domainScore >= 80 ? 85 : domainScore >= 50 ? 65 : 45,
      reason: `Matched via domain specialization (${resume.label}) & vector profile affinity`,
    };

    try {
      judgeResult = await judgeResumeMatch(
        job.title,
        job.description,
        resume.label,
        summary,
        resume.targetRoles ?? [],
        resume.name ?? ""
      );
    } catch (err) {
      console.warn(`[Matcher] LLM judge rate-limited for "${job.title}", using domain & vector score:`, (err as any)?.message?.slice(0, 80));
    }

    // 4. Weighted composite
    // 35% LLM Judge + 35% Vector Embedding + 30% Role/Domain Alignment
    const finalScore = Math.round(
      embeddingScore * (embeddingWeight * 0.8) +
      judgeResult.score * (llmWeight * 0.8) +
      domainScore * 0.3
    );

    scores.push({
      resumeId: resume.id,
      name: resume.name,
      label: resume.label,
      embeddingScore,
      llmScore: judgeResult.score,
      domainScore,
      finalScore: Math.min(100, Math.max(0, finalScore)),
      reason: judgeResult.reason,
    });
  }

  // Sort by final score descending
  scores.sort((a, b) => b.finalScore - a.finalScore);

  console.log(`[Matcher] Job "${job.title}" evaluated across ${resumes.length} resumes:`);
  for (const s of scores) {
    console.log(`   - "${s.name}" (${s.label}): ${s.finalScore}% [Embedding: ${s.embeddingScore}%, LLM: ${s.llmScore}%, Domain: ${s.domainScore}%]`);
  }

  const best = scores[0];
  console.log(`   🏆 Selected Best Resume: "${best.name}" (${best.label}) with ${best.finalScore}% match`);

  const meetsThreshold = best.finalScore >= minScore;

  return {
    bestResumeId: best.resumeId,
    bestScore: best.finalScore,
    allScores: scores,
    matchReason: best.reason,
    meetsThreshold,
  };
}
