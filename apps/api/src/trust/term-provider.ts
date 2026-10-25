import { BadRequestException } from "@nestjs/common";
import { LocalTermExtractor } from "./extraction";
import { extractionProvider, geminiExtract } from "./gemini-extractor";
import type { ExtractionField, ExtractionProposal } from "./types";

/** Only verified document bytes/text enter a provider; it cannot mutate the draft or decide payment. */
export interface TermExtractionInput {
  pdf?: Buffer;
  text: string;
  pageCount: number;
  jobKey: string;
}
export interface TermExtractionResult {
  fields: ExtractionField[];
  warnings: string[];
  usage?: { inputTokens: number; outputTokens: number; totalTokens: number };
}
export interface TermExtractionProvider {
  readonly identity: ExtractionProposal["extractor"];
  extract(input: TermExtractionInput): Promise<TermExtractionResult>;
}

/** Integration seam for Hoang/Lam. Custom providers must normalize/ground their fields like Gemini. */
export function configuredTermProvider(): TermExtractionProvider {
  const config = extractionProvider();
  if (config.kind === "gemini")
    return {
      identity: {
        kind: "GEMINI",
        version: config.version,
        model: config.model,
      },
      async extract(input) {
        if (!input.pdf)
          throw new BadRequestException("GEMINI_DOCUMENT_REQUIRED");
        return geminiExtract({ ...input, pdf: input.pdf });
      },
    };
  return {
    identity: { kind: "TEXT_RULES", version: config.version },
    async extract(input) {
      return {
        fields: new LocalTermExtractor().extract(input.text),
        warnings: [],
      };
    },
  };
}
