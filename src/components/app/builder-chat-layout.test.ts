import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const chat = readFileSync("src/components/app/BuilderAssistant.tsx", "utf8");

describe("builder chat layout", () => {
  it("has one chat header, a centred welcome with live suggestions and an arrow send button", () => {
    expect(chat).toMatch(/Chat header/);
    expect(chat).toMatch(/Suggested for your site/);
    expect(chat).toMatch(/<ArrowUp className="size-\[18px\]"/);
  });
  it("no longer shows marketing badges in the chat welcome", () => {
    expect(chat).not.toMatch(/Multi-model collective|Full creative control|AI team online/);
  });
  it("keeps the existing request engine wiring", () => {
    for (const call of ["requests.queue(", "requests.apply(", "requests.retry(", "requests.newChat()", "onFactAnswer("]) {
      expect(chat).toContain(call);
    }
  });
});
