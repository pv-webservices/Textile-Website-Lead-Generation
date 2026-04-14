import { CITIES } from "../config/cities";
import { fetchJustdialLeads } from "./skills/apifyJustdialLeads";
import { fetchIndiamartLeads } from "./skills/apifyIndiamartLeads";
import {
  fetchShopifyLeads,
  shopifyCacheExists,
  loadShopifyLeadsFromCache,
} from "./skills/apifyShopifyLeads";
import { normalizeCityLeads } from "./skills/normalizeLeads";

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
  const { city, target } = parseArgs();
  console.log(`\nStarting lead fetch for city="${city}", target=${target}\n`);

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

  console.log(`\nResults:`);
  console.log(`  JustDial  → ${justdialLeads.length} leads`);
  console.log(`  IndiaMART → ${indiamartLeads.length} leads`);
  console.log(`  Shopify   → ${shopifyLeads.length} leads (India-wide, unfiltered)`);
  console.log(`  Total     → ${justdialLeads.length + indiamartLeads.length + shopifyLeads.length} leads`);

  const uniqueLeads = await normalizeCityLeads(city);
  console.log(`\n  Normalized → ${uniqueLeads.length} unique Indian leads`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
