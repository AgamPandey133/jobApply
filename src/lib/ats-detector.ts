import { AtsType } from "@/generated/client";

// ─── ATS Detection Rules ──────────────────────────────────────────────────────
interface DetectionRule {
  atsType: AtsType;
  patterns: RegExp[];
  extractSlug: (url: string) => string | null;
}

const rules: DetectionRule[] = [
  {
    atsType: AtsType.GREENHOUSE,
    patterns: [
      /greenhouse\.io/i,
      /boards\.greenhouse\.io/i,
      /job-boards\.greenhouse\.io/i,
    ],
    extractSlug: (url) => {
      const m =
        url.match(/greenhouse\.io\/(?:jobs#!\/)?([^/?#]+)/i) ||
        url.match(/\/jobs\?gh_jid=\d+.*?at=([^&]+)/i);
      return m ? m[1] : null;
    },
  },
  {
    atsType: AtsType.LEVER,
    patterns: [/lever\.co/i, /jobs\.lever\.co/i],
    extractSlug: (url) => {
      const m = url.match(/lever\.co\/([^/?#]+)/i);
      return m ? m[1] : null;
    },
  },
  {
    atsType: AtsType.ASHBY,
    patterns: [/ashbyhq\.com/i, /jobs\.ashbyhq\.com/i],
    extractSlug: (url) => {
      const m = url.match(/ashbyhq\.com\/([^/?#]+)/i);
      return m ? m[1] : null;
    },
  },
  {
    atsType: AtsType.WORKABLE,
    patterns: [/workable\.com/i, /apply\.workable\.com/i],
    extractSlug: (url) => {
      const m = url.match(/workable\.com\/([^/?#]+)/i);
      return m ? m[1] : null;
    },
  },
  {
    atsType: AtsType.SMARTRECRUITERS,
    patterns: [/smartrecruiters\.com/i, /careers\.smartrecruiters\.com/i],
    extractSlug: (url) => {
      const m = url.match(/smartrecruiters\.com\/([^/?#]+)/i);
      return m ? m[1] : null;
    },
  },
];

// ─── Detect ATS from a careers URL ───────────────────────────────────────────
export function detectAts(careersUrl: string): {
  atsType: AtsType;
  slug: string | null;
} {
  for (const rule of rules) {
    if (rule.patterns.some((p) => p.test(careersUrl))) {
      return {
        atsType: rule.atsType,
        slug: rule.extractSlug(careersUrl),
      };
    }
  }
  return { atsType: AtsType.CUSTOM, slug: null };
}

// ─── Async Deep Detection (Inspects redirects & embedded ATS in HTML) ─────────
export async function detectAtsAsync(careersUrl: string): Promise<{
  atsType: AtsType;
  slug: string | null;
}> {
  // First try direct URL matching
  const direct = detectAts(careersUrl);
  if (direct.atsType !== AtsType.CUSTOM && direct.slug) {
    return direct;
  }

  // If URL doesn't match directly, try fetching the page to detect embedded ATS or redirects
  try {
    const axios = (await import("axios")).default;
    const res = await axios.get(careersUrl, {
      timeout: 8000,
      maxRedirects: 5,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    // Check final redirect URL
    const finalUrl = res.request?.res?.responseUrl || res.config.url || careersUrl;
    const redirectDetect = detectAts(finalUrl);
    if (redirectDetect.atsType !== AtsType.CUSTOM && redirectDetect.slug) {
      return redirectDetect;
    }

    // Inspect HTML content for embedded ATS patterns
    const html = typeof res.data === "string" ? res.data : "";

    // 1. Greenhouse embed or link
    const ghMatch =
      html.match(/boards\.greenhouse\.io\/(?:embed\/job_board\?for=)?([a-zA-Z0-9_-]+)/i) ||
      html.match(/greenhouse\.io\/([a-zA-Z0-9_-]+)/i) ||
      html.match(/data-gh-src=".*?for=([a-zA-Z0-9_-]+)/i);
    if (ghMatch) return { atsType: AtsType.GREENHOUSE, slug: ghMatch[1] };

    // 2. Lever embed or link
    const leverMatch =
      html.match(/jobs\.lever\.co\/([a-zA-Z0-9_-]+)/i) ||
      html.match(/api\.lever\.co\/v0\/postings\/([a-zA-Z0-9_-]+)/i);
    if (leverMatch) return { atsType: AtsType.LEVER, slug: leverMatch[1] };

    // 3. Ashby embed or link
    const ashbyMatch =
      html.match(/jobs\.ashbyhq\.com\/([a-zA-Z0-9_-]+)/i) ||
      html.match(/ashbyhq\.com\/([a-zA-Z0-9_-]+)/i);
    if (ashbyMatch) return { atsType: AtsType.ASHBY, slug: ashbyMatch[1] };

    // 4. Workable embed or link
    const workableMatch =
      html.match(/apply\.workable\.com\/([a-zA-Z0-9_-]+)/i) ||
      html.match(/workable\.com\/([a-zA-Z0-9_-]+)/i);
    if (workableMatch) return { atsType: AtsType.WORKABLE, slug: workableMatch[1] };

    // 5. SmartRecruiters embed or link
    const srMatch =
      html.match(/careers\.smartrecruiters\.com\/([a-zA-Z0-9_-]+)/i) ||
      html.match(/smartrecruiters\.com\/([a-zA-Z0-9_-]+)/i);
    if (srMatch) return { atsType: AtsType.SMARTRECRUITERS, slug: srMatch[1] };
  } catch (err) {
    // If fetching fails, fall back to direct detection
    console.warn(`[ATS-Detector] Could not deep-scan ${careersUrl}:`, String(err));
  }

  return direct;
}

// ─── Slugify company name ──────────────────────────────────────────────────────
export function slugifyCompany(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
