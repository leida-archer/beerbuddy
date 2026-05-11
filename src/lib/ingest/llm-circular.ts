/**
 * LLM-based circular parser — feeds a weekly-ad PDF or screenshot to a
 * structured-output model and returns a Zod-validated CircularResponse.
 *
 * This is the path for adapters whose source isn't a structured catalog
 * API (Shopify /products.json) or a renderable category page (Instacart
 * collections). It's the fallback for chains that only publish a PDF
 * circular or a JPG of the weekly ad — currently nobody on the v0
 * target list ships exclusively that way, but the helper is here so
 * adding such a chain is a one-file change later.
 *
 * Boundary discipline (locked in /plan-eng-review Issue 7A):
 *   - Output MUST conform to CircularResponseSchema. On Zod failure,
 *     route the raw response to `llm_parse_failures` and return null
 *     to the caller. NEVER persist a row that didn't pass the gate.
 *   - The model client is injected. Tests mock it, production wires
 *     the @anthropic-ai/sdk client at the adapter boundary.
 */

import {
  CircularResponseSchema,
  type CircularResponse,
} from "./llm-schema";

/**
 * Minimal subset of the Anthropic Messages API surface we actually
 * use. Defining it locally (rather than importing from
 * @anthropic-ai/sdk) keeps tests SDK-free and lets us swap providers
 * without rewriting parseCircular.
 */
export interface LlmCircularClient {
  messages: {
    create(params: LlmCreateParams): Promise<LlmCreateResponse>;
  };
}

export interface LlmCreateParams {
  model: string;
  max_tokens: number;
  system?: string;
  messages: Array<{
    role: "user";
    content: Array<LlmTextBlock | LlmDocumentBlock | LlmImageBlock>;
  }>;
}

export interface LlmTextBlock {
  type: "text";
  text: string;
}

export interface LlmDocumentBlock {
  type: "document";
  source: { type: "base64"; media_type: "application/pdf"; data: string };
}

export interface LlmImageBlock {
  type: "image";
  source: {
    type: "base64";
    media_type: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
    data: string;
  };
}

export interface LlmCreateResponse {
  content: Array<{ type: "text"; text: string }>;
}

export type CircularMediaType = LlmDocumentBlock["source"]["media_type"] | LlmImageBlock["source"]["media_type"];

export interface CircularSourceInput {
  /** Identifier for failure logging ("grocery-outlet-2026-05-08"). */
  sourceId: string;
  mediaType: CircularMediaType;
  /** Raw bytes of the PDF or image. */
  data: Uint8Array;
}

export interface ParseCircularOptions {
  /** Defaults to Haiku — cheapest model that handles structured output well. */
  model?: string;
  /** Defaults to 4096 — enough for ~200 products in a circular. */
  maxTokens?: number;
}

export interface ParseCircularSuccess {
  ok: true;
  response: CircularResponse;
}

export interface ParseCircularFailure {
  ok: false;
  reason: "schema_violation" | "no_text_in_response" | "non_json_response";
  rawResponse: unknown;
  zodErrors?: unknown;
}

export type ParseCircularResult = ParseCircularSuccess | ParseCircularFailure;

const SYSTEM_PROMPT = `You read weekly grocery-store ads and extract beer-only sale information.

Return ONLY a JSON object that matches this schema:
{
  "products": [
    {
      "brand": string,                  // e.g. "Sierra Nevada"
      "productName": string,            // e.g. "Pale Ale"
      "packSize": integer,              // e.g. 12 for a 12-pack
      "packUnitMl": integer,            // per-container ml; 355 for a 12oz can
      "abv": number (optional, 0-20),   // alcohol % by volume
      "style": string (optional),       // "IPA", "Lager", etc.
      "priceCents": integer,            // sale price in cents (1399 = $13.99)
      "wasPriceCents": integer (opt),   // regular/strikethrough price in cents
      "storeIdHint": string (optional), // store-locator hint if the ad has one
      "rawSource": string               // verbatim ad text for this product
    }
  ],
  "validThrough": "YYYY-MM-DD" (optional)
}

Rules:
- Skip wine, spirits, hard seltzer that isn't beer, mixers, and non-alcoholic items.
- If a row's pack size or volume isn't stated, omit the row entirely. Do not guess.
- Prices are in cents. $13.99 is 1399, NOT 13.99.
- Do not add commentary, markdown, or any text outside the JSON object.`;

const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const DEFAULT_MAX_TOKENS = 4096;

/**
 * Send a circular's bytes to the model, parse the response, and gate
 * against `CircularResponseSchema`. Pure orchestration — no DB writes;
 * the caller decides what to do with a `ParseCircularFailure`.
 */
export async function parseCircular(
  input: CircularSourceInput,
  client: LlmCircularClient,
  options: ParseCircularOptions = {},
): Promise<ParseCircularResult> {
  const dataB64 = toBase64(input.data);

  const sourceBlock = input.mediaType === "application/pdf"
    ? ({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: dataB64 },
      } satisfies LlmDocumentBlock)
    : ({
        type: "image",
        source: { type: "base64", media_type: input.mediaType, data: dataB64 },
      } satisfies LlmImageBlock);

  const response = await client.messages.create({
    model: options.model ?? DEFAULT_MODEL,
    max_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          sourceBlock,
          {
            type: "text",
            text: `Extract beer-only deals from this circular. Respond with the JSON object only.`,
          },
        ],
      },
    ],
  });

  const text = firstTextBlock(response);
  if (text == null) {
    return { ok: false, reason: "no_text_in_response", rawResponse: response };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFences(text));
  } catch (err) {
    return {
      ok: false,
      reason: "non_json_response",
      rawResponse: text,
      zodErrors: err instanceof Error ? err.message : String(err),
    };
  }

  const result = CircularResponseSchema.safeParse(parsed);
  if (!result.success) {
    return {
      ok: false,
      reason: "schema_violation",
      rawResponse: parsed,
      zodErrors: result.error.issues,
    };
  }

  return { ok: true, response: result.data };
}

function firstTextBlock(response: LlmCreateResponse): string | null {
  for (const block of response.content) {
    if (block.type === "text" && typeof block.text === "string") {
      return block.text;
    }
  }
  return null;
}

/**
 * Tolerate the model occasionally wrapping JSON in a ```json fence
 * despite the instruction not to. Strips the outermost fence if
 * present; otherwise returns input unchanged.
 */
function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/, "")
    .trim();
}

function toBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  // Browser/edge fallback. Concatenates char-codes in a single pass
  // to avoid the apply-array-stack limit on long inputs.
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
