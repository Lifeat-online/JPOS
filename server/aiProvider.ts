/**
 * Vercel AI SDK adapter for MasePOS.
 *
 * Central place that maps a tenant's AI settings to a concrete AI SDK model,
 * so the rest of the server talks to one unified API (`generateText`, `embed`)
 * instead of hand-rolling `fetch` calls per provider.
 *
 * Scope: the four mainstream providers with clean SDK mappings — OpenAI,
 * Google (Gemini), OpenRouter, and Ollama. Vertex (bespoke OAuth + Gemini
 * fallback) and AnythingLLM (workspace chat API) keep their existing
 * hand-rolled paths in ai.ts; see `providerUsesSdk`.
 */
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import {
  generateText,
  embed,
  embedMany,
  type LanguageModel,
  type EmbeddingModel,
  type ModelMessage,
} from "ai";

export type SdkProviderName = "openai" | "google" | "openrouter" | "ollama";

const SDK_PROVIDERS: readonly SdkProviderName[] = ["openai", "google", "openrouter", "ollama"];

/** True when a provider has a first-class AI SDK mapping (see module scope). */
export function providerUsesSdk(provider: string): provider is SdkProviderName {
  return (SDK_PROVIDERS as readonly string[]).includes(provider);
}

export interface ResolveTextModelInput {
  provider: SdkProviderName;
  /** Model id, already normalized by the caller (e.g. OpenRouter slug). */
  model: string;
  apiKey: string;
  /** Base URL override — used by Ollama; ignored elsewhere. */
  baseUrl?: string | null;
  /** Extra request headers — used by OpenRouter (HTTP-Referer, X-Title). */
  headers?: Record<string, string>;
}

/** Map tenant AI settings to a concrete AI SDK language model. */
export function resolveTextModel(input: ResolveTextModelInput): LanguageModel {
  switch (input.provider) {
    case "openai":
      // Responses API mirrors the previous /v1/responses integration.
      return createOpenAI({ apiKey: input.apiKey }).responses(input.model);
    case "google":
      return createGoogleGenerativeAI({ apiKey: input.apiKey })(input.model);
    case "openrouter":
      return createOpenAICompatible({
        name: "openrouter",
        baseURL: "https://openrouter.ai/api/v1",
        apiKey: input.apiKey,
        headers: input.headers,
      })(input.model);
    case "ollama": {
      const base = (input.baseUrl || "http://localhost:11434").replace(/\/$/, "");
      return createOpenAICompatible({
        name: "ollama",
        baseURL: `${base}/v1`,
        // Ollama ignores the key but the OpenAI-compatible client requires one.
        apiKey: input.apiKey || "ollama",
      })(input.model);
    }
  }
}

/** Split a `data:` URL into its media type and raw base64 payload. */
function parseDataUrl(dataUrl: string): { mediaType: string; base64: string } {
  const match = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl || "");
  return {
    mediaType: match?.[1] || "application/octet-stream",
    base64: match?.[2] || "",
  };
}

export interface TextDocumentInput {
  name?: string;
  dataUrl?: string;
}

/**
 * Build a single user message from text plus optional images and documents.
 * Images/documents may be `data:` URLs (inlined as file parts) or http(s)
 * URLs (passed by reference).
 */
function buildUserMessage(
  text: string,
  images: string[],
  documents: TextDocumentInput[],
): ModelMessage {
  const content: Array<
    | { type: "text"; text: string }
    | { type: "image"; image: URL }
    | { type: "file"; data: string; mediaType: string; filename?: string }
  > = [{ type: "text", text }];

  for (const image of images) {
    if (!image) continue;
    if (image.startsWith("data:")) {
      const { mediaType, base64 } = parseDataUrl(image);
      if (base64) content.push({ type: "file", data: base64, mediaType });
    } else {
      try {
        content.push({ type: "image", image: new URL(image) });
      } catch {
        // Skip a malformed image URL rather than aborting the whole request.
      }
    }
  }

  for (const doc of documents) {
    if (!doc.dataUrl) continue;
    const { mediaType, base64 } = parseDataUrl(doc.dataUrl);
    if (base64) {
      content.push({ type: "file", data: base64, mediaType, filename: doc.name || "document" });
    }
  }

  return { role: "user", content };
}

export interface GenerateTextInput extends ResolveTextModelInput {
  system: string;
  message: string;
  images?: string[];
  documents?: TextDocumentInput[];
}

/** Run a one-shot text generation through the AI SDK and return the text. */
export async function generateTextViaSdk(input: GenerateTextInput): Promise<string> {
  const model = resolveTextModel(input);
  const messages: ModelMessage[] = [
    buildUserMessage(input.message, input.images || [], input.documents || []),
  ];
  const { text } = await generateText({
    model,
    system: input.system,
    messages,
  });
  return text || "";
}

export interface ResolveEmbeddingModelInput {
  apiKey: string;
  /** Defaults to OpenAI text-embedding-3-small (1536 dims). */
  model?: string;
}

/** Default embedding model + dimensionality used across the app. */
export const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
export const DEFAULT_EMBEDDING_DIMENSIONS = 1536;

export function resolveEmbeddingModel(input: ResolveEmbeddingModelInput): EmbeddingModel {
  return createOpenAI({ apiKey: input.apiKey }).embedding(input.model || DEFAULT_EMBEDDING_MODEL);
}

/** Embed a single string; returns the raw vector. */
export async function embedText(input: ResolveEmbeddingModelInput, value: string): Promise<number[]> {
  const { embedding } = await embed({ model: resolveEmbeddingModel(input), value });
  return embedding;
}

/** Embed many strings in one batched request; returns vectors in input order. */
export async function embedTexts(
  input: ResolveEmbeddingModelInput,
  values: string[],
): Promise<number[][]> {
  if (!values.length) return [];
  const { embeddings } = await embedMany({ model: resolveEmbeddingModel(input), values });
  return embeddings;
}
