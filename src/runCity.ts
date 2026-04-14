import "dotenv/config";
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
    console.error("APIFY_TOKEN is not set. Create a .env file with APIFY_TOKEN=<your-token>.");
    process.exit(1);
  }

  const { city, target } = parseArgs();
  console.log(`\nStarting pipeline for city="${city}", target=${target}\n`);

  console.log("== Stage 1: Shopify leads (India) ==");
  const shopifyLeads = await (
    shopifyCacheExists()
      ? Promise.resolve(loadShopifyLeadsFromCache()).then((leads) => {
          console.log(`  [Shopify] Cache hit -> ${leads.length} stores loaded from disk`);
          return leads;
        })
      : fetchShopifyLeads()
  );
  console.log(`  Shopify -> ${shopifyLeads.length} leads (India-wide, unfiltered)`);

  console.log(`\n== Stage 2: Google Maps leads (${city}) ==`);
  const mapsLeads = await fetchGoogleMapsLeads(city);
  console.log(`  Maps -> ${mapsLeads.length} leads with website`);

  console.log(`\n== Stage 3: JustDial leads (${city}) ==`);
  const allJustdialLeads = await fetchJustdialLeads(city);
  const justdialLeads = allJustdialLeads.filter(
    (lead) => lead.website && lead.website.trim() !== ""
  );
  console.log(
    `  JustDial -> ${justdialLeads.length}/${allJustdialLeads.length} leads with website`
  );

  console.log("\n== Stage 4: Normalize & merge (India + fabric + website only) ==");
  const uniqueLeads = await normalizeCityLeads(city);
  console.log(`  Unique India fabric leads with website -> ${uniqueLeads.length}`);

  console.log("\n== Stage 5: Detect platform ==");
  const enrichedLeads = await detectStacks(city);
  console.log(`  Enriched leads -> ${enrichedLeads.length}`);

  console.log("\n== Stage 6: Score & select top leads ==");
  const topLeads = await selectTopLeads(city, target);

  console.log(`\nTop 5 leads for "${city}":`);
  topLeads.slice(0, 5).forEach((lead, index) => {
    console.log(
      `  ${index + 1}. ${lead.name || "(no name)"} -> score: ${lead.score ?? 0} -> ${lead.website || "no website"}`
    );
  });

  console.log("\n== Stage 7: Summaries & LLM audit (optional) ==");
  if (!topLeads.length) {
    console.log(`No top leads to audit for "${city}", skipping LLM audit.`);
    return;
  }

  await summarizeSites(city);
  const audits = await auditLeads(city);

  console.log(`\nTop 5 audit results for "${city}":`);
  audits.slice(0, 5).forEach((audit, index) => {
    console.log(`  ${index + 1}. [${audit.fit_score}/10] ${audit.id}`);
    console.log(`     Issue: ${audit.main_issue}`);
  });

  console.log(`\nDone. ${audits.length} leads audited.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
