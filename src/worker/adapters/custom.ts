import axios from "axios";
import * as cheerio from "cheerio";
import { AtsType } from "@/generated/client";
import { JobBoardAdapter, NormalizedJob } from "./types";

export class CustomAdapter implements JobBoardAdapter {
  readonly atsType = AtsType.CUSTOM;

  detect(url: string): { matches: boolean; slug?: string } {
    if (/remoteok\.com/i.test(url)) return { matches: true, slug: "remoteok" };
    if (/arbeitnow\.com/i.test(url)) return { matches: true, slug: "arbeitnow" };
    if (/jobicy\.com/i.test(url)) return { matches: true, slug: "jobicy" };
    if (/linkedin\.com/i.test(url)) return { matches: true, slug: "linkedin" };
    if (/weworkremotely\.com/i.test(url)) return { matches: true, slug: "weworkremotely" };
    return { matches: false };
  }

  async fetchJobs(company: {
    id: string;
    slug: string;
    careersUrl: string;
  }): Promise<NormalizedJob[]> {
    const slug = company.slug.toLowerCase();
    const url = company.careersUrl.toLowerCase();

    // Direct Job Board API integrations
    if (slug === "remoteok" || url.includes("remoteok.com")) {
      return this.fetchRemoteOk();
    }
    if (slug === "arbeitnow" || url.includes("arbeitnow.com")) {
      return this.fetchArbeitnow();
    }
    if (slug === "jobicy" || url.includes("jobicy.com")) {
      return this.fetchJobicy();
    }
    if (slug === "linkedin" || url.includes("linkedin.com")) {
      return this.fetchLinkedIn(company);
    }
    if (slug === "weworkremotely" || url.includes("weworkremotely.com")) {
      return this.fetchWWR();
    }

    // General Web Scraping for Custom Career Sites
    return this.fetchCustomHtml(company);
  }

  private async fetchRemoteOk(): Promise<NormalizedJob[]> {
    const jobs: NormalizedJob[] = [];
    try {
      const { data } = await axios.get<any[]>("https://remoteok.com/api", {
        timeout: 15000,
        headers: {
          "User-Agent": "JobSniper/1.0 (+https://github.com/AgamPandey133/JobSniper)",
          Accept: "application/json",
        },
      });

      if (Array.isArray(data)) {
        // Skip index 0 which contains API legal disclaimers
        for (const item of data.slice(1)) {
          if (!item.id || !item.position) continue;
          jobs.push({
            externalId: String(item.id),
            title: item.company ? `${item.position} (${item.company})` : item.position,
            location: item.location || "Remote",
            isRemote: true,
            department: Array.isArray(item.tags) ? item.tags.slice(0, 3).join(", ") : undefined,
            description: item.description || "",
            url: item.url || `https://remoteok.com/remote-jobs/${item.id}`,
            postedAt: item.date ? new Date(item.date) : new Date(),
          });
        }
      }
    } catch (err) {
      console.error("[CustomAdapter] Failed to fetch RemoteOK jobs:", err);
    }
    return jobs;
  }

  private async fetchArbeitnow(): Promise<NormalizedJob[]> {
    const jobs: NormalizedJob[] = [];
    try {
      const { data } = await axios.get<{ data?: any[] }>("https://www.arbeitnow.com/api/job-board-api", {
        timeout: 15000,
        headers: { Accept: "application/json" },
      });

      if (Array.isArray(data?.data)) {
        for (const item of data.data) {
          if (!item.slug || !item.title) continue;
          jobs.push({
            externalId: String(item.slug),
            title: item.company_name ? `${item.title} (${item.company_name})` : item.title,
            location: item.location || (item.remote ? "Remote" : ""),
            isRemote: Boolean(item.remote),
            department: Array.isArray(item.tags) ? item.tags.slice(0, 3).join(", ") : undefined,
            description: item.description || "",
            url: item.url || `https://www.arbeitnow.com/jobs/${item.slug}`,
            postedAt: item.created_at ? new Date(item.created_at * 1000) : new Date(),
          });
        }
      }
    } catch (err) {
      console.error("[CustomAdapter] Failed to fetch Arbeitnow jobs:", err);
    }
    return jobs;
  }

