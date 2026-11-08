import { Page } from "playwright";

// ─── Apply Context ─────────────────────────────────────────────────────────────
export interface ApplyContext {
  jobId: string;
  applicationId: string;
  jobUrl: string;
  resumeFilePath: string; // Absolute path to the PDF
  profile: ProfileData;
  resumeText: string;
  isTestRun: boolean;
  mode: "REVIEW" | "FULL_AUTO";
}

// ─── Profile Data (from DB model) ────────────────────────────────────────────
export interface ProfileData {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  linkedinUrl?: string | null;
  githubUrl?: string | null;
  portfolioUrl?: string | null;
  education: {
    institution: string;
    degree: string;
    major: string;
    gpa?: number;
    startDate?: string;
    endDate?: string;
    current?: boolean;
  }[];
  graduationBatch?: string | null;
  workAuthorization: string;
  requireSponsorship: boolean;
  yearsOfExperience: number;
  bio?: string | null;
  skills: string[];
  preferredLocations?: string[];
}

// ─── Apply Result ──────────────────────────────────────────────────────────────
export interface ApplyResult {
  success: boolean;
  submitted: boolean; // true if actually clicked submit
  screenshotPath?: string;
  confirmationText?: string;
  errorMessage?: string;
  formAnswers?: FormAnswer[];
  needsManualAction?: boolean;
  manualActionReason?: string;
}

// ─── Form Answer ─────────────────────────────────────────────────────────────
export interface FormAnswer {
  question: string;
  answer: string;
  source: "PROFILE" | "QA_BANK" | "LLM_GENERATED";
}

// ─── ATS Apply Handler Interface ──────────────────────────────────────────────
export interface ApplyHandler {
  /** Which ATS this handler supports */
  readonly atsType: string;

  /**
   * Execute the apply flow on the given page.
   * The page should be already navigated to the job's apply URL.
   */
  apply(page: Page, ctx: ApplyContext): Promise<ApplyResult>;
}
