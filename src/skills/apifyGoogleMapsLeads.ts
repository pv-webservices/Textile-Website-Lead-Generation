import * as fs from "fs";
import * as path from "path";
import { ApifyClient } from "apify-client";
import { CITY_CONFIGS } from "../../config/cities";
import { Lead } from "../types";

const ACTOR_ID = "compass/crawler-google-places";
const MAX_CRAWLED_PLACES = 20;
const RAW_DIR = path.resolve(__dirname, "../../data/raw_sources");

// Shape of a single item returned by apify/google-maps-scraper
interface GoogleMapsItem {
  title?: string;
  website?: string;
  address?: string;
  phone?: string;
  url?: string;
  categoryName?: string;
  city?: string;
  state?: string;
  country?: string;
}

function getClient(): ApifyClient {
  const token = process.env.APIFY_TOKEN;
  if (!token) {
    throw new Error('APIFY_TOKEN is missing. Please create a .env file with APIFY_TOKEN=<your-token>.');
  }
  return new ApifyClient({ token });
}

function mapToLead(item: GoogleMapsItem, cityId: string, query: string): Lead {
  return {
    id: item.url ?? `maps-${cityId}-${Math.random().toString(36).slice(2)}`,
    name: item.title ?? "",
    address: item.address ?? "",
    city: cityId,
    state: item.state ?? "",
    country: "India",
    website: item.website ?? "",
    source: "maps",
    category: item.categoryName ?? query,
    phones: item.phone ? [item.phone] : [],
    emails: [],
  };
}

export async function fetchGoogleMapsLeads(cityId: string): Promise<Lead[]> {
  const config = CITY_CONFIGS[cityId];
  if (!config) {
    throw new Error(`No city config found for "${cityId}"`);
  }

  const client = getClient();
  const allRaw: GoogleMapsItem[] = [];
  const allLeads: Lead[] = [];

  for (const query of config.queries.maps) {
    console.log(`  [GoogleMaps] Running: "${query}"`);

    const run = await client.actor(ACTOR_ID).call({
      searchStringsArray: [query],
      maxCrawledPlacesPerSearch: MAX_CRAWLED_PLACES,
      language: "en",
    });

    const { items } = await client
      .dataset(run.defaultDatasetId)
      .listItems();

    const typed = items as GoogleMapsItem[];
    allRaw.push(...typed);

    // Only keep items that have a website URL
    const withWebsite = typed.filter(
      (item) => item.website && item.website.trim() !== ""
    );

    for (const item of withWebsite) {
      allLeads.push(mapToLead(item, cityId, query));
    }

    console.log(
      `  [GoogleMaps] "${query}" → ${typed.length} items, ${withWebsite.length} with website`
    );
  }

  // Write raw output (all items, before website filter, for debugging)
  fs.mkdirSync(RAW_DIR, { recursive: true });
  const rawPath = path.join(RAW_DIR, `${cityId}-maps.json`);
  fs.writeFileSync(rawPath, JSON.stringify(allRaw, null, 2), "utf-8");
  console.log(`  [GoogleMaps] Raw saved → ${rawPath}`);
  console.log(`  [GoogleMaps] ${allLeads.length} leads with website`);

  return allLeads;
}
