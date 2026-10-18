import { createFileRoute } from "@tanstack/react-router";
import { APP_NAME, REPOSITORY_URL } from "@repo/config/app";

import { LandingPage } from "@/components/landing/landing-page";
import { pageAddress, pageLinks, pageMeta } from "@/lib/public-pages";
import { siteOrigin } from "@/lib/site";
import { m } from "@/paraglide/messages.js";
import { getLocale, locales } from "@/paraglide/runtime.js";

export const Route = createFileRoute("/")({
  // PROTOTYPE: which proposal for the section on spots is drawn.
  validateSearch: (search: Record<string, unknown>) => ({ trust: Number(search.trust) || 0 }),
  // The site's own address, which the page names in full where a relative one would not do.
  loader: () => ({ site: siteOrigin() }),
  head: ({ loaderData }) => {
    const site = loaderData?.site ?? "";
    const title = `${APP_NAME} — ${m.landing_meta_title()}`;
    const description = m.landing_meta_description({ name: APP_NAME });
    const here = pageAddress(site, "/", getLocale());

    return {
      meta: pageMeta(site, "/", { title, description }),
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
