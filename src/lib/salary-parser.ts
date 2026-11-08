/**
 * Comprehensive Salary Parser & Extractor for JobSniper
 * Parses Indian LPA (Lakhs Per Annum), monthly INR, stipends, and global USD/EUR/GBP salaries from job titles & descriptions.
 */

export interface ParsedSalary {
  minAnnualLpa?: number;     // e.g. 12 (12 LPA)
  maxAnnualLpa?: number;     // e.g. 25 (25 LPA)
  minAnnualUsd?: number;     // e.g. 120000 ($120k/yr)
  maxAnnualUsd?: number;     // e.g. 180000 ($180k/yr)
  minMonthlyInr?: number;    // e.g. 40000 (₹40k/mo)
  maxMonthlyInr?: number;    // e.g. 70000 (₹70k/mo)
  minMonthlyUsd?: number;    // e.g. 5000 ($5k/mo)
  maxMonthlyUsd?: number;    // e.g. 10000 ($10k/mo)
  period?: "MONTHLY" | "ANNUAL";
  currency?: "INR" | "USD" | "EUR" | "GBP";
  displayString?: string;    // e.g. "₹12–₹25 LPA", "₹40k/mo", "Stipend: ₹25k/mo", "$120k–$180k/yr"
  unspecified?: boolean;
}

export interface SalaryFilterOptions {
  mode?: "lpa" | "monthly" | "all";
  minLpa?: number;
  maxLpa?: number;
  minMonthly?: number;
  maxMonthly?: number;
  includeUnspecified?: boolean;
}

