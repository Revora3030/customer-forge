import { describe, expect, it } from "vitest";
import {
  embeddableMapUrl,
  embedProviderLabel,
  keylessMapEmbedUrl,
  openStreetMapEmbedUrl,
  readEmbed,
  safeEmbedUrl,
} from "./site-embed";
import { CONTENT_SECURITY_POLICY } from "./security-headers";

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
    const embed = readEmbed({
      settings: { embed: { url: "https://tidycal.com/revora", height: 700 } },
    });
    expect(embed).toEqual({
      url: "https://tidycal.com/revora",
      title: "TidyCal embed",
      height: 700,
    });
  });

  it("keeps a client's own title and clamps a silly height", () => {
    const embed = readEmbed({
      settings: {
        embed: { url: "https://tidycal.com/revora", title: "Book a valet", height: 99999 },
      },
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

describe("key-less maps", () => {
  it("builds the free Google embed for an address", () => {
    expect(keylessMapEmbedUrl("12 Main St, Raleigh, NC")).toBe(
      "https://www.google.com/maps?q=12%20Main%20St%2C%20Raleigh%2C%20NC&output=embed",
    );
    expect(keylessMapEmbedUrl("   ")).toBeNull();
  });

  it("builds an OpenStreetMap fallback for a point and rejects bad coordinates", () => {
    expect(openStreetMapEmbedUrl(35.78, -78.64)).toBe(
      "https://www.openstreetmap.org/export/embed.html?bbox=-78.65000,35.77000,-78.63000,35.79000&layer=mapnik&marker=35.78000,-78.64000",
    );
    expect(openStreetMapEmbedUrl(200, 0)).toBeNull();
    expect(safeEmbedUrl(openStreetMapEmbedUrl(35.78, -78.64))).not.toBeNull();
  });

  it("rewrites Maps pages Google refuses to frame into the embed form", () => {
    expect(
      embeddableMapUrl(
        "https://www.google.com/maps/place/Joe's+Plumbing+%26+Drain/@35.77,-78.63,17z",
      ),
    ).toBe(keylessMapEmbedUrl("Joe's Plumbing & Drain"));
    expect(embeddableMapUrl("https://www.google.com/maps/search/?api=1&query=Woods+Auto")).toBe(
      keylessMapEmbedUrl("Woods Auto"),
    );
    expect(embeddableMapUrl("https://maps.google.com/?q=Triangle+Comfort+HVAC")).toBe(
      keylessMapEmbedUrl("Triangle Comfort HVAC"),
    );
    expect(embeddableMapUrl("https://www.google.com/maps/@35.7796,-78.6382,15z")).toBe(
      keylessMapEmbedUrl("35.7796,-78.6382"),
    );
  });

  it("leaves real embeds and other providers alone, and drops unframeable Google pages", () => {
    expect(embeddableMapUrl("https://www.google.com/maps/embed?pb=!1m18")).toBe(
      "https://www.google.com/maps/embed?pb=!1m18",
    );
    expect(embeddableMapUrl("https://www.google.com/maps?q=x&output=embed")).toBe(
      "https://www.google.com/maps?q=x&output=embed",
    );
    expect(embeddableMapUrl("https://calendly.com/revora")).toBe("https://calendly.com/revora");
    expect(embeddableMapUrl("https://www.google.com/search?q=revora")).toBeNull();
    expect(embeddableMapUrl("https://www.google.com/maps/dir/")).toBeNull();
  });

  it("readEmbed frames a pasted share link and an address-only map without a key", () => {
    expect(
      readEmbed({
        settings: { embed: { url: "https://www.google.com/maps/place/Elite+Mobile+Detail" } },
      })?.url,
    ).toBe(keylessMapEmbedUrl("Elite Mobile Detail"));
    const byAddress = readEmbed({ settings: { embed: { address: "5 Oak Ave, Durham NC" } } });
    expect(byAddress).toMatchObject({
      url: keylessMapEmbedUrl("5 Oak Ave, Durham NC"),
      title: "Google Maps embed",
    });
  });

  it("every map frame source is allowed by the CSP frame-src", () => {
    const frameSrc =
      CONTENT_SECURITY_POLICY.split("; ").find((part) => part.startsWith("frame-src")) ?? "";
    expect(frameSrc).toContain("https://www.google.com");
    expect(frameSrc).toContain("https://www.openstreetmap.org");
    expect(frameSrc).not.toContain("*");
  });
});
