import { Lead } from "../types";

export function scoreLeads(leads: Lead[]): Lead[] {
  // TODO: Stage 3 — score each lead based on platform, contact completeness, category match, etc.
  return leads.map((lead) => ({ ...lead, score: 0 }));
}
