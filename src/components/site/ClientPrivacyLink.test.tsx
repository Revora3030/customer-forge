// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ClientPrivacyLink } from "@/components/site/ClientPrivacyNotice";
import { OwnAddressContext, SiteBaseContext } from "@/components/site/site-address-context";

describe("ClientPrivacyLink", () => {
  it("points at the business's own notice, never Revora's /privacy", () => {
    expect(renderToStaticMarkup(<ClientPrivacyLink slug="oak" />)).toContain(
      'href="/s/oak/privacy-notice"',
    );
    expect(
      renderToStaticMarkup(
        <OwnAddressContext.Provider value={true}>
          <ClientPrivacyLink slug="oak" />
        </OwnAddressContext.Provider>,
      ),
    ).toContain('href="/privacy-notice"');
    expect(
      renderToStaticMarkup(
        <SiteBaseContext.Provider value="/p/tok">
          <ClientPrivacyLink slug="oak" />
        </SiteBaseContext.Provider>,
      ),
    ).toContain('href="/p/tok/privacy-notice"');
  });
});
