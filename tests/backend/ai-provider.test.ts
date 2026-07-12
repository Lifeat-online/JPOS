import { describe, expect, it } from "vitest";
import {
  providerUsesSdk,
  resolveTextModel,
  resolveEmbeddingModel,
  DEFAULT_EMBEDDING_MODEL,
  DEFAULT_EMBEDDING_DIMENSIONS,
  type SdkProviderName,
} from "../../server/aiProvider.js";

describe("aiProvider", () => {
  it("routes the four mainstream providers through the SDK", () => {
    for (const p of ["openai", "google", "openrouter", "ollama"]) {
      expect(providerUsesSdk(p)).toBe(true);
    }
  });

  it("keeps vertex and anythingllm on the bespoke (non-SDK) path", () => {
    expect(providerUsesSdk("vertex")).toBe(false);
    expect(providerUsesSdk("anythingllm")).toBe(false);
    expect(providerUsesSdk("nonsense")).toBe(false);
  });

  it("resolves a language model for every SDK provider without throwing", () => {
    const providers: SdkProviderName[] = ["openai", "google", "openrouter", "ollama"];
    for (const provider of providers) {
      const model = resolveTextModel({
        provider,
        model: provider === "openrouter" ? "openai/gpt-5-mini" : "test-model",
        apiKey: "test-key",
        baseUrl: provider === "ollama" ? "http://localhost:11434" : null,
      });
      expect(model).toBeTruthy();
    }
  });

  it("defaults embeddings to OpenAI text-embedding-3-small (1536 dims)", () => {
    expect(DEFAULT_EMBEDDING_MODEL).toBe("text-embedding-3-small");
    expect(DEFAULT_EMBEDDING_DIMENSIONS).toBe(1536);
    const model = resolveEmbeddingModel({ apiKey: "test-key" });
    expect(model).toBeTruthy();
  });
});
