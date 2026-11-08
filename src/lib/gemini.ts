import { GoogleGenerativeAI, TaskType } from "@google/generative-ai";

const apiKey = process.env.GEMINI_API_KEY ?? "";
const genAI = new GoogleGenerativeAI(apiKey);

const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-3.8-flash";
const GEMINI_EMBEDDING_MODEL =
  process.env.GEMINI_EMBEDDING_MODEL ?? "gemini-embedding-001";

// ─── Text Embedding ────────────────────────────────────────────────────────────
export async function embedText(text: string): Promise<number[]> {
  try {
    const model = genAI.getGenerativeModel({ model: GEMINI_EMBEDDING_MODEL });
    const result = await model.embedContent({
      content: { role: "user", parts: [{ text }] },
      outputDimensionality: 768,
    } as any);
    return result.embedding.values;
  } catch (err) {
    console.warn("[Gemini] Embedding generation failed, using zero-vector fallback:", err);
    return new Array(768).fill(0);
  }
}

// ─── Cosine Similarity ─────────────────────────────────────────────────────────
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0,
    normA = 0,
    normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ─── LLM Judge ────────────────────────────────────────────────────────────────
export interface LLMJudgeResult {
  score: number; // 0-100
  reason: string; // 1 sentence
}

export async function judgeResumeMatch(
  jobTitle: string,
  jobDescription: string,
  resumeLabel: string,
  resumeSummary: {
    skills: string[];
    projects: { name: string; description: string }[];
    strengths: string[];
    experience?: string[];
  },
  targetRoles: string[] = [],
  resumeName: string = ""
): Promise<LLMJudgeResult> {
  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.1,
    },
  });

  const prompt = `You are a professional technical recruiter evaluating which candidate resume best fits this job.

JOB TITLE: ${jobTitle}

JOB DESCRIPTION (excerpt):
${jobDescription.slice(0, 3000)}

RESUME NAME & LABEL: ${resumeName ? `${resumeName} (${resumeLabel})` : resumeLabel}
RESUME TARGET ROLES: ${targetRoles.length > 0 ? targetRoles.join(", ") : "General Engineering"}
CANDIDATE SKILLS: ${resumeSummary.skills.join(", ")}
CANDIDATE PROJECTS: ${resumeSummary.projects
    .map((p) => `${p.name}: ${p.description}`)
    .join("\n")}
CANDIDATE STRENGTHS: ${resumeSummary.strengths.join(", ")}
${resumeSummary.experience ? `EXPERIENCE HIGHLIGHTS: ${resumeSummary.experience.join(", ")}` : ""}

Evaluate how well this specific resume matches the job. Consider:
1. Role Specialization Alignment: Does this resume's target role (e.g., Android / Mobile vs AI/ML vs Fullstack / Backend) directly match the job role? A dedicated resume for the role should score much higher than an unrelated or general resume.
2. Technical skill alignment with job requirements
3. Project relevance to the domain
4. Experience level appropriateness

Respond with JSON: { "score": <0-100 integer>, "reason": "<one concise sentence explaining the score and why this resume matches or does not match this role>" }`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();

  try {
    const parsed = JSON.parse(text);
    return {
      score: Math.min(100, Math.max(0, Number(parsed.score) || 0)),
      reason: String(parsed.reason || ""),
    };
  } catch {
    return { score: 0, reason: "Failed to parse LLM response" };
  }
}

// ─── Structured Resume Summary ────────────────────────────────────────────────
export interface ResumeSummary {
  skills: string[];
  projects: { name: string; description: string }[];
  strengths: string[];
  experience: string[];
}

export async function extractResumeSummary(
  resumeText: string
): Promise<ResumeSummary> {
  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.1,
    },
  });

  const prompt = `Extract structured information from this resume text. Be concise and factual.

RESUME TEXT:
${resumeText.slice(0, 8000)}

Respond with JSON:
{
  "skills": ["skill1", "skill2", ...],
  "projects": [{ "name": "Project Name", "description": "brief 1-2 sentence description" }, ...],
  "strengths": ["strength1", "strength2", ...],
  "experience": ["job_title at company (start-end): brief description", ...]
}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();

  try {
    const parsed = JSON.parse(text);
    return {
      skills: Array.isArray(parsed.skills) ? parsed.skills : [],
      projects: Array.isArray(parsed.projects) ? parsed.projects : [],
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
      experience: Array.isArray(parsed.experience) ? parsed.experience : [],
    };
  } catch {
    return { skills: [], projects: [], strengths: [], experience: [] };
  }
}

// ─── Q&A Answer Generator ─────────────────────────────────────────────────────
export async function generateAnswer(
  question: string,
  profileContext: string,
  resumeText: string
): Promise<string> {
  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    generationConfig: { temperature: 0.3 },
  });

  const prompt = `You are helping a job applicant answer a job application question. 
CRITICAL RULES:
1. Only use information provided in the PROFILE and RESUME below.
2. Do NOT invent, hallucinate, or assume any facts, employers, dates, credentials, or skills not present.
3. Be honest. If something is not in the profile/resume, say so briefly or provide a factual generic response.
4. Keep answers concise (2-4 sentences for most questions, unless it's clearly a "tell me about yourself" type).
5. Write in first person.

APPLICANT PROFILE:
${profileContext}

APPLICANT RESUME:
${resumeText.slice(0, 4000)}

APPLICATION QUESTION: ${question}

Provide only the answer text, no preamble:`;

  const result = await model.generateContent(prompt);
  return result.response.text().trim();
}

export { genAI };