  private async fetchJobicy(): Promise<NormalizedJob[]> {
    const jobs: NormalizedJob[] = [];
    try {
      const { data } = await axios.get<{ jobs?: any[] }>("https://jobicy.com/api/v2/remote-jobs?count=50", {
        timeout: 15000,
        headers: { Accept: "application/json" },
      });

      if (Array.isArray(data?.jobs)) {
        for (const item of data.jobs) {
          if (!item.id || !item.jobTitle) continue;
          jobs.push({
            externalId: String(item.id),
            title: item.companyName ? `${item.jobTitle} (${item.companyName})` : item.jobTitle,
            location: item.jobGeo || "Remote",
            isRemote: true,
            department: item.jobCategory,
            description: item.jobDescription || "",
            url: item.url || `https://jobicy.com/jobs/${item.id}`,
            postedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
          });
        }
      }
    } catch (err) {
      console.error("[CustomAdapter] Failed to fetch Jobicy jobs:", err);
    }
    return jobs;
  }

  private async fetchLinkedIn(company: { careersUrl: string }): Promise<NormalizedJob[]> {
    const jobs: NormalizedJob[] = [];
    const queries: { kw: string; loc: string }[] = [];

    if (company.careersUrl && company.careersUrl.includes("keywords=")) {
      try {
        const parsed = new URL(company.careersUrl);
        const kw = parsed.searchParams.get("keywords") ?? "Software Engineer Intern";
        const loc = parsed.searchParams.get("location") ?? "India";
        queries.push({ kw, loc });
      } catch {
        queries.push({ kw: "Software Engineer Intern", loc: "India" });
      }
    } else {
      queries.push(
        { kw: "Software Engineer Intern", loc: "India" },
        { kw: "Graduate Engineer Trainee", loc: "India" },
        { kw: "Associate Software Engineer", loc: "India" }
      );
    }

    const seenUrls = new Set<string>();

    for (const q of queries) {
      try {
        const targetUrl = `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=${encodeURIComponent(
          q.kw
        )}&location=${encodeURIComponent(q.loc)}&start=0`;

        const { data: html } = await axios.get<string>(targetUrl, {
          timeout: 15000,
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
          },
        });

        const $ = cheerio.load(html);
        $("li").each((_, elem) => {
          const el = $(elem);
          const title = el.find(".base-search-card__title").text().trim();
          const comp = el.find(".base-search-card__subtitle").text().trim();
          const location = el.find(".job-search-card__location").text().trim();
          const rawLink = el.find("a.base-card__full-link").attr("href");
          const link = rawLink ? rawLink.split("?")[0] : "";
          const urn = el.find(".base-card").attr("data-entity-urn") || "";
          const id =
            urn.replace(/\D/g, "") ||
            Buffer.from(link).toString("base64").slice(0, 24);

          if (title && link && !seenUrls.has(link)) {
            seenUrls.add(link);
            jobs.push({
              externalId: id,
              title: comp ? `${title} (${comp})` : title,
              location: location || "India",
              isRemote: /remote/i.test(location) || /remote/i.test(title),
              department: "Engineering",
              description: `${title} at ${comp}. Location: ${location}. Apply via LinkedIn.`,
              url: link,
              postedAt: new Date(),
            });
          }
        });
      } catch (err: any) {
        console.warn(`[CustomAdapter] LinkedIn query "${q.kw}" warning:`, err.message);
      }
    }

