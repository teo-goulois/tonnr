import { createFileRoute } from "@tanstack/react-router";
import { APP_NAME } from "@repo/config/app";

import { CountryHub } from "@/components/spot-pages/hubs";
import { SpotClosed, SpotNotFound } from "@/components/spot-pages/spot-frame";
import { fetchCountry } from "@/lib/pages-api";
import { SPOTS_ROOT } from "@/lib/public-pages";
import { m } from "@/paraglide/messages.js";

import { closedHead, closedHeaders, hubHead, loadPage } from "../-loading";

// The regions of a country that hold a listed surf break, with how many each. Decision 057.
export const Route = createFileRoute("/spots/$country/")({
  loader: ({ params }) => loadPage((site) => fetchCountry(params.country, site)),
  headers: ({ loaderData }) => closedHeaders(loaderData),
  head: ({ loaderData, params }) => {
    if (!loaderData || loaderData.closed) return closedHead();
    const country = loaderData.data;
    return hubHead(loaderData.site, `${SPOTS_ROOT}/${params.country}`, {
      title: m.page_hub_title({ name: country.name }),
      description: m.page_hub_description({
        count: country.listed,
        name: country.name,
        app: APP_NAME,
      }),
      crumbs: [{ name: m.page_spots(), page: SPOTS_ROOT }],
    });
  },
  component: Country,
  notFoundComponent: SpotNotFound,
});

function Country() {
  const loaded = Route.useLoaderData();
  if (!loaded || loaded.closed) return <SpotClosed />;
  return <CountryHub country={loaded.data} />;
}