function cleanText(raw: string): string {
  if (!raw) return "";
  return raw
    .replace(/<[^>]*>/g, " ")               // strip HTML tags
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&[a-z0-9#]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseSalary(text: string): ParsedSalary {
  const result: ParsedSalary = { unspecified: true };
  if (!text) return result;

  const cleaned = cleanText(text);

  // 1. Indian LPA patterns:
  // e.g. "12 - 25 LPA", "₹8 LPA", "10 to 18 Lakhs per annum", "15LPA", "6-12 LPA", "CTC: 8 to 14 LPA", "Package: 10 LPA", "6.5 Lacs", "12 Lacs P.A."
  const lpaMatch = cleaned.match(
    /(?:ctc|package|salary)?[:\s-]*(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)\s*(?:[-–to ]+\s*(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?))?\s*(?:lpa|lakhs?|lacs?|lac|l\.p\.a\.?)\b/i
  );
  if (lpaMatch) {
    const minVal = parseFloat(lpaMatch[1]);
    const maxVal = lpaMatch[2] ? parseFloat(lpaMatch[2]) : minVal;
    if (minVal >= 1 && minVal <= 180) {
      result.minAnnualLpa = minVal;
      result.maxAnnualLpa = maxVal;
      result.minMonthlyInr = Math.round((minVal * 100000) / 12);
      result.maxMonthlyInr = Math.round((maxVal * 100000) / 12);
      result.period = "ANNUAL";
      result.currency = "INR";
      result.unspecified = false;
      result.displayString = minVal === maxVal ? `₹${minVal} LPA` : `₹${minVal}–₹${maxVal} LPA`;
      return result;
    }
  }

  // 2. Full numbers in INR: e.g. "₹6,00,000 - ₹12,00,000" or "INR 500000 to 900000"
  const inrFullMatch = cleaned.match(
    /(?:₹|rs\.?|inr)\s*([1-9]\d{4,7})\s*(?:[-–to ]+\s*(?:₹|rs\.?|inr)?\s*([1-9]\d{4,7}))?(?:\s*(?:per\s*annum|p\.a\.?|\/yr|\/year|annual))?\b/i
  );
  if (inrFullMatch) {
    const rawMin = parseInt(inrFullMatch[1].replace(/,/g, ""), 10);
    const rawMax = inrFullMatch[2] ? parseInt(inrFullMatch[2].replace(/,/g, ""), 10) : rawMin;
    if (rawMin >= 100000) {
      const minLpa = Math.round((rawMin / 100000) * 10) / 10;
      const maxLpa = Math.round((rawMax / 100000) * 10) / 10;
      result.minAnnualLpa = minLpa;
      result.maxAnnualLpa = maxLpa;
      result.minMonthlyInr = Math.round(rawMin / 12);
      result.maxMonthlyInr = Math.round(rawMax / 12);
      result.period = "ANNUAL";
      result.currency = "INR";
      result.unspecified = false;
      result.displayString = minLpa === maxLpa ? `₹${minLpa} LPA` : `₹${minLpa}–₹${maxLpa} LPA`;
      return result;
    }
  }

  // 3. Stipend / Monthly INR:
  // e.g. "Stipend: ₹25,000", "Stipend: 20k - 30k", "Stipend: 15000/month", "₹40,000 - ₹60,000 / month", "₹50k/mo", "Rs. 30000 pm"
  const stipendOrMonthlyMatch = cleaned.match(
    /(?:stipend|salary)?[:\s-]*(?:₹|rs\.?|inr)?\s*(\d+(?:,\d{3})*|\d+k?)\s*(?:[-–to ]+\s*(?:₹|rs\.?|inr)?\s*(\d+(?:,\d{3})*|\d+k?))?\s*(?:\/|\s*per\s*)?(?:month|mo|pm|p\.m\.)\b/i
  ) || cleaned.match(
    /(?:stipend)[:\s-]*(?:₹|rs\.?|inr)?\s*(\d+(?:,\d{3})*|\d+k?)\s*(?:[-–to ]+\s*(?:₹|rs\.?|inr)?\s*(\d+(?:,\d{3})*|\d+k?))?\b/i
  );

  if (stipendOrMonthlyMatch) {
    const parseVal = (str: string) => {
      if (!str) return 0;
      const cleanStr = str.replace(/,/g, "").trim().toLowerCase();
      if (cleanStr.endsWith("k")) return parseFloat(cleanStr.slice(0, -1)) * 1000;
      const val = parseFloat(cleanStr);
      return val < 1000 && val > 0 ? val * 1000 : val;
    };

    const minVal = parseVal(stipendOrMonthlyMatch[1]);
    const maxVal = stipendOrMonthlyMatch[2] ? parseVal(stipendOrMonthlyMatch[2]) : minVal;

    if (minVal >= 3000 && minVal <= 500000) {
      result.minMonthlyInr = minVal;
      result.maxMonthlyInr = maxVal;
      result.minAnnualLpa = Math.round(((minVal * 12) / 100000) * 10) / 10;
      result.maxAnnualLpa = Math.round(((maxVal * 12) / 100000) * 10) / 10;
      result.period = "MONTHLY";
      result.currency = "INR";
      result.unspecified = false;

      const formatK = (v: number) => (v >= 100000 ? `${(v / 100000).toFixed(1)}L` : `${Math.round(v / 1000)}k`);
      result.displayString = minVal === maxVal
        ? `₹${formatK(minVal)}/mo`
        : `₹${formatK(minVal)}–₹${formatK(maxVal)}/mo`;
      return result;
    }
  }

  // 4. USD Annual / Monthly:
  // e.g. "Salary: $120,000 - $180,000 / year", "$120k - $160k", "$140,000/yr", "$145,000.00 - $190,000.00/yr"
  const usdMatch = cleaned.match(
    /\$\s*(\d+(?:,\d{3})*(?:\.\d+)?|\d+k?)\s*(?:[-–to ]+\s*\$?\s*(\d+(?:,\d{3})*(?:\.\d+)?|\d+k?))?\s*(?:\/|\s*per\s*)?(?:year|yr|annum|annually)\b/i
  ) || cleaned.match(
    /\$\s*(\d{2,3})k\s*(?:[-–to ]+\s*\$?\s*(\d{2,3})k)?\b/i
  );

  if (usdMatch) {
    const parseUsd = (str: string) => {
      if (!str) return 0;
      const cleanStr = str.replace(/,/g, "").trim().toLowerCase();
      if (cleanStr.endsWith("k")) return parseFloat(cleanStr.slice(0, -1)) * 1000;
      return parseFloat(cleanStr);
    };

    const minVal = parseUsd(usdMatch[1]);
    const maxVal = usdMatch[2] ? parseUsd(usdMatch[2]) : minVal;

    if (minVal >= 25000 && minVal <= 800000) {
      result.minAnnualUsd = minVal;
      result.maxAnnualUsd = maxVal;
      result.minMonthlyUsd = Math.round(minVal / 12);
      result.maxMonthlyUsd = Math.round(maxVal / 12);
      // Rough INR conversion (1 USD = ~85 INR)
      result.minAnnualLpa = Math.round(((minVal * 85) / 100000) * 10) / 10;
      result.maxAnnualLpa = Math.round(((maxVal * 85) / 100000) * 10) / 10;
      result.minMonthlyInr = Math.round((minVal * 85) / 12);
      result.maxMonthlyInr = Math.round((maxVal * 85) / 12);
      result.period = "ANNUAL";
      result.currency = "USD";
      result.unspecified = false;

      const formatUsdK = (v: number) => `${Math.round(v / 1000)}k`;
      result.displayString = minVal === maxVal ? `$${formatUsdK(minVal)}/yr` : `$${formatUsdK(minVal)}–$${formatUsdK(maxVal)}/yr`;
      return result;
    }
  }

  return result;
}

/**
 * Checks if a job matches salary criteria (monthly or annual LPA range)
 */
export function matchesSalaryFilter(
  textOrSalary: string | ParsedSalary,
  options: SalaryFilterOptions
): boolean;
export function matchesSalaryFilter(
  textOrSalary: string | ParsedSalary,
  minAnnualLpa?: number,
  minMonthlyInr?: number,
  minAnnualUsd?: number
): boolean;
export function matchesSalaryFilter(
  textOrSalary: string | ParsedSalary,
  optionsOrMinLpa?: SalaryFilterOptions | number,
  minMonthlyInr?: number,
  minAnnualUsd?: number
): boolean {
  let options: SalaryFilterOptions;

  if (typeof optionsOrMinLpa === "object" && optionsOrMinLpa !== null) {
    options = optionsOrMinLpa;
  } else {
    options = {
      mode: "all",
      minLpa: typeof optionsOrMinLpa === "number" ? optionsOrMinLpa : undefined,
      minMonthly: minMonthlyInr,
      includeUnspecified: false,
    };
  }

  const { mode = "all", minLpa, maxLpa, minMonthly, maxMonthly, includeUnspecified = false } = options;

  // No active salary filter
  if (
    mode === "all" &&
    !minLpa &&
    !maxLpa &&
    !minMonthly &&
    !maxMonthly &&
    !minAnnualUsd
  ) {
    return true;
  }

  const parsed = typeof textOrSalary === "string" ? parseSalary(textOrSalary) : textOrSalary;

  // If salary is unspecified
  if (!parsed || !parsed.displayString || parsed.unspecified) {
    return includeUnspecified === true;
  }

  if (minAnnualUsd !== undefined && minAnnualUsd > 0) {
    const jobMax = parsed.maxAnnualUsd ?? (parsed.maxAnnualLpa ? Math.round((parsed.maxAnnualLpa * 100000) / 85) : undefined);
    const jobMin = parsed.minAnnualUsd ?? (parsed.minAnnualLpa ? Math.round((parsed.minAnnualLpa * 100000) / 85) : undefined);
    if ((jobMax ?? jobMin ?? 0) < minAnnualUsd) return false;
  }

  // 1. Annual LPA checking
  if (mode === "lpa" || (minLpa !== undefined && minLpa > 0) || (maxLpa !== undefined && maxLpa > 0)) {
    const jobMax = parsed.maxAnnualLpa ?? (parsed.maxMonthlyInr ? (parsed.maxMonthlyInr * 12) / 100000 : undefined);
    const jobMin = parsed.minAnnualLpa ?? (parsed.minMonthlyInr ? (parsed.minMonthlyInr * 12) / 100000 : undefined);

    if (jobMax === undefined && jobMin === undefined) {
      return includeUnspecified === true;
    }

    if (minLpa !== undefined && minLpa > 0) {
      if ((jobMax ?? jobMin!) < minLpa) return false;
    }
    if (maxLpa !== undefined && maxLpa > 0) {
      if ((jobMin ?? jobMax!) > maxLpa) return false;
    }
    return true;
  }

  // 2. Monthly INR checking
  if (mode === "monthly" || (minMonthly !== undefined && minMonthly > 0) || (maxMonthly !== undefined && maxMonthly > 0)) {
    const jobMax = parsed.maxMonthlyInr ?? (parsed.maxAnnualLpa ? Math.round((parsed.maxAnnualLpa * 100000) / 12) : undefined);
    const jobMin = parsed.minMonthlyInr ?? (parsed.minAnnualLpa ? Math.round((parsed.minAnnualLpa * 100000) / 12) : undefined);

    if (jobMax === undefined && jobMin === undefined) {
      return includeUnspecified === true;
    }

    if (minMonthly !== undefined && minMonthly > 0) {
      if ((jobMax ?? jobMin!) < minMonthly) return false;
    }
    if (maxMonthly !== undefined && maxMonthly > 0) {
      if ((jobMin ?? jobMax!) > maxMonthly) return false;
    }
    return true;
  }

  return true;
}

