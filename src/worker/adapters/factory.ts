import { AtsType } from "@/generated/client";
import { JobBoardAdapter } from "./types";
import { GreenhouseAdapter } from "./greenhouse";
import { LeverAdapter } from "./lever";
import { AshbyAdapter } from "./ashby";
import { WorkableAdapter } from "./workable";
import { SmartRecruitersAdapter } from "./smartrecruiters";
import { CustomAdapter } from "./custom";

const adapters = new Map<AtsType, JobBoardAdapter>();
adapters.set(AtsType.GREENHOUSE, new GreenhouseAdapter());
adapters.set(AtsType.LEVER, new LeverAdapter());
adapters.set(AtsType.ASHBY, new AshbyAdapter());
adapters.set(AtsType.WORKABLE, new WorkableAdapter());
adapters.set(AtsType.SMARTRECRUITERS, new SmartRecruitersAdapter());
adapters.set(AtsType.CUSTOM, new CustomAdapter());

// ─── Get adapter by ATS type ───────────────────────────────────────────────────
export function getAdapter(atsType: AtsType): JobBoardAdapter | null {
  return adapters.get(atsType) ?? null;
}

// ─── Auto-detect adapter from careers URL ─────────────────────────────────────
export function detectAdapter(careersUrl: string): {
  adapter: JobBoardAdapter | null;
  slug: string | null;
  atsType: AtsType;
} {
  for (const [atsType, adapter] of adapters.entries()) {
    const result = adapter.detect(careersUrl);
    if (result.matches) {
      return {
        adapter,
        slug: result.slug ?? null,
        atsType,
      };
    }
  }
  return { adapter: null, slug: null, atsType: AtsType.CUSTOM };
}

export { adapters };
