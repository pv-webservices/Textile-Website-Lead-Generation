import * as fs from "fs";
import * as path from "path";
import * as https from "https";
import * as http from "http";
import { IncomingHttpHeaders } from "http";
import { Lead } from "../types";

const SITES_DIR = path.resolve(__dirname, "../../data/raw_sites");
const FETCH_TIMEOUT_MS = 8000;
const CONCURRENCY = 5;
const DEBUG_DETECT_STACK = process.env.DEBUG_DETECT_STACK === "1";

interface FetchResult {
  html: string | null;
  headers: IncomingHttpHeaders;
  finalUrl: string;
}

export function fetchHtml(rawUrl: string): Promise<string | null> {
  return fetchHtmlDetails(rawUrl).then((result) => result.html);
}

export function fetchHtmlDetails(rawUrl: string): Promise<FetchResult> {
  return new Promise((resolve) => {
    let url: URL;
    try {
      url = new URL(rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`);
    } catch {
      return resolve({ html: null, headers: {}, finalUrl: rawUrl });
    }

    const lib = url.protocol === "https:" ? https : http;
    let settled = false;
    let req: http.ClientRequest;

    const finish = (result: FetchResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const timer = setTimeout(() => {
      req.destroy();
      finish({ html: null, headers: {}, finalUrl: url.toString() });
    }, FETCH_TIMEOUT_MS);

    req = lib.get(
      {
        hostname: url.hostname,
        port: url.port || undefined,
        path: `${url.pathname || "/"}${url.search || ""}`,
        headers: { "User-Agent": "Mozilla/5.0" },
      },
      (res) => {
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          req.destroy();
          const redirectUrl = new URL(res.headers.location, url).toString();
          fetchHtmlDetails(redirectUrl).then(finish);
          return;
        }

        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => {
          chunks.push(chunk);
          if (Buffer.concat(chunks).length > 200_000) {
            res.destroy();
          }
        });
        res.on("end", () => {
          finish({
            html: Buffer.concat(chunks).toString("utf-8"),
            headers: res.headers,
            finalUrl: url.toString(),
          });
        });
        res.on("error", () => {
          finish({ html: null, headers: res.headers, finalUrl: url.toString() });
        });
      }
    );

    req.on("error", () => {
      finish({ html: null, headers: {}, finalUrl: url.toString() });
    });
  });
}

type Platform = Lead["platform"];

function hasShopifySignature(html: string, headers: IncomingHttpHeaders): boolean {
  const lowerHtml = html.toLowerCase();
  const headerBlob = Object.entries(headers)
    .map(([key, value]) => `${key}:${Array.isArray(value) ? value.join(",") : value ?? ""}`)
    .join(" ")
    .toLowerCase();

  return (
    lowerHtml.includes("cdn.shopify.com") ||
    lowerHtml.includes("window.shopify") ||
    lowerHtml.includes("shopify.theme") ||
    lowerHtml.includes("/cart.js") ||
    lowerHtml.includes("shopify-digital-wallet") ||
    headerBlob.includes("x-shopid")
  );
}

function detectPlatformFromHtml(html: string, headers: IncomingHttpHeaders): Platform {
  if (hasShopifySignature(html, headers)) {
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

export async function detectStacks(cityId: string): Promise<Lead[]> {
  const sitesPath = path.join(SITES_DIR, `${cityId}.json`);
  if (!fs.existsSync(sitesPath)) {
    throw new Error(`Normalized leads file not found: ${sitesPath}`);
  }

  const leads: Lead[] = JSON.parse(fs.readFileSync(sitesPath, "utf-8"));
  const withWebsite = leads.filter((lead) => lead.website && lead.website.trim());
  const withoutWebsite = leads.filter((lead) => !lead.website || !lead.website.trim());

  console.log(
    `\n  [detectStack] ${withWebsite.length} leads have websites, ${withoutWebsite.length} skipped (no URL)`
  );

  let detected = 0;
  const enriched = await runBatched(withWebsite, CONCURRENCY, async (lead) => {
    const { html, headers, finalUrl } = await fetchHtmlDetails(lead.website);
    if (!html) {
      if (DEBUG_DETECT_STACK) {
        console.log(`  [detectStack][debug] unknown (fetch failed): ${lead.website}`);
      }
      return { ...lead, platform: "unknown" as Platform };
    }

    const platform = detectPlatformFromHtml(html, headers);
    if (platform !== "other" && platform !== "unknown") {
      detected++;
    }

    if (platform === "unknown" && DEBUG_DETECT_STACK) {
      const preview = html.replace(/\s+/g, " ").slice(0, 300);
      console.log(`  [detectStack][debug] unknown: ${finalUrl}`);
      console.log(`  [detectStack][debug] html: ${preview}`);
    }

    return { ...lead, platform };
  });

  const allLeads: Lead[] = [
    ...enriched,
    ...withoutWebsite.map((lead) => ({ ...lead, platform: "unknown" as Platform })),
  ];

  console.log(`  [detectStack] Detected platforms on ${detected} leads`);

  const counts: Record<string, number> = {};
  for (const lead of allLeads) {
    const platform = lead.platform ?? "unknown";
    counts[platform] = (counts[platform] ?? 0) + 1;
  }
  console.log(`  [detectStack] Platform breakdown:`, counts);

  fs.writeFileSync(sitesPath, JSON.stringify(allLeads, null, 2), "utf-8");
  console.log(`  [detectStack] Updated -> ${sitesPath}`);

  return allLeads;
}
