import 'dotenv/config';
import { CITIES } from "../config/cities";
import { fetchJustdialLeads } from "./skills/apifyJustdialLeads";
import { fetchIndiamartLeads } from "./skills/apifyIndiamartLeads";
import {
  fetchShopifyLeads,
  shopifyCacheExists,
  loadShopifyLeadsFromCache,
} from "./skills/apifyShopifyLeads";
import { normalizeCityLeads } from "./skills/normalizeLeads";
import { detectStacks } from "./skills/detectStack";
import { selectTopLeads } from "./skills/selectTopLeads";
import { summarizeSites } from "./skills/summarizeSites";
import { auditLeads } from "./skills/auditLeads";

function parseArgs(): { city: string; target: number } {
  const args = process.argv.slice(2);
  let city = "";
  let target = 40;

  for (const arg of args) {
    if (arg.startsWith("--city=")) {
      city = arg.split("=")[1].toLowerCase();
    } else if (arg.startsWith("--target=")) {
      target = parseInt(arg.split("=")[1], 10);
    }
  }

  if (!city) {
    console.error("Error: --city argument is required");
    process.exit(1);
  }

  if (!CITIES.includes(city)) {
    console.warn(`Warning: "${city}" is not in the known cities list. Proceeding anyway.`);
  }

  return { city, target };
}

async function main() {
  if (!process.env.APIFY_TOKEN) {
    console.error('APIFY_TOKEN is not set. Create a .env file with APIFY_TOKEN=<your-token>.');
    process.exit(1);
  }

  const { city, target } = parseArgs();
  console.log(`\nStarting pipeline for city="${city}", target=${target}\n`);

  // ── Stage 1: Fetch raw data from Apify ────────────────────────────────────
  console.log("── Stage 1: Fetching raw leads ──");

  // Shopify results are India-wide — fetch once and cache, reuse on subsequent runs
  const shopifyPromise = shopifyCacheExists()
    ? Promise.resolve(loadShopifyLeadsFromCache()).then((leads) => {
        console.log(`  [Shopify] Cache hit → ${leads.length} stores loaded from disk`);
        return leads;
      })
    : fetchShopifyLeads();

  const [justdialLeads, indiamartLeads, shopifyLeads] = await Promise.all([
    fetchJustdialLeads(city),
    fetchIndiamartLeads(city),
    shopifyPromise,
  ]);

  console.log(`\n  JustDial  → ${justdialLeads.length} leads`);
  console.log(`  IndiaMART → ${indiamartLeads.length} leads`);
  console.log(`  Shopify   → ${shopifyLeads.length} leads (India-wide, unfiltered)`);

  // ── Stage 2: Normalize + deduplicate ──────────────────────────────────────
  console.log("\n── Stage 2: Normalizing ──");
  const uniqueLeads = await normalizeCityLeads(city);
  console.log(`  Unique Indian leads → ${uniqueLeads.length}`);

  // ── Stage 3: Platform detection ───────────────────────────────────────────
  console.log("\n── Stage 3: Detecting stacks ──");
  const enrichedLeads = await detectStacks(city);
  console.log(`  Enriched leads → ${enrichedLeads.length}`);

  // ── Stage 4: Score + select ───────────────────────────────────────────────
  console.log("\n── Stage 4: Scoring + selecting ──");
  const topLeads = await selectTopLeads(city, target);

  // Preview top 5
  console.log(`\nTop 5 leads for "${city}":`);
  topLeads.slice(0, 5).forEach((lead, i) => {
    console.log(`  ${i + 1}. ${lead.name || "(no name)"} — score: ${lead.score ?? 0} — ${lead.website || "no website"}`);
  });

  // ── Stage 5: Summarise sites (fetch HTML metadata) ────────────────────────
  console.log("\n── Stage 5: Summarising sites ──");
  await summarizeSites(city);

  // ── Stage 6: LLM audit ────────────────────────────────────────────────────
  console.log("\n── Stage 6: LLM audit ──");
  const audits = await auditLeads(city);

  console.log(`\nTop 5 audit results for "${city}":`);
  audits.slice(0, 5).forEach((a, i) => {
    console.log(`  ${i + 1}. [${a.fit_score}/10] ${a.id}`);
    console.log(`     Issue: ${a.main_issue}`);
  });

  console.log(`\nDone. ${audits.length} leads audited.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
