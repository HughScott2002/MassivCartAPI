import { Router } from "express";
import { OCRFactory } from "../ocr/index.js";
import { normalizeMediaType } from "../ocr/claude-ocr.js";
import type { OCRUpload } from "../ocr/types.js";
import { logError, logInfo } from "../utils/logger.js";

const router = Router();
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const KNOWN_TYPES = ["receipt", "prescription", "gas_price", "shopping_list"];

async function readRequestBody(req: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.length;

    if (totalBytes > MAX_UPLOAD_BYTES) {
      throw new Error("Uploaded image exceeds 5 MB limit");
    }

    chunks.push(buffer);
  }

  return Buffer.concat(chunks);
}

function parseImageUpload(contentType: string | undefined, body: Buffer): OCRUpload | null {
  const boundaryMatch = contentType?.match(/boundary=([^;]+)/i);
  if (!boundaryMatch) {
    logInfo("Receipt upload parse failed: multipart boundary missing", {
      contentType: contentType ?? null,
      bodyBytes: body.length,
    });
    return null;
  }

  const boundary = boundaryMatch[1].trim().replace(/^"|"$/g, "");
  const raw = body.toString("latin1");
  const parts = raw.split(`--${boundary}`);

  for (const part of parts) {
    if (!part.includes('name="image"')) {
      continue;
    }

    const headerEnd = part.indexOf("\r\n\r\n");
    if (headerEnd === -1) {
      continue;
    }

    const headerText = part.slice(0, headerEnd);
    const dataStart = headerEnd + 4;
    let dataEnd = part.lastIndexOf("\r\n");
    if (dataEnd < dataStart) {
      dataEnd = part.length;
    }

    const filenameMatch = headerText.match(/filename="([^"]*)"/i);
    const mediaTypeMatch = headerText.match(/Content-Type:\s*([^\r\n]+)/i);

    return {
      filename: filenameMatch?.[1] ?? "upload.jpg",
      mediaType: normalizeMediaType(mediaTypeMatch?.[1]),
      buffer: Buffer.from(part.slice(dataStart, dataEnd), "latin1"),
    };
  }

  logInfo("Receipt upload parse failed: image field not found", {
    contentType: contentType ?? null,
    bodyBytes: body.length,
  });
  return null;
}

router.post("/api/receipt", async (req, res) => {
  try {
    const contentLengthHeader = req.headers["content-length"];
    const contentLength =
      typeof contentLengthHeader === "string"
        ? Number(contentLengthHeader)
        : Array.isArray(contentLengthHeader)
          ? Number(contentLengthHeader[0])
          : NaN;

    if (Number.isFinite(contentLength) && contentLength > MAX_UPLOAD_BYTES) {
      logInfo("Receipt OCR rejected before reading body", {
        reason: "content_length_exceeds_limit",
        contentLength,
        limitBytes: MAX_UPLOAD_BYTES,
        contentType: req.headers["content-type"] ?? null,
      });
      res.status(413).json({ error: "Image exceeds 5 MB limit" });
      return;
    }

    const requestBody = await readRequestBody(req);
    const upload = parseImageUpload(req.headers["content-type"], requestBody);
    if (!upload || upload.buffer.length === 0) {
      logInfo("Receipt OCR rejected before provider call", {
        reason: "missing_image",
        contentType: req.headers["content-type"] ?? null,
        bodyBytes: requestBody.length,
      });
      res.status(400).json({ error: "No image file provided" });
      return;
    }

    const ocrProvider = OCRFactory.getDefaultProvider();
    logInfo("Receipt OCR started", {
      provider: ocrProvider.getName(),
      filename: upload.filename,
      bytes: upload.buffer.length,
      mediaType: upload.mediaType,
    });

    const receiptData = await ocrProvider.extractReceipt(upload);
    if (!receiptData.imageType || !KNOWN_TYPES.includes(receiptData.imageType)) {
      logInfo("Receipt OCR rejected after provider call", {
        reason: "unknown_image_type",
        filename: upload.filename,
        mediaType: upload.mediaType,
        imageType: receiptData.imageType ?? null,
        itemCount: receiptData.items.length,
        store: receiptData.store ?? null,
        total: receiptData.total ?? null,
        payload: receiptData,
      });
      res.status(422).json({
        error:
          "That doesn't look like a receipt, prescription, gas price board, or shopping list. Please try a clearer photo.",
      });
      return;
    }

    logInfo("Receipt OCR completed", {
      filename: upload.filename,
      mediaType: upload.mediaType,
      imageType: receiptData.imageType,
      itemCount: receiptData.items.length,
      store: receiptData.store ?? null,
      total: receiptData.total ?? null,
    });
    res.status(200).json(receiptData);
  } catch (error) {
    if (error instanceof Error && error.message === "Uploaded image exceeds 5 MB limit") {
      logInfo("Receipt OCR rejected before provider call", {
        reason: "image_too_large",
        contentType: req.headers["content-type"] ?? null,
      });
      res.status(413).json({ error: "Image exceeds 5 MB limit" });
      return;
    }

    logError("Receipt OCR failed", error, {
      path: "/api/receipt",
    });

    res.status(500).json({ error: "OCR processing failed" });
  }
});

export default router;
