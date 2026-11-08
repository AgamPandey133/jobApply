import { AtsType } from "@/generated/client";

// ─── Normalized Job ────────────────────────────────────────────────────────────
export interface NormalizedJob {
  externalId: string;
  title: string;
  location: string;
  isRemote: boolean;
  department?: string;
  description: string;
  url: string;
  postedAt?: Date;
}

// ─── Job Board Adapter Interface ───────────────────────────────────────────────
export interface JobBoardAdapter {
  /** ATS type identifier */
  readonly atsType: AtsType;

  /**
   * Detect whether a careers URL belongs to this ATS.
   * Returns the slug/board identifier if it matches.
   */
  detect(url: string): { matches: boolean; slug?: string };

  /**
   * Fetch all current job postings for a company.
   * @param company - Company info including slug and careersUrl
   * @returns Array of normalized job objects
   */
  fetchJobs(company: {
    id: string;
    slug: string;
    careersUrl: string;
  }): Promise<NormalizedJob[]>;
}

// ─── Queue Job Payloads ────────────────────────────────────────────────────────
export interface PollJobPayload {
  companyId: string;
}

export interface FilterJobPayload {
  jobId: string;
}

export interface MatchJobPayload {
  jobId: string;
}

export interface ApplyJobPayload {
  jobId: string;
  applicationId: string;
  resumeId: string;
  mode: "REVIEW" | "FULL_AUTO";
  isTestRun?: boolean;
}

export interface NotifyPayload {
  type:
    | "JOB_AWAITING_REVIEW"
    | "APPLICATION_SUBMITTED"
    | "NEEDS_MANUAL_ACTION"
    | "LOW_MATCH"
    | "APPLY_FAILED";
  data: Record<string, unknown>;
}
