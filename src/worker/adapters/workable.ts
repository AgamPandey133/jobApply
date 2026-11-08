import axios from "axios";
import { AtsType } from "@/generated/client";
import { JobBoardAdapter, NormalizedJob } from "./types";

// ─── Workable Adapter ─────────────────────────────────────────────────────────
interface WorkableJob {
  id: string;
  title: string;
  city?: string;
  state?: string;
  country?: string;
  full_title?: string;
  shortcode?: string;
  department?: string;
  url?: string;
  application_url?: string;
  remote?: boolean;
  created_at?: string;
  description?: string;
}

interface WorkableResponse {
  jobs?: WorkableJob[];
}

export class WorkableAdapter implements JobBoardAdapter {
  readonly atsType = AtsType.WORKABLE;

  detect(url: string): { matches: boolean; slug?: string } {
    const m =
      url.match(/apply\.workable\.com\/([^/?#]+)/i) ||
      url.match(/workable\.com\/([^/?#]+)/i);
    if (m) return { matches: true, slug: m[1] };
    return { matches: false };
  }

  async fetchJobs(company: {
    id: string;
    slug: string;
    careersUrl: string;
  }): Promise<NormalizedJob[]> {
    const slug = this.detect(company.careersUrl).slug ?? company.slug;

    const { data } = await axios.get<WorkableResponse>(
      `https://apply.workable.com/api/v1/widget/accounts/${slug}/jobs`,
      {
        timeout: 15000,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; JobSniper/1.0)",
        },
      }
    );

    return (data.jobs ?? []).map((job) => this.normalize(job, slug));
  }

  private normalize(job: WorkableJob, slug: string): NormalizedJob {
    const parts = [job.city, job.state, job.country].filter(Boolean);
    const location = parts.join(", ");
    const isRemote = job.remote === true || /remote/i.test(location) || /remote/i.test(job.title);

    return {
      externalId: job.shortcode ?? job.id,
      title: job.title,
      location,
      isRemote,
      department: job.department,
      description: job.description ?? "",
      url:
        job.url ??
        job.application_url ??
        `https://apply.workable.com/${slug}/j/${job.shortcode ?? job.id}`,
      postedAt: job.created_at ? new Date(job.created_at) : undefined,
    };
  }
}
