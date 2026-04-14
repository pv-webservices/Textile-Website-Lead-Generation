export const FABRIC_CATEGORIES = [
  "sofa fabric",
  "curtain fabric",
  "upholstery fabric",
  "furnishing fabric",
] as const;

export type FabricCategory = (typeof FABRIC_CATEGORIES)[number];

export const SEARCH_KEYWORDS: Record<FabricCategory, string[]> = {
  "sofa fabric": [
    "sofa fabric",
    "sofa upholstery fabric",
    "couch fabric",
    "sofa cloth",
    "rexine fabric",
  ],
  "curtain fabric": [
    "curtain fabric",
    "drape fabric",
    "window fabric",
    "curtain cloth",
    "blackout fabric",
  ],
  "upholstery fabric": [
    "upholstery fabric",
    "chair fabric",
    "foam fabric",
    "velvet upholstery",
    "upholstery material",
  ],
  "furnishing fabric": [
    "furnishing fabric",
    "home furnishing fabric",
    "interior fabric",
    "decorative fabric",
    "cushion fabric",
  ],
};
