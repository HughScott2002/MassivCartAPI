import {
  ANTHROPIC_API_URL,
  ANTHROPIC_API_VERSION,
  DEFAULT_ANTHROPIC_MODEL,
} from "../config/constants.js";
import { RECEIPT_STRUCTURING_SYSTEM_PROMPT } from "../llm/prompts.js";
import type { ReceiptData } from "../types/receipt.types.js";
import { parseEmbeddedJson } from "../utils/json.js";
import { logInfo } from "../utils/logger.js";
import type { IOCRProvider, OCRUpload, SupportedMediaType } from "./types.js";

const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL ?? DEFAULT_ANTHROPIC_MODEL;

function parseClaudeJson(raw: string): ReceiptData {
  const parsed = parseEmbeddedJson<
    Partial<ReceiptData> & {
      type?: ReceiptData["imageType"];
    }
  >(raw) as Partial<ReceiptData> & {
    type?: ReceiptData["imageType"];
  };

  return {
    store: parsed.store ?? null,
    address: parsed.address ?? null,
    addressConfident: parsed.addressConfident ?? false,
    date: parsed.date ?? null,
    items: Array.isArray(parsed.items)
      ? parsed.items.map((item) => ({
          name: item.name,
          price: item.price ?? 0,
          quantity: item.quantity ?? 1,
          unit: item.unit ?? undefined,
          dosage: item.dosage ?? undefined,
        }))
      : [],
    total: parsed.total ?? 0,
    currency: parsed.currency ?? "JMD",
    rawText: parsed.rawText,
    imageType: parsed.imageType ?? parsed.type ?? "unknown",
    prescriber: parsed.prescriber ?? null,
    patient: parsed.patient ?? null,
  };
}

export class ClaudeVisionOCRProvider implements IOCRProvider {
  getName(): string {
    return `Claude Vision OCR (${DEFAULT_MODEL})`;
  }

  async extractReceipt(upload: OCRUpload): Promise<ReceiptData> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("Missing ANTHROPIC_API_KEY");
    }

    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_API_VERSION,
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        max_tokens: 2048,
        system: RECEIPT_STRUCTURING_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: upload.mediaType,
                  data: upload.buffer.toString("base64"),
                },
              },
              {
                type: "text",
                text: "Parse this receipt image and return the JSON:",
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Claude OCR error: ${response.status} ${response.statusText} ${body}`);
    }

    const data = (await response.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const textBlock = data.content?.find((block) => block.type === "text" && block.text);

    if (!textBlock?.text) {
      throw new Error("Claude OCR returned no text content");
    }

    logInfo("Claude OCR raw response received", {
      provider: this.getName(),
      filename: upload.filename,
      rawText: textBlock.text,
    });

    const receiptData = parseClaudeJson(textBlock.text);
    logInfo("Claude OCR parsed response", {
      provider: this.getName(),
      filename: upload.filename,
      imageType: receiptData.imageType ?? null,
      itemCount: receiptData.items.length,
      store: receiptData.store ?? null,
      total: receiptData.total ?? null,
    });

    return receiptData;
  }
}

export function normalizeMediaType(contentType?: string): SupportedMediaType {
  const value = (contentType ?? "").toLowerCase().trim();
  if (
    value === "image/jpeg" ||
    value === "image/png" ||
    value === "image/webp" ||
    value === "image/gif"
  ) {
    return value;
  }

  return "image/jpeg";
}
