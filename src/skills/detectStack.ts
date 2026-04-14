import { Lead } from "../types";

export async function detectStack(lead: Lead): Promise<Lead> {
  // TODO: Stage 2 — fetch lead.website and detect platform (Shopify, Wix, WordPress, etc.)
  return { ...lead, platform: "unknown" };
}
