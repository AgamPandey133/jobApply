import prisma from "@/lib/db";
import { generateAnswer } from "@/lib/gemini";
import { ProfileData, FormAnswer } from "./types";

// ─── Normalize a question for lookup ────────────────────────────────────────
function normalizeQuestion(q: string): string {
  return q
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

// ─── Find matching Q&A bank entry ────────────────────────────────────────────
async function findQABankEntry(question: string): Promise<string | null> {
  const normalized = normalizeQuestion(question);

  // Exact match
  const exact = await prisma.questionAnswerBank.findFirst({
    where: { questionPattern: normalized },
  });
  if (exact) {
    await prisma.questionAnswerBank.update({
      where: { id: exact.id },
      data: { usageCount: { increment: 1 }, lastUsedAt: new Date() },
    });
    return exact.answer;
  }

  // Fuzzy: check if any stored key is a substring of the question or vice versa
  const allEntries = await prisma.questionAnswerBank.findMany({
    select: { id: true, questionPattern: true, answer: true },
  });

  for (const entry of allEntries) {
    const stored = entry.questionPattern;
    // Check significant overlap (one contains the other with >80% of words matching)
    const storedWords = stored.split(" ").filter((w) => w.length > 3);
    const questionWords = normalized.split(" ").filter((w) => w.length > 3);

    if (storedWords.length === 0) continue;

    const matchCount = storedWords.filter((w) =>
      questionWords.some((qw) => qw.includes(w) || w.includes(qw))
    ).length;

    const matchRatio = matchCount / storedWords.length;
    if (matchRatio > 0.75) {
      await prisma.questionAnswerBank.update({
        where: { id: entry.id },
        data: { usageCount: { increment: 1 }, lastUsedAt: new Date() },
      });
      return entry.answer;
    }
  }

  return null;
}

// ─── Build profile context string for LLM ────────────────────────────────────
function buildProfileContext(profile: ProfileData): string {
  const edu = profile.education
    .map(
      (e) =>
        `${e.degree} in ${e.major} at ${e.institution}${e.endDate ? ` (${e.endDate})` : ""}`
    )
    .join("; ");

  return `Name: ${profile.fullName}
Email: ${profile.email}
Phone: ${profile.phone}
Location: ${profile.location}
LinkedIn: ${profile.linkedinUrl ?? "N/A"}
GitHub: ${profile.githubUrl ?? "N/A"}
Portfolio: ${profile.portfolioUrl ?? "N/A"}
Education: ${edu}
Graduation Batch: ${profile.graduationBatch ?? "N/A"}
Work Authorization: ${profile.workAuthorization}
Requires Sponsorship: ${profile.requireSponsorship ? "Yes" : "No"}
Years of Experience: ${profile.yearsOfExperience}
Skills: ${profile.skills.join(", ")}
${profile.bio ? `Bio: ${profile.bio}` : ""}`;
}

// ─── Resolve an answer for a custom question ─────────────────────────────────
export async function resolveAnswer(
  question: string,
  profile: ProfileData,
  resumeText: string,
  pauseOnUnanswerable = false
): Promise<FormAnswer> {
  // 1. Check Q&A bank
  const bankAnswer = await findQABankEntry(question);
  if (bankAnswer) {
    return { question, answer: bankAnswer, source: "QA_BANK" };
  }

  // 2. Check if it's a well-known profile field
  const profileAnswer = resolveFromProfile(question, profile);
  if (profileAnswer !== null) {
    return { question, answer: profileAnswer, source: "PROFILE" };
  }

  // 3. Generate with LLM (grounded)
  const profileContext = buildProfileContext(profile);
  const generatedAnswer = await generateAnswer(
    question,
    profileContext,
    resumeText
  );

  // Store in Q&A bank for future reuse
  await prisma.questionAnswerBank.create({
    data: {
      questionPattern: normalizeQuestion(question),
      originalQuestion: question,
      answer: generatedAnswer,
      source: "LLM_GENERATED",
      category: categorizeQuestion(question),
    },
  });

  return { question, answer: generatedAnswer, source: "LLM_GENERATED" };
}

// ─── Resolve common profile fields by pattern ─────────────────────────────────
function resolveFromProfile(
  question: string,
  profile: ProfileData
): string | null {
  const q = question.toLowerCase();

  if (/\bname\b/.test(q) && !/company|school|employer/.test(q)) {
    return profile.fullName;
  }
  if (/email/.test(q)) return profile.email;
  if (/phone|mobile|number/.test(q)) return profile.phone;
  if (/\blocation\b|city|where do you live/.test(q)) return profile.location;
  if (/linkedin/.test(q)) return profile.linkedinUrl ?? "";
  if (/github/.test(q)) return profile.githubUrl ?? "";
  if (/portfolio|personal (site|website)/.test(q))
    return profile.portfolioUrl ?? "";
  // Work Authorization / Legal Right to Work
  if (/authorized to work in india|eligible to work in india|work in india|right to work in india/i.test(q)) {
    const isIndian = /india|indian/i.test(profile.workAuthorization);
    return isIndian ? "Yes" : (profile.requireSponsorship ? "No" : "Yes");
  }

  if (/legally authorized to work|authorized to work|eligible to work|permit to work|right to work/i.test(q)) {
    // If asking about the US specifically
    if (/in the united states|in the us\b|in us\b|u\.s\./i.test(q)) {
      const isUsAuth = /us citizen|green card|authorized to work in us/i.test(profile.workAuthorization);
      return isUsAuth ? "Yes" : "No";
    }
    // General authorization in home/current country
    return "Yes";
  }

  // Visa Sponsorship
  if (/require.*sponsor|need.*sponsor|will you.*require.*visa|visa sponsorship/i.test(q)) {
    if (/in india/i.test(q) && /india|indian/i.test(profile.workAuthorization)) {
      return "No";
    }
    return profile.requireSponsorship ? "Yes" : "No";
  }

  // Citizenship / Nationality
  if (/citizenship|nationality/i.test(q)) {
    if (/india|indian/i.test(profile.workAuthorization)) return "Indian";
    if (/us citizen/i.test(profile.workAuthorization)) return "United States";
    return profile.workAuthorization;
  }

  // Relocation
  if (/relocate|relocation/i.test(q)) {
    return "Yes";
  }

  // Notice Period
  if (/notice.*period|how soon can you start|availability to join|serving notice/i.test(q)) {
    return "Immediate / 30 days";
  }

  // CTC / Compensation
  if (/current.*ctc|current.*salary|current.*compensation/i.test(q)) {
    return "Negotiable / As per market standard";
  }
  if (/expected.*ctc|expected.*salary|expected.*compensation|salary.*expectation/i.test(q)) {
    return "Negotiable based on role and company standards";
  }

  // Preferred Location
  if (/preferred.*location|preferred.*city|target.*city|which.*city/i.test(q)) {
    return profile.preferredLocations?.length ? profile.preferredLocations.join(", ") : profile.location;
  }

  if (/graduation|grad.*year|class of/.test(q))
    return profile.graduationBatch ?? "";
  if (/years.*experience|experience.*years/.test(q))
    return String(profile.yearsOfExperience);

  const firstEdu = profile.education[0];
  if (!firstEdu) return null;

  if (/school|university|college|institution/.test(q))
    return firstEdu.institution;
  if (/degree/.test(q)) return firstEdu.degree;
  if (/major|field of study/.test(q)) return firstEdu.major;
  if (/gpa/.test(q)) return firstEdu.gpa ? String(firstEdu.gpa) : "";

  return null;
}

// ─── Categorize question for Q&A bank ────────────────────────────────────────
function categorizeQuestion(question: string): string {
  const q = question.toLowerCase();
  if (/sponsor|visa|auth|work permit/.test(q)) return "work_auth";
  if (/years|experience|worked|background/.test(q)) return "experience";
  if (/why.*company|why.*work|motivation|interest/.test(q)) return "cultural";
  if (/skill|technical|language|framework|tool/.test(q)) return "technical";
  return "general";
}
