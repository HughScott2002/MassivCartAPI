import { ClaudeVisionOCRProvider } from "./claude-ocr.js";
import type { IOCRProvider } from "./types.js";

export type OCRProviderType = "claude";

export class OCRFactory {
  static createProvider(type: OCRProviderType): IOCRProvider {
    if (type !== "claude") {
      throw new Error(`Unsupported OCR provider "${type}". Only "claude" is available.`);
    }

    return new ClaudeVisionOCRProvider();
  }

  static getDefaultProvider(): IOCRProvider {
    const provider = process.env.VISION_PROVIDER ?? process.env.OCR_PROVIDER;
    if (provider && provider !== "claude") {
      throw new Error(
        `Unsupported OCR provider "${provider}". MASSIVCartAPI receipt OCR only supports "claude".`,
      );
    }

    return this.createProvider("claude");
  }
}
