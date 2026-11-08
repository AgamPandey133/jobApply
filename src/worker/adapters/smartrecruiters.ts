import axios from "axios";
import { AtsType } from "@/generated/client";
import { JobBoardAdapter, NormalizedJob } from "./types";

// ─── SmartRecruiters Adapter ──────────────────────────────────────────────────
interface SRJob {
  id: string;
  name: string;
  location?: {
    city?: string;
    country?: string;
    region?: string;
    remote?: boolean;
  };
  department?: { label?: string };
  jobAd?: { sections?: { description?: { text?: string } } };
  ref?: string; // Job URL
  releasedDate?: string;
  customField?: { valueLabel?: string }[];
}

interface SRResponse {
  content?: SRJob[];
  totalFound?: number;
}

export class SmartRecruitersAdapter implements JobBoardAdapter {
  readonly atsType = AtsType.SMARTRECRUITERS;

  detect(url: string): { matches: boolean; slug?: string } {
    const m =
      url.match(/careers\.smartrecruiters\.com\/([^/?#]+)/i) ||
      url.match(/smartrecruiters\.com\/([^/?#]+)/i);
    if (m) return { matches: true, slug: m[1] };
    return { matches: false };
  }

  async fetchJobs(company: {
    id: string;
    slug: string;
    careersUrl: string;
  }): Promise<NormalizedJob[]> {
    const slug = this.detect(company.careersUrl).slug ?? company.slug;

    const { data } = await axios.get<SRResponse>(
      `https://api.smartrecruiters.com/v1/companies/${slug}/postings`,
      {
        params: { limit: 100 },
        timeout: 15000,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; JobSniper/1.0)",
        },
      }
    );

    return (data.content ?? []).map((job) =>
      this.normalize(job, slug)
    );
  }

  private normalize(job: SRJob, slug: string): NormalizedJob {
    const loc = job.location;
    const parts = [loc?.city, loc?.region, loc?.country].filter(Boolean);
    const location = parts.join(", ");
    const isRemote =
      loc?.remote === true ||
      /remote/i.test(location) ||
      /remote/i.test(job.name);

    const description =
      job.jobAd?.sections?.description?.text ?? "";

    const url =
      job.ref ??
      `https://careers.smartrecruiters.com/${slug}/${job.id}`;

    return {
      externalId: job.id,
      title: job.name,
      location,
      isRemote,
      department: job.department?.label,
      description,
      url,
      postedAt: job.releasedDate ? new Date(job.releasedDate) : undefined,
    };
  }
}
