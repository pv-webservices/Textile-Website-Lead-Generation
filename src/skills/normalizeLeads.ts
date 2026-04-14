import * as fs from "fs";
import * as path from "path";
import { Lead } from "../types";

const RAW_DIR = path.resolve(__dirname, "../../data/raw_sources");
const SITES_DIR = path.resolve(__dirname, "../../data/raw_sites");

// ---------------------------------------------------------------------------
// Raw item shapes (mirrors what each Apify skill writes to disk)
// ---------------------------------------------------------------------------

interface JustdialItem {
  business_name?: string;
  category?: string;
  location?: string;
  address?: string;
  phone?: string;
  website?: string;
  listing_url?: string;
}

interface IndiamartCompany {
  name?: string;
  websiteUrl?: string;
  phoneNumber?: string;
  address?: string;
}

interface IndiamartItem {
  title?: string;
  url?: string;
  companyDetails?: IndiamartCompany;
}

interface ShopifyItem {
  url?: string;
  domain?: string;
  storeName?: string;
  storeNiche?: string;
  contactEmail?: string;
  phoneNumber?: string;
  physicalAddress?: string;
  keyword?: string;
}

// ---------------------------------------------------------------------------
// Normalisation helpers
// ---------------------------------------------------------------------------

const PLACEHOLDER_DOMAINS = new Set(["", "n/a", "-", "na", "none", "null"]);

function extractDomain(rawUrl: string): string {
  if (!rawUrl) return "";
  try {
    const url = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function normalizePhone(raw: string): string {
  if (!raw) return "";
  // Strip everything except digits
  const digits = raw.replace(/\D/g, "");
  // Remove leading country code: 91 (India) or 0
  const stripped =
    digits.startsWith("91") && digits.length === 12
      ? digits.slice(2)
      : digits.startsWith("0") && digits.length === 11
      ? digits.slice(1)
      : digits;
  return stripped.length >= 7 ? stripped : "";
}

function isIndia(lead: Lead): boolean {
  if (lead.source === "justdial" || lead.source === "indiamart") return true;
  if (lead.country === "India") return true;
  if (lead.address && lead.address.toLowerCase().includes("india")) return true;
  const domain = extractDomain(lead.website);
  if (domain.endsWith(".in")) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Per-source mappers (read from disk, so we re-derive city/category from item)
// ---------------------------------------------------------------------------

function mapJustdialItem(item: JustdialItem, cityId: string): Lead {
  return {
    id: item.listing_url ?? `justdial-${cityId}-${Math.random().toString(36).slice(2)}`,
    name: item.business_name ?? "",
    address: item.address ?? item.location ?? "",
    city: cityId,
    state: "",
    country: "India",
    website: item.website ?? "",
    source: "justdial",
    category: item.category ?? "fabric",
    phones: item.phone ? [item.phone] : [],
    emails: [],
  };
}

function mapIndiamartItem(item: IndiamartItem, cityId: string): Lead {
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
    category: "fabric",
    phones: co.phoneNumber ? [co.phoneNumber] : [],
    emails: [],
  };
}

function mapShopifyItem(item: ShopifyItem): Lead {
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

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------

function deduplicateLeads(leads: Lead[]): Lead[] {
  const seen = new Set<string>();
  const result: Lead[] = [];

  for (const lead of leads) {
    const domain = extractDomain(lead.website);
    const domainKey = domain && !PLACEHOLDER_DOMAINS.has(domain) ? `d:${domain}` : null;

    const phone = lead.phones[0] ? normalizePhone(lead.phones[0]) : "";
    const phoneKey = phone ? `p:${phone}` : null;

    // If we already have a lead with the same domain or same phone, skip
    if ((domainKey && seen.has(domainKey)) || (phoneKey && seen.has(phoneKey))) {
      continue;
    }

    if (domainKey) seen.add(domainKey);
    if (phoneKey) seen.add(phoneKey);
    result.push(lead);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Safe JSON loader
// ---------------------------------------------------------------------------

function loadJson<T>(filePath: string): T[] {
  if (!fs.existsSync(filePath)) return [];
  try {
    const content = fs.readFileSync(filePath, "utf-8").trim();
    if (!content) return [];
    return JSON.parse(content) as T[];
  } catch {
    console.warn(`  [normalize] Could not parse ${filePath}, skipping.`);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function normalizeCityLeads(cityId: string): Promise<Lead[]> {
  console.log(`\n  [normalize] Processing sources for "${cityId}"...`);

  const justdialRaw = loadJson<JustdialItem>(
    path.join(RAW_DIR, `${cityId}-justdial.json`)
  );
  const indiamartRaw = loadJson<IndiamartItem>(
    path.join(RAW_DIR, `${cityId}-indiamart.json`)
  );
  const shopifyRaw = loadJson<ShopifyItem>(
    path.join(RAW_DIR, "shopify-fabric-in.json")
  );

  console.log(
    `  [normalize] Raw counts — JustDial: ${justdialRaw.length}, IndiaMART: ${indiamartRaw.length}, Shopify: ${shopifyRaw.length}`
  );

  const allLeads: Lead[] = [
    ...justdialRaw.map((item) => mapJustdialItem(item, cityId)),
    ...indiamartRaw.map((item) => mapIndiamartItem(item, cityId)),
    ...shopifyRaw.map(mapShopifyItem),
  ];

  const indiaLeads = allLeads.filter(isIndia);
  const dropped = allLeads.length - indiaLeads.length;
  if (dropped > 0) {
    console.log(`  [normalize] Dropped ${dropped} non-India leads`);
  }

  const unique = deduplicateLeads(indiaLeads);
  console.log(
    `  [normalize] After dedup: ${unique.length} unique leads (removed ${indiaLeads.length - unique.length} duplicates)`
  );

  fs.mkdirSync(SITES_DIR, { recursive: true });
  const outPath = path.join(SITES_DIR, `${cityId}.json`);
  fs.writeFileSync(outPath, JSON.stringify(unique, null, 2), "utf-8");
  console.log(`  [normalize] Written → ${outPath}`);

  return unique;
}
