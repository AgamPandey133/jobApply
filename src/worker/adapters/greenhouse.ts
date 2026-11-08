import axios from "axios";
import { AtsType } from "@/generated/client";
import { JobBoardAdapter, NormalizedJob } from "./types";

// ─── Greenhouse API Response Types ────────────────────────────────────────────
interface GreenhouseJob {
  id: number;
  title: string;
  location: { name: string };
  content: string; // HTML description
  absolute_url: string;
  departments: { name: string }[];
  updated_at: string;
  metadata?: unknown[];
}

interface GreenhouseResponse {
  jobs: GreenhouseJob[];
}

// ─── Greenhouse Adapter ───────────────────────────────────────────────────────
export class GreenhouseAdapter implements JobBoardAdapter {
  readonly atsType = AtsType.GREENHOUSE;

  detect(url: string): { matches: boolean; slug?: string } {
    const patterns = [
      /boards\.greenhouse\.io\/([^/?#]+)/i,
      /job-boards\.greenhouse\.io\/([^/?#]+)/i,
      /greenhouse\.io\/([^/?#]+)/i,
    ];
    for (const pattern of patterns) {
      const m = url.match(pattern);
      if (m) return { matches: true, slug: m[1] };
    }
    return { matches: false };
  }

  async fetchJobs(company: {
    id: string;
    slug: string;
    careersUrl: string;
  }): Promise<NormalizedJob[]> {
    const slug = this.detect(company.careersUrl).slug ?? company.slug;

    // Try the new job-boards API first, fallback to boards-api
    const urls = [
      `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`,
      `https://job-boards.greenhouse.io/${slug}/jobs.json`,
    ];

    for (const url of urls) {
      try {
        const { data } = await axios.get<GreenhouseResponse>(url, {
          timeout: 15000,
          headers: {
            "User-Agent":
              "Mozilla/5.0 (compatible; JobSniper/1.0; +https://github.com/jobsniper)",
          },
        });

        if (!data?.jobs?.length && data?.jobs !== undefined) return [];

        return (data.jobs ?? []).map((job) =>
          this.normalize(job)
        );
      } catch (err: unknown) {
        const error = err as { response?: { status: number } };
        if (error?.response?.status === 404) continue; // try next URL
        throw err;
      }
    }

    return [];
  }

  private normalize(job: GreenhouseJob): NormalizedJob {
    const locationName = job.location?.name ?? "";
    const isRemote =
      /remote/i.test(locationName) ||
      /remote/i.test(job.title) ||
      /anywhere/i.test(locationName);

    // Strip HTML from description
    const description = job.content
      ? job.content
          .replace(/<[^>]+>/g, " ")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&nbsp;/g, " ")
          .replace(/\s+/g, " ")
          .trim()
      : "";

    return {
      externalId: String(job.id),
      title: job.title,
      location: locationName,
      isRemote,
      department: job.departments?.[0]?.name,
      description,
      url: job.absolute_url,
      postedAt: job.updated_at ? new Date(job.updated_at) : undefined,
    };
  }
}
