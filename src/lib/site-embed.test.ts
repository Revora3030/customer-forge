import { describe, expect, it } from "vitest";
import { embedProviderLabel, readEmbed, safeEmbedUrl } from "./site-embed";

describe("safeEmbedUrl", () => {
  it("accepts an allowlisted https embed", () => {
    expect(safeEmbedUrl("https://calendly.com/revora/intro")).toBe(
      "https://calendly.com/revora/intro",
    );
    expect(safeEmbedUrl("https://www.google.com/maps/embed?pb=!1m18")).toContain("maps/embed");
  });

  it("rejects hosts that are not on the allowlist", () => {
    expect(safeEmbedUrl("https://evil.example.com/widget")).toBeNull();
  });

  it("rejects script, data and plain http URLs", () => {
    expect(safeEmbedUrl("javascript:alert(1)")).toBeNull();
    expect(safeEmbedUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(safeEmbedUrl("http://calendly.com/revora")).toBeNull();
  });

  it("rejects embedded credentials and junk values", () => {
    expect(safeEmbedUrl("https://user:pass@calendly.com/revora")).toBeNull();
    expect(safeEmbedUrl("")).toBeNull();
    expect(safeEmbedUrl(null)).toBeNull();
    expect(safeEmbedUrl(42)).toBeNull();
  });

  it("names the provider for the frame title", () => {
    expect(embedProviderLabel("https://open.spotify.com/show/1")).toBe("Spotify");
    expect(embedProviderLabel("not a url")).toBeNull();
  });
});

describe("readEmbed", () => {
  it("reads the URL the builder stored in settings", () => {
    const embed = readEmbed({ settings: { embed: { url: "https://tidycal.com/revora", height: 700 } } });
    expect(embed).toEqual({ url: "https://tidycal.com/revora", title: "TidyCal embed", height: 700 });
  });

  it("keeps a client's own title and clamps a silly height", () => {
    const embed = readEmbed({
      settings: { embed: { url: "https://tidycal.com/revora", title: "Book a valet", height: 99999 } },
    });
    expect(embed?.title).toBe("Book a valet");
    expect(embed?.height).toBe(1200);
  });

  it("falls back to a share link pasted into the section body", () => {
    const embed = readEmbed({ settings: {}, body: "Book here: https://cal.com/revora/detail" });
    expect(embed?.url).toBe("https://cal.com/revora/detail");
    expect(embed?.height).toBe(460);
  });

  it("returns nothing for an unusable or missing URL", () => {
    expect(readEmbed({ settings: { embed: { url: "https://evil.example.com/x" } } })).toBeNull();
    expect(readEmbed({ settings: null, body: null })).toBeNull();
  });
});
