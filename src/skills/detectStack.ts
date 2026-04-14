import * as fs from "fs";
import * as path from "path";
import * as https from "https";
import * as http from "http";
import { Lead } from "../types";

const SITES_DIR = path.resolve(__dirname, "../../data/raw_sites");
const FETCH_TIMEOUT_MS = 8000;
const CONCURRENCY = 5; // simultaneous HTTP requests

// ---------------------------------------------------------------------------
// Tiny HTTP fetcher — returns raw HTML string or null on any error
// ---------------------------------------------------------------------------

export function fetchHtml(rawUrl: string): Promise<string | null> {
  return new Promise((resolve) => {
    let url: URL;
    try {
      url = new URL(rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`);
    } catch {
      return resolve(null);
    }

    const lib = url.protocol === "https:" ? https : http;
    const timer = setTimeout(() => {
      req.destroy();
      resolve(null);
    }, FETCH_TIMEOUT_MS);

    const req = lib.get(
      { hostname: url.hostname, path: url.pathname || "/", headers: { "User-Agent": "Mozilla/5.0" } },
      (res) => {
        // Follow one redirect
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          clearTimeout(timer);
          req.destroy();
          fetchHtml(res.headers.location).then(resolve);
          return;
        }

        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => {
          chunks.push(chunk);
          // Stop reading after 200 KB — enough for <head> detection
          if (Buffer.concat(chunks).length > 200_000) res.destroy();
        });
        res.on("end", () => {
          clearTimeout(timer);
          resolve(Buffer.concat(chunks).toString("utf-8"));
        });
        res.on("error", () => { clearTimeout(timer); resolve(null); });
      }
    );

    req.on("error", () => { clearTimeout(timer); resolve(null); });
  });
}

// ---------------------------------------------------------------------------
// Platform detection from raw HTML
// ---------------------------------------------------------------------------

type Platform = Lead["platform"];

function detectPlatformFromHtml(html: string): Platform {
  if (
    html.includes("cdn.shopify.com") ||
    html.includes("Shopify.theme") ||
    html.includes("/cart.js")
  ) {
    return "shopify";
  }
  if (
    html.includes("wixstatic.com") ||
    html.includes("X-Wix-Request-Id") ||
    html.includes("wix-code")
  ) {
    return "wix";
  }
  if (
    html.includes("/wp-content/") ||
    html.includes("/wp-json/")
  ) {
    return "wordpress";
  }
  return "other";
}

// ---------------------------------------------------------------------------
// Concurrency helper — run async tasks in batches
// ---------------------------------------------------------------------------

export async function runBatched<T, R>(
  items: T[],
  batchSize: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map((item, j) => fn(item, i + j))
    );
    results.push(...batchResults);
  }
  return results;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function detectStacks(cityId: string): Promise<Lead[]> {
  const sitesPath = path.join(SITES_DIR, `${cityId}.json`);
  if (!fs.existsSync(sitesPath)) {
    throw new Error(`Normalized leads file not found: ${sitesPath}`);
  }

  const leads: Lead[] = JSON.parse(fs.readFileSync(sitesPath, "utf-8"));
  const withWebsite = leads.filter((l) => l.website && l.website.trim());
  const withoutWebsite = leads.filter((l) => !l.website || !l.website.trim());

  console.log(
    `\n  [detectStack] ${withWebsite.length} leads have websites, ${withoutWebsite.length} skipped (no URL)`
  );

  let detected = 0;
  const enriched = await runBatched(withWebsite, CONCURRENCY, async (lead) => {
    const html = await fetchHtml(lead.website);
    if (!html) {
      return { ...lead, platform: "unknown" as Platform };
    }
    const platform = detectPlatformFromHtml(html);
    if (platform !== "other" && platform !== "unknown") detected++;
    return { ...lead, platform };
  });

  const allLeads: Lead[] = [
    ...enriched,
    ...withoutWebsite.map((l) => ({ ...l, platform: "unknown" as Platform })),
  ];

  console.log(`  [detectStack] Detected platforms on ${detected} leads`);

  const counts: Record<string, number> = {};
  for (const l of allLeads) {
    const p = l.platform ?? "unknown";
    counts[p] = (counts[p] ?? 0) + 1;
  }
  console.log(`  [detectStack] Platform breakdown:`, counts);

  // Write enriched leads back to the same file
  fs.writeFileSync(sitesPath, JSON.stringify(allLeads, null, 2), "utf-8");
  console.log(`  [detectStack] Updated → ${sitesPath}`);

  return allLeads;
}
