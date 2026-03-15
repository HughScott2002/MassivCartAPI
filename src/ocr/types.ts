import type { ReceiptData } from "../types/receipt.types.js";

export type SupportedMediaType =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/gif";

export interface OCRUpload {
  buffer: Buffer;
  filename: string;
  mediaType: SupportedMediaType;
}

export interface IOCRProvider {
  extractReceipt(upload: OCRUpload): Promise<ReceiptData>;
  getName(): string;
}
