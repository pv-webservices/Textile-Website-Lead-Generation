import * as fs from "fs";
import * as path from "path";
import { ApifyClient } from "apify-client";
import { CITY_CONFIGS } from "../../config/cities";
import { Lead } from "../types";

const ACTOR_ID = "natanielsantos/indiamart-scraper";
const RAW_DIR = path.resolve(__dirname, "../../data/raw_sources");

// IndiaMART search URL format
function buildSearchUrl(query: string): string {
  return `https://dir.indiamart.com/search.mp?ss=${encodeURIComponent(query)}`;
}

// Shape of companyDetails inside each item
interface IndiamartCompany {
  name?: string;
  websiteUrl?: string;
  phoneNumber?: string;
  address?: string;
  score?: number;
}

// Shape of a single item returned by natanielsantos/indiamart-scraper
interface IndiamartItem {
  title?: string;
  url?: string;
  companyDetails?: IndiamartCompany;
}

function getClient(): ApifyClient {
  const token = process.env.APIFY_TOKEN;
  if (!token) {
    throw new Error("APIFY_TOKEN environment variable is not set");
  }
  return new ApifyClient({ token });
}

function mapToLead(item: IndiamartItem, cityId: string, query: string): Lead {
  const co = item.companyDetails ?? {};
  return {
    id: item.url ?? `indiamart-${cityId}-${Math.random().toString(36).slice(2)}`,
    name: co.name ?? item.title ?? "",
    address: co.address ?? "",
    city: cityId,
    state: "",
    country: "India",
    website: co.websiteUrl ?? "",
    source: "indiamart",
    category: query,
    phones: co.phoneNumber ? [co.phoneNumber] : [],
    emails: [],
  };
}

export async function fetchIndiamartLeads(cityId: string): Promise<Lead[]> {
  const config = CITY_CONFIGS[cityId];
  if (!config) {
    throw new Error(`No city config found for "${cityId}"`);
  }

  const client = getClient();
  const allRaw: IndiamartItem[] = [];
  const allLeads: Lead[] = [];

  for (const query of config.queries.indiamart) {
    const searchUrl = buildSearchUrl(query);
    console.log(`  [IndiaMART] Running: "${query}" → ${searchUrl}`);

    const run = await client.actor(ACTOR_ID).call({
      startUrls: [{ url: searchUrl }],
      proxySettings: { useApifyProxy: true },
    });

    const { items } = await client
      .dataset(run.defaultDatasetId)
      .listItems();

    const typed = items as IndiamartItem[];
    allRaw.push(...typed);

    for (const item of typed) {
      allLeads.push(mapToLead(item, cityId, query));
    }

    console.log(`  [IndiaMART] "${query}" → ${typed.length} items`);
  }

  // Write raw output
  fs.mkdirSync(RAW_DIR, { recursive: true });
  const rawPath = path.join(RAW_DIR, `${cityId}-indiamart.json`);
  fs.writeFileSync(rawPath, JSON.stringify(allRaw, null, 2), "utf-8");
  console.log(`  [IndiaMART] Raw saved → ${rawPath}`);

  return allLeads;
}
