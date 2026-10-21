import { describe, expect, it } from "vitest";
import { htmlToText, normaliseWikimediaResults, wikimediaLicenceCode, wikimediaSearchUrl, WIKIMEDIA_HEADERS } from "./wikimedia-photos";

type PageFixture = {
  pageid: number;
  index: number;
  title: string;
  license?: string;
  licenseUrl?: string;
  artist?: string;
  objectName?: string;
  thumburl?: string;
  url?: string;
};

const page = (fixture: PageFixture) => ({
  pageid: fixture.pageid,
  ns: 6,
  title: fixture.title,
  index: fixture.index,
  imageinfo: [{
    url: fixture.url ?? `https://upload.wikimedia.org/wikipedia/commons/a/ab/${fixture.pageid}.jpg`,
    thumburl: fixture.thumburl ?? `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/${fixture.pageid}.jpg/1600px-${fixture.pageid}.jpg`,
    thumbwidth: 1600,
    thumbheight: 1067,
    width: 4000,
    height: 2667,
    descriptionurl: `https://commons.wikimedia.org/wiki/File:${fixture.pageid}.jpg`,
    extmetadata: {
      ...(fixture.license ? { LicenseShortName: { value: fixture.license } } : {}),
      ...(fixture.licenseUrl ? { LicenseUrl: { value: fixture.licenseUrl } } : {}),
      ...(fixture.artist ? { Artist: { value: fixture.artist } } : {}),
      ...(fixture.objectName ? { ObjectName: { value: fixture.objectName } } : {}),
    },
  }],
});

const fixture = {
  batchcomplete: "",
  query: {
    pages: {
      "11": page({ pageid: 11, index: 2, title: "File:Car wash foam.jpg", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0", artist: '<a href="//commons.wikimedia.org/wiki/User:Jo">Jo &amp; Sam</a>', objectName: "Car wash foam" }),
      "12": page({ pageid: 12, index: 1, title: "File:Detailing_bay.png", license: "CC0", artist: "" }),
      "13": page({ pageid: 13, index: 3, title: "File:Nc.jpg", license: "CC BY-NC 4.0", artist: "Lee" }),
      "14": page({ pageid: 14, index: 4, title: "File:Unknown.jpg", license: "Some custom licence", artist: "Lee" }),
      "15": page({ pageid: 15, index: 5, title: "File:Plain.jpg", license: "CC BY 4.0", artist: "Lee", thumburl: "http://upload.wikimedia.org/insecure.jpg", url: "http://upload.wikimedia.org/insecure-original.jpg" }),
      "16": page({ pageid: 16, index: 6, title: "File:Nd.jpg", license: "CC BY-ND 2.0", artist: "Lee" }),
      "17": page({ pageid: 17, index: 7, title: "File:Anon.jpg", license: "CC BY 3.0" }),
      "18": page({ pageid: 18, index: 8, title: "File:Old_garage.jpg", license: "Public domain" }),
    },
  },
};

describe("wikimediaSearchUrl", () => {
  it("asks Commons for bitmap files with licence metadata", () => {
    const url = wikimediaSearchUrl("foam wash");
    expect(url.origin + url.pathname).toBe("https://commons.wikimedia.org/w/api.php");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      action: "query",
      generator: "search",
      gsrnamespace: "6",
      gsrsearch: "foam wash filetype:bitmap",
      gsrlimit: "8",
      prop: "imageinfo",
      iiprop: "url|extmetadata|size",
      iiurlwidth: "1600",
      format: "json",
    });
    expect(WIKIMEDIA_HEADERS["Api-User-Agent"]).toBe("RevoraGrowthSystems/1.0 (+https://revoragrowthsystems.com)");
  });
});

describe("wikimediaLicenceCode", () => {
  it("recognises only plain CC, CC0 and public domain names", () => {
    expect(wikimediaLicenceCode("CC BY-SA 4.0")).toBe("by-sa");
    expect(wikimediaLicenceCode("CC BY 4.0")).toBe("by");
    expect(wikimediaLicenceCode("CC0")).toBe("cc0");
    expect(wikimediaLicenceCode("Public domain")).toBe("pdm");
    expect(wikimediaLicenceCode("CC BY-NC 4.0")).toBe("by-nc");
    expect(wikimediaLicenceCode("GFDL")).toBeNull();
    expect(wikimediaLicenceCode("CC BY-SA 3.0 de")).toBeNull();
    expect(wikimediaLicenceCode(undefined)).toBeNull();
  });
});

describe("normaliseWikimediaResults", () => {
  const photos = normaliseWikimediaResults(fixture);

  it("keeps commercial licences in search order and drops NC, ND, unknown, non-https and uncreditable files", () => {
    expect(photos.map((photo) => [photo.id, photo.licenseCode])).toEqual([
      ["12", "cc0"],
      ["11", "by-sa"],
      ["18", "pdm"],
    ]);
  });

  it("strips Artist HTML and writes the exact credit line with provenance", () => {
    const bySa = photos.find((photo) => photo.id === "11")!;
    expect(bySa).toMatchObject({
      provider: "wikimedia",
      creator: "Jo & Sam",
      title: "Car wash foam",
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/11.jpg/1600px-11.jpg",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      sourcePage: "https://commons.wikimedia.org/wiki/File:11.jpg",
      width: 1600,
      height: 1067,
    });
    expect(bySa.attribution).toBe('"Car wash foam" by Jo & Sam, CC BY-SA 4.0 via Wikimedia Commons');
  });

  it("falls back to the file name and an unknown author only for licences that need no credit", () => {
    const cc0 = photos.find((photo) => photo.id === "12")!;
    expect(cc0.creator).toBeNull();
    expect(cc0.licenseUrl).toBeNull();
    expect(cc0.attribution).toBe('"Detailing bay" by an unknown author, CC0 via Wikimedia Commons');
  });

  it("returns nothing for malformed responses", () => {
    expect(normaliseWikimediaResults(null)).toEqual([]);
    expect(normaliseWikimediaResults({ query: {} })).toEqual([]);
    expect(normaliseWikimediaResults({ error: { code: "x" } })).toEqual([]);
  });
});

describe("htmlToText", () => {
  it("removes tags and decodes entities", () => {
    expect(htmlToText('<span class="fn"><a href="x">Ana&#39;s&nbsp;studio</a></span>')).toBe("Ana's studio");
    expect(htmlToText("<script>x</script>")).toBe("x");
    expect(htmlToText("   ")).toBeNull();
  });
});
