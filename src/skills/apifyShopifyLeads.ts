import * as fs from "fs";
import * as path from "path";
import { ApifyClient } from "apify-client";
import { Lead } from "../types";

const ACTOR_ID = "edXdRmr7G4YBLeRp3";
const RAW_FILE = path.resolve(__dirname, "../../data/raw_sources/shopify-fabric-in.json");

const KEYWORDS = ["fabric", "upholstery fabric", "curtain fabric"];

// Shape of a single item returned by botflowtech/shopify-store-leads-finder
interface ShopifyItem {
  url?: string;
  domain?: string;
  storeName?: string;
  storeNiche?: string;
  contactEmail?: string;
  phoneNumber?: string;
  physicalAddress?: string;
  shopifyTheme?: string;
  keyword?: string;
  isShopify?: boolean;
}

function getClient(): ApifyClient {
  const token = process.env.APIFY_TOKEN;
  if (!token) {
    throw new Error('APIFY_TOKEN is missing. Please create a .env file with APIFY_TOKEN=<your-token>.');
  }
  return new ApifyClient({ token });
}

function mapToLead(item: ShopifyItem): Lead {
  return {
    id: item.domain ?? item.url ?? `shopify-${Math.random().toString(36).slice(2)}`,
    name: item.storeName ?? "",
    address: item.physicalAddress ?? "",
    city: "",
    state: "",
    country: "India",
    website: item.url ?? (item.domain ? `https://${item.domain}` : ""),
    source: "shopify",
    category: item.storeNiche ?? item.keyword ?? "fabric",
    phones: item.phoneNumber ? [item.phoneNumber] : [],
    emails: item.contactEmail ? [item.contactEmail] : [],
    platform: "shopify",
  };
}

export async function fetchShopifyLeads(): Promise<Lead[]> {
  const client = getClient();

  console.log(`  [Shopify] Running actor with keywords: ${KEYWORDS.join(", ")}`);

  const run = await client.actor(ACTOR_ID).call({
    keywords: KEYWORDS,
    country: "IN",
    includeContactEnrichment: true,
  });

  const { items } = await client.dataset(run.defaultDatasetId).listItems();
  const typed = items as ShopifyItem[];

  // Write raw output
  fs.mkdirSync(path.dirname(RAW_FILE), { recursive: true });
  fs.writeFileSync(RAW_FILE, JSON.stringify(typed, null, 2), "utf-8");
  console.log(`  [Shopify] Raw saved → ${RAW_FILE}`);
  console.log(`  [Shopify] ${typed.length} stores found`);

  return typed.map(mapToLead);
}

/** Returns true if the cached raw file already exists on disk. */
export function shopifyCacheExists(): boolean {
  return fs.existsSync(RAW_FILE);
}

/** Load leads from the cached raw file without hitting Apify. */
export function loadShopifyLeadsFromCache(): Lead[] {
  const raw = JSON.parse(fs.readFileSync(RAW_FILE, "utf-8")) as ShopifyItem[];
  return raw.map(mapToLead);
}
