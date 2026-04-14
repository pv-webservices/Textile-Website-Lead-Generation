import * as fs from "fs";
import * as path from "path";
import { Lead } from "../types";
import { scoreLead } from "./scoreLeads";

const SITES_DIR = path.resolve(__dirname, "../../data/raw_sites");
const SCORED_DIR = path.resolve(__dirname, "../../data/scored_leads");

export async function selectTopLeads(cityId: string, target: number): Promise<Lead[]> {
  const sitesPath = path.join(SITES_DIR, `${cityId}.json`);
  if (!fs.existsSync(sitesPath)) {
    throw new Error(`Platform-enriched leads file not found: ${sitesPath}`);
  }

  const leads: Lead[] = JSON.parse(fs.readFileSync(sitesPath, "utf-8"));

  // Score every lead
  const scored = leads.map((lead) => ({ ...lead, score: scoreLead(lead) }));

  // Sort descending; stable sort (Node ≥ 11 guarantees stability)
  scored.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  // Write full scored list for inspection / debugging
  fs.mkdirSync(SCORED_DIR, { recursive: true });
  const scoredPath = path.join(SCORED_DIR, `${cityId}.json`);
  fs.writeFileSync(scoredPath, JSON.stringify(scored, null, 2), "utf-8");
  console.log(`  [select] Full scored list → ${scoredPath}`);

  // Return top target*2 (for LLM audit in next stage)
  const top = scored.filter((l) => (l.score ?? 0) > -99).slice(0, target * 2);
  console.log(
    `  [select] Returning top ${top.length} leads (target=${target}, pool=target×2)`
  );

  return top;
}
