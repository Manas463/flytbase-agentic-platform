// Ported from "Build Writer Prompt" in the existing n8n pipeline. These four
// case studies were fetched and read for real (not assumed) during interview
// prep: Anglo American (Quellaveco, Peru - topographic survey drone mapping,
// not tailings monitoring, that was my own wrong first guess, corrected after
// actually reading the published case study), SQM (the anchor account itself),
// CSX (rail yard inspection), Shell (flare stack / asset inspection). Each
// proof line cites a real, specific mechanism so pickProof can match a
// prospect's own research signal to the closest real precedent, not just the
// closest commodity.
export interface ProofPoint {
  name: string;
  line: string;
  keywords: string[];
}

export const PROOF_LIBRARY: Record<"anglo_american" | "sqm" | "csx" | "shell", ProofPoint> = {
  anglo_american: {
    name: "Anglo American",
    line:
      "At Anglo American's Quellaveco copper mine in Peru, drone-based topographic surveying replaced manual survey crews walking active pit faces, cutting survey time from days to hours while keeping people off unstable terrain.",
    keywords: ["topograph", "survey", "pit wall", "open pit", "terrain", "quellaveco", "copper", "peru", "volumetric", "stockpile"],
  },
  sqm: {
    name: "SQM",
    line:
      "SQM itself already runs autonomous drone-in-a-box inspection across its Chilean lithium and iodine operations for perimeter, stockpile, and tailings-adjacent monitoring without adding headcount in hazardous zones.",
    keywords: ["lithium", "brine", "evaporation pond", "tailings", "chile", "atacama", "iodine", "perimeter"],
  },
  csx: {
    name: "CSX",
    line:
      "CSX deployed automated drone inspection across its rail yards to catch defects on rolling stock and infrastructure earlier than manual walking inspections, without pulling crews off other work.",
    keywords: ["rail", "rolling stock", "yard", "conveyor", "logistics", "transport", "infrastructure inspection"],
  },
  shell: {
    name: "Shell",
    line:
      "Shell uses autonomous drones for flare stack and elevated asset inspection, removing the need to shut down operations or send technicians up scaffolding for routine checks.",
    keywords: ["flare", "stack", "elevated", "asset integrity", "shutdown", "scaffolding", "refinery", "hazardous area", "confined space"],
  },
};

/** Matches a prospect's own research signal (their equipment, terrain, or
 * incident language) to the closest real case study BY MECHANISM, not by
 * guessing from commodity alone. Falls back to the SQM anchor, since every
 * account was already benchmarked against SQM and it is always defensible. */
export function pickProof(researchText: string): ProofPoint {
  const hay = researchText.toLowerCase();
  let best: { key: keyof typeof PROOF_LIBRARY; hits: number } = { key: "sqm", hits: -1 };
  for (const key of Object.keys(PROOF_LIBRARY) as (keyof typeof PROOF_LIBRARY)[]) {
    const hits = PROOF_LIBRARY[key].keywords.filter((k) => hay.includes(k)).length;
    if (hits > best.hits) best = { key, hits };
  }
  return PROOF_LIBRARY[best.hits > 0 ? best.key : "sqm"];
}
