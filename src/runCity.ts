import 'dotenv/config';
import * as fs from "fs";
import * as path from "path";
import { CITIES } from "../config/cities";
import {
  fetchShopifyLeads,
  shopifyCacheExists,
  loadShopifyLeadsFromCache,
} from "./skills/apifyShopifyLeads";
import { fetchGoogleMapsLeads } from "./skills/apifyGoogleMapsLeads";
import { fetchJustdialLeads } from "./skills/apifyJustdialLeads";
import { normalizeCityLeads } from "./skills/normalizeLeads";
import { detectStacks } from "./skills/detectStack";
import { selectTopLeads } from "./skills/selectTopLeads";
import { summarizeSites } from "./skills/summarizeSites";
import { auditLeads } from "./skills/auditLeads";
import { Lead } from "./types";

const SITES_DIR = path.resolve(__dirname, "../data/raw_sites");

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

/**
 * Stage 6: Load platform-enriched leads and keep only confirmed Shopify stores.
 * Reads  data/raw_sites/<cityId>.json  (written by detectStacks)
 * Writes data/raw_sites/<cityId>-shopify-only.json
 */
async function filterToShopifyOnly(cityId: string): Promise<Lead[]> {
  const inPath  = path.join(SITES_DIR, `${cityId}.json`);
  const outPath = path.join(SITES_DIR, `${cityId}-shopify-only.json`);

  if (!fs.existsSync(inPath)) {
    throw new Error(`Platform-enriched leads file not found: ${inPath}`);
  }

  const leads: Lead[] = JSON.parse(fs.readFileSync(inPath, "utf-8"));
  const shopify = leads.filter((l) => l.platform === "shopify");

  fs.writeFileSync(outPath, JSON.stringify(shopify, null, 2), "utf-8");
  console.log(
    `  [filter] ${shopify.length}/${leads.length} confirmed Shopify leads → ${outPath}`
  );

  return shopify;
}

async function main() {
  if (!process.env.APIFY_TOKEN) {
    console.error('APIFY_TOKEN is not set. Create a .env file with APIFY_TOKEN=<your-token>.');
    process.exit(1);
  }

  const { city, target } = parseArgs();
  console.log(`\nStarting pipeline for city="${city}", target=${target}\n`);

  // ── Stage 1: Shopify leads (India) ────────────────────────────────────────
  console.log("── Stage 1: Shopify leads (India) ──");
  // India-wide dataset — fetch once and cache; reuse on subsequent runs
  const shopifyLeads = await (
    shopifyCacheExists()
      ? Promise.resolve(loadShopifyLeadsFromCache()).then((leads) => {
          console.log(`  [Shopify] Cache hit → ${leads.length} stores loaded from disk`);
          return leads;
        })
      : fetchShopifyLeads()
  );
  console.log(`  Shopify → ${shopifyLeads.length} leads (India-wide, unfiltered)`);

  // ── Stage 2: Google Maps leads (<city>) ───────────────────────────────────
  console.log(`\n── Stage 2: Google Maps leads (${city}) ──`);
  const mapsLeads = await fetchGoogleMapsLeads(city);
  console.log(`  Maps → ${mapsLeads.length} leads with website`);

  // ── Stage 3: JustDial leads (<city>) ──────────────────────────────────────
  console.log(`\n── Stage 3: JustDial leads (${city}) ──`);
  const allJustdialLeads = await fetchJustdialLeads(city);
  // Keep only entries that have a website (required for platform detection later)
  const justdialLeads = allJustdialLeads.filter(
    (l) => l.website && l.website.trim() !== ""
  );
  console.log(
    `  JustDial → ${justdialLeads.length}/${allJustdialLeads.length} leads with website`
  );

  // ── Stage 4: Normalize & merge (website + fabric only) ────────────────────
  console.log("\n── Stage 4: Normalize & merge (website + fabric only) ──");
  // normalizeCityLeads reads the raw JSON files written by stages 1-3,
  // applies India / website / fabric filters, deduplicates, and writes
  // data/raw_sites/<cityId>.json
  const uniqueLeads = await normalizeCityLeads(city);
  console.log(`  Unique India fabric leads with website → ${uniqueLeads.length}`);

  // ── Stage 5: Detect platform ──────────────────────────────────────────────
  console.log("\n── Stage 5: Detect platform ──");
  // Sends HTTP requests, detects Shopify/Wix/WordPress/other, enriches in place
  const enrichedLeads = await detectStacks(city);
  console.log(`  Enriched leads → ${enrichedLeads.length}`);

  // ── Stage 6: Filter to Shopify only ───────────────────────────────────────
  console.log("\n── Stage 6: Filter to Shopify only ──");
  const shopifyOnly = await filterToShopifyOnly(city);
  console.log(`  Shopify-confirmed leads: ${shopifyOnly.length}`);

  // ── Stage 7: Score & select top leads ────────────────────────────────────
  console.log("\n── Stage 7: Score & select top leads ──");
  const topLeads = await selectTopLeads(city, target);

  // Preview top 5
  console.log(`\nTop 5 leads for "${city}":`);
  topLeads.slice(0, 5).forEach((lead, i) => {
    console.log(
      `  ${i + 1}. ${lead.name || "(no name)"} — score: ${lead.score ?? 0} — ${lead.website || "no website"}`
    );
  });

  // ── Stage 8: Summaries & LLM audit (optional) ─────────────────────────────
  console.log("\n── Stage 8: Summaries & LLM audit (optional) ──");
  // All leads reaching this stage are India-based, fabric/furnishing niche,
  // have a website, and are confirmed Shopify.
  await summarizeSites(city);
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
