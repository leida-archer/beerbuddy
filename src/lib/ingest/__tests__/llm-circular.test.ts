import { describe, expect, it, vi } from "vitest";

import {
  parseCircular,
  type LlmCircularClient,
  type LlmCreateParams,
  type LlmCreateResponse,
} from "../llm-circular";

function makeClient(
  reply: string,
): { client: LlmCircularClient; create: ReturnType<typeof vi.fn> } {
  const create = vi.fn(async (_params: LlmCreateParams) => ({
    content: [{ type: "text", text: reply }],
  } satisfies LlmCreateResponse));
  return { client: { messages: { create } }, create };
}

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // "%PDF"
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

describe("parseCircular", () => {
  it("returns ok=true on a schema-valid response", async () => {
    const { client } = makeClient(
      JSON.stringify({
        products: [
          {
            brand: "Sierra Nevada",
            productName: "Pale Ale",
            packSize: 12,
            packUnitMl: 355,
            priceCents: 1599,
            rawSource: "Sierra Nevada Pale Ale 12-pack $15.99",
          },
        ],
        validThrough: "2026-05-20",
      }),
    );
    const r = await parseCircular(
      { sourceId: "grocery-outlet-2026-05-13", mediaType: "application/pdf", data: PDF },
      client,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.response.products).toHaveLength(1);
      expect(r.response.products[0].priceCents).toBe(1599);
      expect(r.response.validThrough).toBe("2026-05-20");
    }
  });

  it("strips ```json code fences", async () => {
    const { client } = makeClient(
      "```json\n" +
        JSON.stringify({
          products: [
            {
              brand: "Stone",
              productName: "IPA",
              packSize: 6,
              packUnitMl: 355,
              priceCents: 1199,
              rawSource: "Stone IPA 6pk $11.99",
            },
          ],
        }) +
        "\n```",
    );
    const r = await parseCircular(
      { sourceId: "s", mediaType: "image/png", data: PNG },
      client,
    );
    expect(r.ok).toBe(true);
  });

  it("returns schema_violation when products is missing", async () => {
    const { client } = makeClient(JSON.stringify({ foo: "bar" }));
    const r = await parseCircular(
      { sourceId: "s", mediaType: "application/pdf", data: PDF },
      client,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("schema_violation");
      expect(r.zodErrors).toBeTruthy();
    }
  });

  it("returns schema_violation when priceCents looks like dollars (LLM unit confusion)", async () => {
    const { client } = makeClient(
      JSON.stringify({
        products: [
          {
            brand: "X",
            productName: "Y",
            packSize: 6,
            packUnitMl: 355,
            priceCents: 1_000_000, // > $1000 in cents → caught by schema
            rawSource: "...",
          },
        ],
      }),
    );
    const r = await parseCircular(
      { sourceId: "s", mediaType: "application/pdf", data: PDF },
      client,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("schema_violation");
  });

  it("returns non_json_response on prose reply", async () => {
    const { client } = makeClient("I cannot read this ad. Sorry!");
    const r = await parseCircular(
      { sourceId: "s", mediaType: "application/pdf", data: PDF },
      client,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("non_json_response");
  });

  it("sends a document block for PDFs and an image block for PNGs", async () => {
    const pdf = makeClient(JSON.stringify({ products: [] }));
    await parseCircular(
      { sourceId: "s", mediaType: "application/pdf", data: PDF },
      pdf.client,
    );
    const pdfCall = pdf.create.mock.calls[0][0] as LlmCreateParams;
    const pdfBlock = pdfCall.messages[0].content[0];
    expect(pdfBlock.type).toBe("document");

    const png = makeClient(JSON.stringify({ products: [] }));
    await parseCircular(
      { sourceId: "s", mediaType: "image/png", data: PNG },
      png.client,
    );
    const pngCall = png.create.mock.calls[0][0] as LlmCreateParams;
    const pngBlock = pngCall.messages[0].content[0];
    expect(pngBlock.type).toBe("image");
  });

  it("threads model + maxTokens overrides through to the client", async () => {
    const { client, create } = makeClient(JSON.stringify({ products: [] }));
    await parseCircular(
      { sourceId: "s", mediaType: "application/pdf", data: PDF },
      client,
      { model: "claude-sonnet-4-6", maxTokens: 8192 },
    );
    const call = create.mock.calls[0][0] as LlmCreateParams;
    expect(call.model).toBe("claude-sonnet-4-6");
    expect(call.max_tokens).toBe(8192);
  });
});
