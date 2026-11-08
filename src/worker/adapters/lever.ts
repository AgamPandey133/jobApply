import axios from "axios";
import { AtsType } from "@/generated/client";
import { JobBoardAdapter, NormalizedJob } from "./types";

// ─── Lever API Response Types ─────────────────────────────────────────────────
interface LeverPosting {
  id: string;
  text: string; // Job title
  hostedUrl: string;
  applyUrl: string;
  categories: {
    location?: string;
    team?: string;
    department?: string;
    commitment?: string; // "Full-time", "Part-time", etc.
    level?: string;
  };
  content?: {
    description?: string;
    lists?: { text: string; content: string }[];
    closing?: string;
  };
  tags?: string[];
  createdAt?: number; // Unix timestamp in ms
}

// ─── Lever Adapter ────────────────────────────────────────────────────────────
export class LeverAdapter implements JobBoardAdapter {
  readonly atsType = AtsType.LEVER;

  detect(url: string): { matches: boolean; slug?: string } {
    const m =
      url.match(/jobs\.lever\.co\/([^/?#]+)/i) ||
      url.match(/lever\.co\/([^/?#]+)/i);
    if (m) return { matches: true, slug: m[1] };
    return { matches: false };
  }

  async fetchJobs(company: {
    id: string;
    slug: string;
    careersUrl: string;
  }): Promise<NormalizedJob[]> {
    const slug = this.detect(company.careersUrl).slug ?? company.slug;

    const { data } = await axios.get<LeverPosting[]>(
      `https://api.lever.co/v0/postings/${slug}?mode=json`,
      {
        timeout: 15000,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; JobSniper/1.0; +https://github.com/jobsniper)",
        },
      }
    );

    if (!Array.isArray(data)) return [];
    return data.map((posting) => this.normalize(posting));
  }

  private normalize(posting: LeverPosting): NormalizedJob {
    const location = posting.categories?.location ?? "";
    const isRemote =
      /remote/i.test(location) ||
      /remote/i.test(posting.text) ||
      posting.tags?.some((t) => /remote/i.test(t)) === true;

    // Build description from Lever content structure
    let description = "";
    if (posting.content?.description) {
      description += posting.content.description + "\n\n";
    }
    if (posting.content?.lists?.length) {
      for (const section of posting.content.lists) {
        description += `**${section.text}**\n${section.content}\n\n`;
      }
    }
    if (posting.content?.closing) {
      description += posting.content.closing;
    }

    // Strip HTML
    description = description
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    return {
      externalId: posting.id,
      title: posting.text,
      location,
      isRemote,
      department:
        posting.categories?.team ?? posting.categories?.department,
      description,
      url: posting.hostedUrl ?? posting.applyUrl,
      postedAt: posting.createdAt
        ? new Date(posting.createdAt)
        : undefined,
    };
  }
}
