import axios from "axios";
import { AtsType } from "@/generated/client";
import { JobBoardAdapter, NormalizedJob } from "./types";

// ─── Ashby API Response Types ─────────────────────────────────────────────────
interface AshbyJob {
  id: string;
  title: string;
  locationName?: string;
  isRemote?: boolean;
  department?: string;
  descriptionHtml?: string;
  publishedDate?: string;
  externalLink?: string;
  jobUrl?: string;
  employmentType?: string;
}

interface AshbyResponse {
  jobs?: AshbyJob[];
  data?: { jobPostings?: AshbyJob[] };
}

// ─── Ashby Adapter ────────────────────────────────────────────────────────────
export class AshbyAdapter implements JobBoardAdapter {
  readonly atsType = AtsType.ASHBY;

  detect(url: string): { matches: boolean; slug?: string } {
    const m =
      url.match(/jobs\.ashbyhq\.com\/([^/?#]+)/i) ||
      url.match(/ashbyhq\.com\/([^/?#]+)/i);
    if (m) return { matches: true, slug: m[1] };
    return { matches: false };
  }

  async fetchJobs(company: {
    id: string;
    slug: string;
    careersUrl: string;
  }): Promise<NormalizedJob[]> {
    const slug = this.detect(company.careersUrl).slug ?? company.slug;

    // Ashby has a public GraphQL API for job listings
    const graphqlUrl = "https://api.ashbyhq.com/posting-api/job-board";
    const response = await axios.post<AshbyResponse>(
      graphqlUrl,
      {
        organizationHostedJobsPageName: slug,
      },
      {
        timeout: 15000,
        headers: {
          "Content-Type": "application/json",
          "User-Agent":
            "Mozilla/5.0 (compatible; JobSniper/1.0; +https://github.com/jobsniper)",
        },
      }
    );

    const jobs =
      response.data?.jobs ??
      response.data?.data?.jobPostings ??
      [];

    return jobs.map((job) => this.normalize(job, slug));
  }

  private normalize(job: AshbyJob, slug: string): NormalizedJob {
    const location = job.locationName ?? "";
    const isRemote =
      job.isRemote === true ||
      /remote/i.test(location) ||
      /remote/i.test(job.title);

    const description = job.descriptionHtml
      ? job.descriptionHtml
          .replace(/<[^>]+>/g, " ")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&nbsp;/g, " ")
          .replace(/\s+/g, " ")
          .trim()
      : "";

    const url =
      job.externalLink ??
      job.jobUrl ??
      `https://jobs.ashbyhq.com/${slug}/${job.id}`;

    return {
      externalId: job.id,
      title: job.title,
      location,
      isRemote,
      department: job.department,
      description,
      url,
      postedAt: job.publishedDate ? new Date(job.publishedDate) : undefined,
    };
  }
}
