import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compactMessages, messageCharCount } from "@/lib/ai/context-compaction";
import { providerHttpError } from "@/lib/ai/providers/shared";
import type { AiMessage } from "@/lib/ai/types";

const long = (n: number) => "word ".repeat(n).trim();

function conversation(turns: number): AiMessage[] {
  const out: AiMessage[] = [{ role: "system", content: "You are Jarvis." }];
  for (let i = 0; i < turns; i += 1) {
    out.push({ role: i % 2 === 0 ? "user" : "assistant", content: `turn ${i} ${long(2_000)}` });
  }
  out.push({
    role: "user",
    content: [
      { type: "text", text: `latest ${long(3_000)}` },
      { type: "image", dataUrl: "data:image/png;base64,AAAA", mimeType: "image/png" },
    ],
  } as AiMessage);
  return out;
}

describe("context compaction", () => {
  it("sends the conversation unchanged until a model refuses it", () => {
    const messages = conversation(20);
    expect(compactMessages(messages, 0)).toBe(messages);
  });

  it("keeps the instructions and the whole latest message, and shrinks the rest", () => {
    const messages = conversation(20);
    const compacted = compactMessages(messages, 1);
    expect(compacted[0]!.role).toBe("system");
    expect(String(compacted[0]!.content)).toMatch(/^You are Jarvis\.[\s\S]*older messages shortened to fit this model/);
    expect(compacted[compacted.length - 1]).toBe(messages[messages.length - 1]);
    expect(compacted.filter((m) => m.role === "system")).toHaveLength(1);
    expect(messageCharCount(compacted)).toBeLessThan(messageCharCount(messages) / 2);
  });

  it("shrinks further with every refusal", () => {
    const messages = conversation(30);
    const sizes = [1, 2, 3, 4].map((n) => messageCharCount(compactMessages(messages, n)));
    expect(sizes[1]!).toBeLessThan(sizes[0]!);
    expect(sizes[2]!).toBeLessThan(sizes[1]!);
    expect(sizes[3]!).toBe(sizes[2]!);
  });

  it("keeps pictures only on the latest message", () => {
    const messages: AiMessage[] = [
      { role: "user", content: [{ type: "text", text: "old" }, { type: "image", dataUrl: "data:image/png;base64,AA", mimeType: "image/png" }] } as AiMessage,
      ...conversation(10).slice(1),
    ];
    const compacted = compactMessages(messages, 1);
    const withMedia = compacted.filter((m) => Array.isArray(m.content) && m.content.some((p) => p.type !== "text"));
    expect(withMedia).toEqual([messages[messages.length - 1]]);
  });

  it("classifies a provider's context-length refusal so the router can shorten it", async () => {
    for (const body of [
      '{"error":{"code":"context_length_exceeded","message":"This model\'s maximum context length is 8192 tokens"}}',
      "Please reduce the length of the messages or completion.",
      "Request too large for model on tokens per minute (TPM)",
    ]) {
      const error = await providerHttpError("lovable", new Response(body, { status: 400 }));
      expect(error.category).toBe("too_large");
    }
    expect((await providerHttpError("lovable", new Response("response_format is not supported", { status: 400 }))).category).toBe("invalid_request");
  });

  it("is wired into text and structured generation", () => {
    const router = readFileSync("src/lib/ai/router.server.ts", "utf8");
    expect(router.match(/messages: compactMessages\(request\.messages, compaction\)/g)).toHaveLength(2);
    expect(router).toContain("compaction += 1;");
  });
});
