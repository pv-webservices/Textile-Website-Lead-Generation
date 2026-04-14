import * as fs from "fs";
import * as path from "path";
import Anthropic from "@anthropic-ai/sdk";
import { LeadSummary } from "./summarizeSites";

const AUDITS_DIR = path.resolve(__dirname, "../../data/audits");
const BATCH_SIZE = 8;

// Use Haiku for minimal token cost — this is a high-volume classification task
const MODEL = "claude-haiku-4-5";

// ---------------------------------------------------------------------------
// Output shape
// ---------------------------------------------------------------------------

export interface AuditResult {
  id: string;
  main_issue: string;
  opportunity: string;
  fit_score: number;
}

// ---------------------------------------------------------------------------
// System prompt (stable — cached across every batch call)
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT =
  "You are an expert UX and catalog consultant for fabric businesses.\n" +
  "I will give you a JSON array of 5–10 leads. Each has: name, url, platform, title, metaDescription, h1, sampleCategories.\n\n" +
  "For each lead, do a quick audit focused on fabric catalog and lead capture, not SEO.\n" +
  "Output a JSON array with:\n\n" +
  "  id (same as input)\n" +
  "  main_issue (1 sentence, very specific, e.g. \"No clear fabric categories, everything is in one long gallery.\")\n" +
  "  opportunity (1–2 sentences on what a better catalog/UX could do for them)\n" +
  "  fit_score (0–10, where 10 is perfect fit for a Glammy-style catalog & UX project).\n\n" +
  "Keep answers concise and factual, no fluff.\n" +
  "Respond with ONLY the JSON array — no markdown fences, no preamble.";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY environment variable is not set");
  }
  return new Anthropic({ apiKey });
}

function parseBatchResponse(raw: string): AuditResult[] {
  // Strip accidental markdown fences if the model adds them
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const parsed = JSON.parse(cleaned) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(`Expected JSON array, got: ${typeof parsed}`);
  }
  return parsed as AuditResult[];
}

async function auditBatch(
  client: Anthropic,
  batch: LeadSummary[],
  batchIndex: number
): Promise<AuditResult[]> {
  const userContent = JSON.stringify(
    batch.map(({ id, name, url, platform, title, metaDescription, h1, sampleCategories }) => ({
      id,
      name,
      url,
      platform,
      title,
      metaDescription,
      h1,
      sampleCategories,
    })),
    null,
    2
  );

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        // Cache the system prompt — identical for every batch, min 1024 tokens needed;
        // SYSTEM_PROMPT is ~250 tokens so this silently won't cache, but including
        // the marker future-proofs if the prompt grows and costs nothing when ignored.
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userContent }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error(`Batch ${batchIndex}: no text block in response`);
  }

  const results = parseBatchResponse(textBlock.text);

  console.log(
    `  [audit] Batch ${batchIndex + 1}: ${results.length} results` +
    ` | cache_read=${response.usage.cache_read_input_tokens ?? 0}` +
    ` input=${response.usage.input_tokens}` +
    ` output=${response.usage.output_tokens}`
  );

  return results;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function auditLeads(cityId: string): Promise<AuditResult[]> {
  const summariesPath = path.join(AUDITS_DIR, `${cityId}-summaries.json`);
  if (!fs.existsSync(summariesPath)) {
    throw new Error(`Summaries file not found: ${summariesPath}`);
  }

  const summaries: LeadSummary[] = JSON.parse(
    fs.readFileSync(summariesPath, "utf-8")
  );

  console.log(`\n  [audit] Auditing ${summaries.length} leads for "${cityId}"...`);

  const client = getClient();
  const allResults: AuditResult[] = [];

  // Process in batches of BATCH_SIZE sequentially — respects rate limits,
  // lets the cache warm after the first batch
  for (let i = 0; i < summaries.length; i += BATCH_SIZE) {
    const batch = summaries.slice(i, i + BATCH_SIZE);
    const results = await auditBatch(client, batch, Math.floor(i / BATCH_SIZE));
    allResults.push(...results);
  }

  // Sort by fit_score descending so top candidates are easy to scan
  allResults.sort((a, b) => b.fit_score - a.fit_score);

  const outPath = path.join(AUDITS_DIR, `${cityId}-audits.json`);
  fs.writeFileSync(outPath, JSON.stringify(allResults, null, 2), "utf-8");
  console.log(`  [audit] Written → ${outPath}`);

  return allResults;
}
