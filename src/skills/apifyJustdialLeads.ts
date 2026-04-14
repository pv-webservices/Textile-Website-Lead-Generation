import * as fs from "fs";
import * as path from "path";
import { ApifyClient } from "apify-client";
import { CITY_CONFIGS } from "../../config/cities";
import { Lead } from "../types";

const ACTOR_ID = "thirdwatch/justdial-business-scraper";
const MAX_RESULTS_PER_QUERY = 25;
const RAW_DIR = path.resolve(__dirname, "../../data/raw_sources");

// Shape of a single item returned by thirdwatch/justdial-business-scraper
interface JustdialItem {
  business_name?: string;
  category?: string;
  location?: string;
  address?: string;
  phone?: string;
  website?: string;
  listing_url?: string;
  rating?: number;
  review_count?: number;
}

function getClient(): ApifyClient {
  const token = process.env.APIFY_TOKEN;
  if (!token) {
    throw new Error('APIFY_TOKEN is missing. Please create a .env file with APIFY_TOKEN=<your-token>.');
  }
  return new ApifyClient({ token });
}

function mapToLead(item: JustdialItem, cityId: string, query: string): Lead {
  return {
    id: item.listing_url ?? `justdial-${cityId}-${Math.random().toString(36).slice(2)}`,
    name: item.business_name ?? "",
    address: item.address ?? item.location ?? "",
    city: cityId,
    state: "",
    country: "India",
    website: item.website ?? "",
    source: "justdial",
    category: query,
    phones: item.phone ? [item.phone] : [],
    emails: [],
  };
}

export async function fetchJustdialLeads(cityId: string): Promise<Lead[]> {
  const config = CITY_CONFIGS[cityId];
  if (!config) {
    throw new Error(`No city config found for "${cityId}"`);
  }

  const client = getClient();
  const allRaw: JustdialItem[] = [];
  const allLeads: Lead[] = [];

  for (const query of config.queries.justdial) {
    console.log(`  [JustDial] Running: "${query}" in ${config.displayName}`);

    const run = await client.actor(ACTOR_ID).call({
      queries: [query],
      city: config.displayName,
      maxResultsPerQuery: MAX_RESULTS_PER_QUERY,
    });

    const { items } = await client
      .dataset(run.defaultDatasetId)
      .listItems();

    const typed = items as JustdialItem[];
    allRaw.push(...typed);

    for (const item of typed) {
      allLeads.push(mapToLead(item, cityId, query));
    }

    console.log(`  [JustDial] "${query}" → ${typed.length} items`);
  }

  // Write raw output
  fs.mkdirSync(RAW_DIR, { recursive: true });
  const rawPath = path.join(RAW_DIR, `${cityId}-justdial.json`);
  fs.writeFileSync(rawPath, JSON.stringify(allRaw, null, 2), "utf-8");
  console.log(`  [JustDial] Raw saved → ${rawPath}`);

  return allLeads;
}
