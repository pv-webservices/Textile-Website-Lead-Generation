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

// ---------------------------------------------------------------------------
// Scoring keyword lists
// ---------------------------------------------------------------------------

/** Any of these in name/category signals a genuine fabric lead. */
export const FABRIC_KEYWORDS: string[] = [
  "fabric",
  "textile",
  "cloth",
  "upholstery",
  "curtain",
  "drape",
  "furnishing",
  "rexine",
  "velvet",
  "jacquard",
  "brocade",
  "chenille",
  "sofa material",
  "sofa cloth",
];

/** Leads matching any of these are irrelevant — hard-drop them. */
export const EXCLUDE_KEYWORDS: string[] = [
  "restaurant",
  "hotel",
  "food",
  "catering",
  "hospital",
  "clinic",
  "pharmacy",
  "software",
  "it services",
  "digital marketing",
  "real estate",
  "education",
  "school",
  "college",
  "travel",
  "tour",
  "insurance",
  "loan",
  "finance",
  "jewellery",
  "jewelry",
  "clothing boutique",
  "fashion boutique",
  "readymade",
  "garment",
  "tailor",
];

/** Presence of these terms indicates a B2B wholesale / trade buyer — good signal. */
export const WHOLESALE_KEYWORDS: string[] = [
  "wholesale",
  "wholesaler",
  "distributor",
  "manufacturer",
  "supplier",
  "trader",
  "exporter",
  "importer",
  "bulk",
  "b2b",
  "dealer",
];
