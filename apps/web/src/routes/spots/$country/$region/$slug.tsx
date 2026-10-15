import { createFileRoute, redirect } from "@tanstack/react-router";
import { APP_NAME } from "@repo/config/app";

import { SpotClosed, SpotNotFound } from "@/components/spot-pages/spot-frame";
import { SpotPage } from "@/components/spot-pages/spot-page";
import { type SpotPage as SpotPageData, fetchSpotPage } from "@/lib/pages-api";
import { pageLinks, pageMeta, placePicturePath } from "@/lib/public-pages";
import { jsonLdScript, spotDescription, spotJsonLd, spotPath } from "@/lib/spot-pages";
import { m } from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";

import { type Loaded, closedHead, closedHeaders, loadPage } from "../../-loading";

// The public page of a surf break, server-rendered for a reader who comes from a search engine:
// decision 057. The address of a break that was merged into another moves to the other's, for
// good. A break that does not stand on its own is served, and says `noindex`.
export const Route = createFileRoute("/spots/$country/$region/$slug")({
  loader: async ({ params }): Promise<Loaded<SpotPageData>> => {
    const loaded = await loadPage((site) => fetchSpotPage(params, site));
    if (loaded.closed) return loaded;
    if (loaded.data.moved) {
      throw redirect({
        to: "/spots/$country/$region/$slug",
        params: loaded.data.to,
        statusCode: 301,
      });
    }
    return { ...loaded, data: loaded.data };
  },
  headers: ({ loaderData }) => closedHeaders(loaderData),
  head: ({ loaderData, params }) => {
    if (!loaderData || loaderData.closed) return closedHead();
    const { site, data: page } = loaderData;
    const path = spotPath(params);
    const locale = getLocale();
    return {
      meta: [
        ...pageMeta(site, path, {
          title: `${m.page_meta_title({ name: page.break.name })} — ${APP_NAME}`,
          description: spotDescription(page),
          picture: {
            path: placePicturePath(locale),
            alt: m.place_picture_alt({ name: APP_NAME }),
          },
        }),
        // A break that does not stand on its own has a page, which no search engine is asked to list.
        ...(page.listed ? [] : [{ name: "robots", content: "noindex" }]),
      ],
      links: pageLinks(site, path),
      scripts: [jsonLdScript(spotJsonLd(site, page, path))],
    };
  },
  component: Spot,
  notFoundComponent: SpotNotFound,
});

function Spot() {
  const loaded = Route.useLoaderData();
  if (!loaded || loaded.closed) return <SpotClosed />;
  return <SpotPage page={loaded.data} now={loaded.now} />;
}
