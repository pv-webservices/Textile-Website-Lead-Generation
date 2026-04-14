import * as fs from "fs";
import * as path from "path";
import { Lead } from "../types";
import { fetchHtml, runBatched } from "./detectStack";

const SCORED_DIR = path.resolve(__dirname, "../../data/scored_leads");
const AUDITS_DIR = path.resolve(__dirname, "../../data/audits");
const TOP_N = 30;
const CONCURRENCY = 5;

// ---------------------------------------------------------------------------
// Output shape
// ---------------------------------------------------------------------------

export interface LeadSummary {
  id: string;
  name: string;
  url: string;
  platform: string;
  score: number;
  title: string;
  metaDescription: string;
  h1: string;
  sampleCategories: string[];
}

// ---------------------------------------------------------------------------
// HTML field extractors — regex-based, no dependencies
// ---------------------------------------------------------------------------

function firstMatch(html: string, pattern: RegExp): string {
  const m = html.match(pattern);
  return m ? m[1].replace(/\s+/g, " ").trim() : "";
}

function extractTitle(html: string): string {
  return firstMatch(html, /<title[^>]*>([^<]{1,200})<\/title>/i).slice(0, 80);
}

function extractMetaDescription(html: string): string {
  // <meta name="description" content="...">  (attribute order varies)
  const m =
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{1,400})["']/i) ??
    html.match(/<meta[^>]+content=["']([^"']{1,400})["'][^>]+name=["']description["']/i);
  return m ? m[1].replace(/\s+/g, " ").trim().slice(0, 160) : "";
}

function extractH1(html: string): string {
  return firstMatch(html, /<h1[^>]*>([\s\S]{1,200}?)<\/h1>/i)
    .replace(/<[^>]+>/g, "") // strip any inline tags inside h1
    .slice(0, 80);
}

function extractSampleCategories(html: string, platform: string): string[] {
  const candidates: string[] = [];

  // Shopify: /collections/<slug>
  if (platform === "shopify") {
    const re = /href=["']\/collections\/([a-z0-9_-]+)["']/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) candidates.push(m[1].replace(/-/g, " "));
  }

  // WordPress: /category/<slug> or /product-category/<slug>
  if (platform === "wordpress") {
    const re = /href=["'][^"']*\/(?:product-)?category\/([a-z0-9_-]+)\/?["']/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) candidates.push(m[1].replace(/-/g, " "));
  }

  // Fallback: visible text inside <nav> anchor tags
  if (candidates.length === 0) {
    const navBlock = html.match(/<nav[\s\S]{0,4000}?<\/nav>/i)?.[0] ?? "";
    const re = /<a[^>]*>([^<]{3,40})<\/a>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(navBlock)) !== null) {
      const text = m[1].replace(/\s+/g, " ").trim();
      if (text) candidates.push(text);
    }
  }

  // Deduplicate, lowercase, cap length, return up to 5
  const seen = new Set<string>();
  const result: string[] = [];
  for (const c of candidates) {
    const key = c.toLowerCase().trim().slice(0, 40);
    if (!seen.has(key) && key.length > 2) {
      seen.add(key);
      result.push(key);
    }
    if (result.length === 5) break;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Per-lead summariser
// ---------------------------------------------------------------------------

async function summariseLead(lead: Lead): Promise<LeadSummary> {
  const base: LeadSummary = {
    id: lead.id,
    name: lead.name,
    url: lead.website,
    platform: lead.platform ?? "unknown",
    score: lead.score ?? 0,
    title: "",
    metaDescription: "",
    h1: "",
    sampleCategories: [],
  };

  if (!lead.website || !lead.website.trim()) return base;

  const html = await fetchHtml(lead.website);
  if (!html) return base;

  return {
    ...base,
    title: extractTitle(html),
    metaDescription: extractMetaDescription(html),
    h1: extractH1(html),
    sampleCategories: extractSampleCategories(html, lead.platform ?? "unknown"),
  };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function summarizeSites(cityId: string): Promise<LeadSummary[]> {
  const scoredPath = path.join(SCORED_DIR, `${cityId}.json`);
  if (!fs.existsSync(scoredPath)) {
    throw new Error(`Scored leads file not found: ${scoredPath}`);
  }

  const allLeads: Lead[] = JSON.parse(fs.readFileSync(scoredPath, "utf-8"));

  // Scored list is already sorted descending; take top 30, drop hard-negatives
  const top = allLeads
    .filter((l) => (l.score ?? 0) > -99)
    .slice(0, TOP_N);

  console.log(`\n  [summarize] Summarising top ${top.length} leads for "${cityId}"...`);

  const summaries = await runBatched(top, CONCURRENCY, async (lead, i) => {
    const summary = await summariseLead(lead);
    const fetched = summary.title || summary.h1 ? "✓" : "–";
    console.log(`  [summarize] ${i + 1}/${top.length} ${fetched} ${lead.name || lead.website}`);
    return summary;
  });

  fs.mkdirSync(AUDITS_DIR, { recursive: true });
  const outPath = path.join(AUDITS_DIR, `${cityId}-summaries.json`);
  fs.writeFileSync(outPath, JSON.stringify(summaries, null, 2), "utf-8");
  console.log(`  [summarize] Written → ${outPath}`);

  return summaries;
}