    return jobs;
  }

  private async fetchWWR(): Promise<NormalizedJob[]> {
    const jobs: NormalizedJob[] = [];
    try {
      const { data: xml } = await axios.get<string>(
        "https://weworkremotely.com/categories/remote-programming-jobs.rss",
        {
          timeout: 15000,
          headers: { Accept: "application/rss+xml,application/xml;q=0.9,*/*;q=0.8" },
        }
      );

      const $ = cheerio.load(xml, { xmlMode: true });
      $("item").each((_, elem) => {
        const title = $(elem).find("title").text().trim();
        const link = $(elem).find("link").text().trim();
        const desc = $(elem).find("description").text().trim();
        const guid = $(elem).find("guid").text().trim();
        const pubDate = $(elem).find("pubDate").text().trim();

        if (title && link) {
          jobs.push({
            externalId: guid ? guid.split("/").pop() || guid : Buffer.from(link).toString("base64").slice(0, 24),
            title,
            location: "Remote",
            isRemote: true,
            description: desc.slice(0, 800),
            url: link,
            postedAt: pubDate ? new Date(pubDate) : new Date(),
          });
        }
      });
    } catch (err) {
      console.error("[CustomAdapter] Failed to fetch WeWorkRemotely jobs:", err);
    }
    return jobs;
  }

  private async fetchCustomHtml(company: {
    id: string;
    slug: string;
    careersUrl: string;
  }): Promise<NormalizedJob[]> {
    const jobs: NormalizedJob[] = [];
    const seenUrls = new Set<string>();

    try {
      const { data: html } = await axios.get<string>(company.careersUrl, {
        timeout: 20000,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });

      const $ = cheerio.load(html);
      const baseUrl = new URL(company.careersUrl);

      // Strategy 1: Check for Schema.org JSON-LD (JobPosting standard)
      $('script[type="application/ld+json"]').each((_, el) => {
        try {
          const raw = $(el).html();
          if (!raw) return;
          const json = JSON.parse(raw);
          const items = Array.isArray(json) ? json : json["@graph"] ? json["@graph"] : [json];

          for (const item of items) {
            if (item["@type"] === "JobPosting") {
              const jobUrl = item.url || company.careersUrl;
              if (seenUrls.has(jobUrl)) continue;
              seenUrls.add(jobUrl);

              const loc =
                typeof item.jobLocation === "string"
                  ? item.jobLocation
                  : item.jobLocation?.address?.addressLocality ||
                    item.jobLocation?.address?.addressRegion ||
                    "";

              jobs.push({
                externalId: item.identifier?.value || String(Buffer.from(jobUrl).toString("base64").slice(0, 32)),
                title: item.title || "Job Opening",
                location: loc,
                isRemote: /remote/i.test(item.description || "") || /telecommute/i.test(item.jobLocationType || ""),
                department: item.occupationalCategory,
                description: item.description || "",
                url: jobUrl,
                postedAt: item.datePosted ? new Date(item.datePosted) : undefined,
              });
            }
          }
        } catch {
          // ignore invalid JSON-LD
        }
      });

      if (jobs.length > 0) return jobs;

      // Strategy 2: Look for Job Listing links
      const jobLinkSelectors = [
        'a[href*="/job/"]',
        'a[href*="/jobs/"]',
        'a[href*="/careers/"]',
        'a[href*="/position/"]',
        'a[href*="/positions/"]',
        'a[href*="/roles/"]',
        'a[href*="/openings/"]',
        '.job-title a',
        '.job-item a',
        '.career-item a',
      ];

      $(jobLinkSelectors.join(", ")).each((_, el) => {
        const title = $(el).text().trim();
        const href = $(el).attr("href");
        if (!href || !title || title.length < 3 || title.length > 120) return;

        // Skip non-job links
        if (/search|all jobs|view all|back|privacy|login|sign in|apply now/i.test(title)) return;

        let fullUrl = href;
        try {
          fullUrl = new URL(href, baseUrl).toString();
        } catch {
          return;
        }

        if (seenUrls.has(fullUrl)) return;
        seenUrls.add(fullUrl);

        const parentText = $(el).closest("li, tr, div").text();
        const isRemote = /remote/i.test(parentText) || /remote/i.test(title);

        jobs.push({
          externalId: Buffer.from(fullUrl).toString("base64").slice(0, 24),
          title,
          location: isRemote ? "Remote" : "",
          isRemote,
          description: parentText.slice(0, 500),
          url: fullUrl,
          postedAt: new Date(),
        });
      });
    } catch (err) {
      console.error(`[CustomAdapter] Failed to fetch custom career page ${company.careersUrl}:`, err);
    }

    return jobs;
  }
}
