import { createFileRoute } from "@tanstack/react-router";
import { APP_NAME, REPOSITORY_URL } from "@repo/config/app";

import { LandingPage } from "@/components/landing/landing-page";
import { pageAddress, pageLinks } from "@/lib/public-pages";
import { siteOrigin } from "@/lib/site";
import { m } from "@/paraglide/messages.js";
import { getLocale, locales } from "@/paraglide/runtime.js";

// The picture a link to the site is shown with, where a link is shared.
const SHARED_PICTURE = { path: "/landing/og.jpg", width: 1200, height: 630 };

export const Route = createFileRoute("/")({
  // The site's own address, which the page names in full where a relative one would not do.
  loader: () => ({ site: siteOrigin() }),
  head: ({ loaderData }) => {
    const site = loaderData?.site ?? "";
    const title = `${APP_NAME}: ${m.landing_hero_title()}`;
    const description = m.landing_meta_description();
    const here = pageAddress(site, "/", getLocale());

    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:site_name", content: APP_NAME },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: here },
        { property: "og:image", content: `${site}${SHARED_PICTURE.path}` },
        { property: "og:image:width", content: String(SHARED_PICTURE.width) },
        { property: "og:image:height", content: String(SHARED_PICTURE.height) },
        { property: "og:image:alt", content: m.landing_shot_alt() },
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: [
        ...pageLinks(site, "/"),
        // What a program reads of the site, in place of this page.
        { rel: "alternate", type: "text/markdown", href: `${site}/llms.txt`, title: "llms.txt" },
      ],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebApplication",
            name: APP_NAME,
            description,
            url: here,
            applicationCategory: "SportsApplication",
            operatingSystem: "Web",
            inLanguage: [...locales],
            isAccessibleForFree: true,
            offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
            license: "https://www.gnu.org/licenses/agpl-3.0.html",
            sameAs: REPOSITORY_URL,
            author: { "@type": "Person", name: "Téo Goulois" },
          }),
        },
      ],
    };
  },
  component: LandingPage,
});
