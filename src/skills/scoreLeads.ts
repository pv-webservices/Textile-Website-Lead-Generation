import { Lead } from "../types";
import {
  FABRIC_KEYWORDS,
  EXCLUDE_KEYWORDS,
  WHOLESALE_KEYWORDS,
} from "../../config/keywords";

const DELHI_TERMS = ["delhi", "new delhi", "noida", "gurugram", "ghaziabad", "faridabad"];
const SURAT_TERMS = ["surat", "gujarat"];

function haystack(lead: Lead): string {
  return [lead.name, lead.category, lead.address, lead.city]
    .join(" ")
    .toLowerCase();
}

function containsAny(text: string, terms: string[]): boolean {
  return terms.some((t) => text.includes(t.toLowerCase()));
}

export function scoreLead(lead: Lead): number {
  const text = haystack(lead);

  // --- Hard drop ---
  if (lead.country && lead.country !== "India") return -99;
  if (containsAny(text, EXCLUDE_KEYWORDS)) return -99;

  let score = 0;

  // --- Penalty ---
  if (!containsAny(text, FABRIC_KEYWORDS)) score -= 20;

  // --- City bonus ---
  if (containsAny(text, DELHI_TERMS)) score += 3;
  if (containsAny(text, SURAT_TERMS)) score += 3;

  // --- Fabric relevance ---
  const nameAndCategory = [lead.name, lead.category].join(" ").toLowerCase();
  if (containsAny(nameAndCategory, FABRIC_KEYWORDS)) score += 4;

  // --- Wholesale signal ---
  if (containsAny(text, WHOLESALE_KEYWORDS)) score += 3;

  // --- Source priority bonus ---
  if (lead.source === "shopify") score += 3;
  else if (lead.source === "maps") score += 1;
  // justdial: +0

  // --- Platform bonus ---
  if (lead.platform === "shopify") score += 5;
  else if (lead.platform === "wix") score += 3;
  else if (lead.platform === "wordpress") score += 2;
  else if (lead.platform === "other") score += 1;

  return score;
}
