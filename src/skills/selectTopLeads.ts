import { Lead } from "../types";

export function selectTopLeads(leads: Lead[], target: number): Lead[] {
  // TODO: Stage 3 — sort by score desc, pick top `target` leads
  return leads.slice(0, target);
}
