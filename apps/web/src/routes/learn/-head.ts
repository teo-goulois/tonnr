import { APP_NAME } from "@repo/config/app";

import { learnRoot } from "@/components/learn/learn-frame";
import { pageLinks, pageMeta, pageAddress } from "@/lib/public-pages";
import { type Crumb, breadcrumbJsonLd, jsonLdScript } from "@/lib/spot-pages";
import { getLocale } from "@/paraglide/runtime.js";

// The head of a page of the guides: its title and description, its addresses in each language,
// and the path over it for a search engine. A guide is an article. Decision 060.

export function learnHead(
  site: string,
  path: string,
  {
    title,
    description,
    crumbs = [learnRoot()],
    article = false,
  }: { title: string; description: string; crumbs?: Crumb[]; article?: boolean },
) {
  const locale = getLocale();
  return {
    meta: pageMeta(site, path, { title: `${title} — ${APP_NAME}`, description }),
    links: pageLinks(site, path),
    scripts: [
      jsonLdScript(breadcrumbJsonLd(site, crumbs, { name: title, page: path })),
      ...(article
        ? [
            jsonLdScript({
              "@context": "https://schema.org",
              "@type": "Article",
              headline: title,
              description,
              url: pageAddress(site, path, locale),
              inLanguage: locale,
              isAccessibleForFree: true,
              author: { "@type": "Person", name: "Téo Goulois" },
              publisher: { "@type": "Organization", name: APP_NAME },
            }),
          ]
        : []),
    ],
  };
}
